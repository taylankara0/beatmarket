import { createHash } from 'crypto';

import {
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';

import {
  consumeApiRateLimit,
} from '@/lib/apiRateLimit';
import { r2Client } from '@/lib/r2';

export const runtime = 'nodejs';

const AVATAR_VIEW_RATE_LIMIT_MAX_REQUESTS = 300;
const AVATAR_VIEW_RATE_LIMIT_WINDOW_SECONDS = 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_IMAGE_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

const ALLOWED_IMAGE_EXTENSIONS =
  new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
  ]);

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    throw new Error(
      'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is missing.'
    );
  }

  return createSupabaseAdminClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function getClientRateLimitIdentifier(
  request
) {
  const forwardedFor =
    request.headers.get(
      'x-forwarded-for'
    );

  const forwardedIp =
    forwardedFor
      ?.split(',')[0]
      ?.trim();

  const realIp =
    request.headers
      .get('x-real-ip')
      ?.trim();

  const clientIdentifier =
    forwardedIp ||
    realIp ||
    'unknown';

  return createHash('sha256')
    .update(
      clientIdentifier.slice(
        0,
        200
      )
    )
    .digest('hex');
}

function normalizeContentType(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .toLowerCase()
    .split(';')[0]
    .trim();
}

function getFileExtension(fileKey) {
  const dotIndex =
    fileKey.lastIndexOf('.');

  if (dotIndex === -1) {
    return '';
  }

  return fileKey
    .slice(dotIndex)
    .toLowerCase();
}

function isValidAvatarKey(
  fileKey,
  profileId
) {
  if (typeof fileKey !== 'string') {
    return false;
  }

  const expectedPrefix =
    `avatars/${profileId}/`;

  if (
    !fileKey.startsWith(
      expectedPrefix
    )
  ) {
    return false;
  }

  const remainingPath =
    fileKey.slice(
      expectedPrefix.length
    );

  if (
    !remainingPath ||
    remainingPath.includes('/') ||
    remainingPath.includes('\\') ||
    remainingPath.includes('..')
  ) {
    return false;
  }

  return ALLOWED_IMAGE_EXTENSIONS.has(
    getFileExtension(fileKey)
  );
}

function createErrorResponse(
  message,
  status
) {
  return new Response(
    message,
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options':
          'nosniff',
      },
    }
  );
}

export async function GET(
  request,
  { params }
) {
  try {
    const resolvedParams =
      await params;

    const profileId =
      String(
        resolvedParams?.profileId || ''
      ).trim();

    if (
      !UUID_PATTERN.test(profileId)
    ) {
      return createErrorResponse(
        'Profile picture not found.',
        404
      );
    }

    const supabaseAdmin =
      getSupabaseAdmin();

    const rateLimitResult =
      await consumeApiRateLimit({
        supabaseAdmin,
        rateKey:
          `profile-avatar-view:ip:${getClientRateLimitIdentifier(
            request
          )}`,
        maxRequests:
          AVATAR_VIEW_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds:
          AVATAR_VIEW_RATE_LIMIT_WINDOW_SECONDS,
      });

    if (!rateLimitResult.allowed) {
      return new Response(
        'Too many profile-picture requests. Please wait before trying again.',
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(
              Math.max(
                1,
                rateLimitResult
                  .retryAfterSeconds
              )
            ),
            'X-Content-Type-Options':
              'nosniff',
          },
        }
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        avatar_url
      `)
      .eq('id', profileId)
      .maybeSingle();

    if (profileError) {
      console.error(
        'Profile avatar lookup error:',
        profileError
      );

      return createErrorResponse(
        'Profile picture could not be retrieved.',
        500
      );
    }

    if (
      !profile ||
      !isValidAvatarKey(
        profile.avatar_url,
        profileId
      )
    ) {
      return createErrorResponse(
        'Profile picture not found.',
        404
      );
    }

    const bucketName =
      process.env.R2_BUCKET_NAME;

    if (!bucketName) {
      throw new Error(
        'R2_BUCKET_NAME is missing.'
      );
    }

    const command =
      new GetObjectCommand({
        Bucket: bucketName,
        Key: profile.avatar_url,
      });

    const r2Response =
      await r2Client.send(command);

    if (!r2Response.Body) {
      return createErrorResponse(
        'Profile picture not found.',
        404
      );
    }

    const responseContentType =
      normalizeContentType(
        r2Response.ContentType
      );

    if (
      !ALLOWED_IMAGE_TYPES.has(
        responseContentType
      )
    ) {
      console.error(
        'Profile avatar content type is invalid:',
        responseContentType
      );

      return createErrorResponse(
        'Profile picture not found.',
        404
      );
    }

    if (
      r2Response.Metadata?.owner !==
        profileId ||
      r2Response.Metadata
        ?.uploadtype !== 'avatar'
    ) {
      console.error(
        'Profile avatar metadata verification failed.'
      );

      return createErrorResponse(
        'Profile picture not found.',
        404
      );
    }

    const headers =
      new Headers();

    headers.set(
      'Content-Type',
      responseContentType
    );

    headers.set(
      'Cache-Control',
      'public, max-age=3600, s-maxage=3600'
    );

    headers.set(
      'Content-Disposition',
      'inline'
    );

    headers.set(
      'X-Content-Type-Options',
      'nosniff'
    );

    headers.set(
      'Cross-Origin-Resource-Policy',
      'same-origin'
    );

    if (
      r2Response.ContentLength !==
      undefined
    ) {
      headers.set(
        'Content-Length',
        String(
          r2Response.ContentLength
        )
      );
    }

    if (r2Response.ETag) {
      headers.set(
        'ETag',
        r2Response.ETag
      );
    }

    if (r2Response.LastModified) {
      headers.set(
        'Last-Modified',
        r2Response.LastModified
          .toUTCString()
      );
    }

    return new Response(
      r2Response.Body,
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    console.error(
      'Secure profile avatar retrieval error:',
      error
    );

    return createErrorResponse(
      'Profile picture not found.',
      404
    );
  }
}