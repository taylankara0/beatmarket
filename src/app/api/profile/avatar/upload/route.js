import { randomUUID } from 'crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  consumeApiRateLimit,
} from '@/lib/apiRateLimit';
import { r2Client } from '@/lib/r2';
import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';

export const runtime = 'nodejs';

const MEGABYTE = 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * MEGABYTE;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const MAX_FILENAME_LENGTH = 180;

const AVATAR_RATE_LIMIT_MAX_REQUESTS = 10;
const AVATAR_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

const ALLOWED_AVATAR_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

function createJsonResponse(
  body,
  init = {}
) {
  const headers =
    new Headers(init.headers);

  headers.set(
    'Cache-Control',
    'no-store'
  );

  return NextResponse.json(
    body,
    {
      ...init,
      headers,
    }
  );
}

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
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

async function getSupabaseAuthClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            /*
              The authenticated session can still be
              read when cookies cannot be updated.
            */
          }
        },
      },
    }
  );
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

function getSafeFilename(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const baseFilename = value
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim();

  if (!baseFilename) {
    return null;
  }

  const safeFilename = baseFilename
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, MAX_FILENAME_LENGTH);

  if (
    !safeFilename ||
    !safeFilename.includes('.')
  ) {
    return null;
  }

  return safeFilename;
}

function getFileExtension(filename) {
  const dotIndex =
    filename.lastIndexOf('.');

  if (dotIndex === -1) {
    return '';
  }

  return filename
    .slice(dotIndex)
    .toLowerCase();
}

function isAllowedAvatarFile({
  filename,
  contentType,
}) {
  const allowedExtensions =
    ALLOWED_AVATAR_TYPES[contentType];

  if (!allowedExtensions) {
    return false;
  }

  const extension =
    getFileExtension(filename);

  return allowedExtensions.includes(
    extension
  );
}

function getStorageExtension(
  contentType
) {
  switch (contentType) {
    case 'image/jpeg':
      return '.jpg';

    case 'image/png':
      return '.png';

    case 'image/webp':
      return '.webp';

    default:
      return '';
  }
}

async function readJsonBody(request) {
  const contentType =
    normalizeContentType(
      request.headers.get(
        'content-type'
      )
    );

  if (
    contentType !== 'application/json'
  ) {
    return {
      success: false,
      status: 415,
      error:
        'The avatar upload request must use application/json.',
    };
  }

  const contentLengthHeader =
    request.headers.get(
      'content-length'
    );

  if (contentLengthHeader) {
    const contentLength =
      Number(contentLengthHeader);

    if (
      !Number.isSafeInteger(
        contentLength
      ) ||
      contentLength < 0
    ) {
      return {
        success: false,
        status: 400,
        error:
          'The avatar upload request length is invalid.',
      };
    }

    if (
      contentLength >
      MAX_REQUEST_BODY_BYTES
    ) {
      return {
        success: false,
        status: 413,
        error:
          'The avatar upload request is too large.',
      };
    }
  }

  try {
    const bodyText =
      await request.text();

    const bodyByteLength =
      new TextEncoder().encode(
        bodyText
      ).byteLength;

    if (
      bodyByteLength >
      MAX_REQUEST_BODY_BYTES
    ) {
      return {
        success: false,
        status: 413,
        error:
          'The avatar upload request is too large.',
      };
    }

    if (!bodyText.trim()) {
      return {
        success: false,
        status: 400,
        error:
          'The avatar upload request is invalid.',
      };
    }

    return {
      success: true,
      body: JSON.parse(bodyText),
    };
  } catch {
    return {
      success: false,
      status: 400,
      error:
        'The avatar upload request is invalid.',
    };
  }
}

export async function POST(request) {
  try {
    const supabase =
      await getSupabaseAuthClient();

    const {
      data: { user },
      error: authError,
    } =
      await supabase.auth.getUser();

    if (authError || !user) {
      return createJsonResponse(
        {
          success: false,
          error:
            'You must be signed in before changing your profile picture.',
        },
        {
          status: 401,
        }
      );
    }

    const supabaseAdmin =
      getSupabaseAdmin();

    const rateLimitResult =
      await consumeApiRateLimit({
        supabaseAdmin,
        rateKey:
          `profile-avatar-upload:user:${user.id}`,
        maxRequests:
          AVATAR_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds:
          AVATAR_RATE_LIMIT_WINDOW_SECONDS,
      });

    if (!rateLimitResult.allowed) {
      return createJsonResponse(
        {
          success: false,
          error:
            'Too many profile-picture upload attempts. Please wait before trying again.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(
                1,
                rateLimitResult.retryAfterSeconds
              )
            ),
          },
        }
      );
    }

    const bodyResult =
      await readJsonBody(request);

    if (!bodyResult.success) {
      return createJsonResponse(
        {
          success: false,
          error: bodyResult.error,
        },
        {
          status: bodyResult.status,
        }
      );
    }

    const filename =
      bodyResult.body?.filename;

    const contentType =
      normalizeContentType(
        bodyResult.body?.contentType
      );

    const fileSize =
      Number(
        bodyResult.body?.fileSize
      );

    if (
      typeof filename !== 'string' ||
      !contentType ||
      !Number.isSafeInteger(fileSize)
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'Missing or invalid filename, content type, or file size.',
        },
        {
          status: 400,
        }
      );
    }

    if (fileSize <= 0) {
      return createJsonResponse(
        {
          success: false,
          error:
            'The selected image file is empty.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      fileSize > MAX_AVATAR_BYTES
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'The profile picture cannot exceed 5 MB.',
        },
        {
          status: 413,
        }
      );
    }

    const safeFilename =
      getSafeFilename(filename);

    if (!safeFilename) {
      return createJsonResponse(
        {
          success: false,
          error:
            'The selected image has an invalid filename.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      !isAllowedAvatarFile({
        filename: safeFilename,
        contentType,
      })
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'The profile picture must be a JPG, PNG, or WebP image.',
        },
        {
          status: 400,
        }
      );
    }

    const bucketName =
      process.env.R2_BUCKET_NAME;

    if (!bucketName) {
      throw new Error(
        'R2_BUCKET_NAME is missing.'
      );
    }

    const storageExtension =
      getStorageExtension(
        contentType
      );

    const fileKey = [
      'avatars',
      user.id,
      `${randomUUID()}${storageExtension}`,
    ].join('/');

    const objectMetadata = {
      owner: user.id,
      originalfilename: safeFilename,
      uploadtype: 'avatar',
      expectedbytes: String(fileSize),
    };

    const uploadHeaders = {
      'Content-Type': contentType,
      'x-amz-meta-owner':
        objectMetadata.owner,
      'x-amz-meta-originalfilename':
        objectMetadata.originalfilename,
      'x-amz-meta-uploadtype':
        objectMetadata.uploadtype,
      'x-amz-meta-expectedbytes':
        objectMetadata.expectedbytes,
    };

    const command =
      new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        ContentType: contentType,
        ContentLength: fileSize,
        Metadata: objectMetadata,
      });

    const uploadUrl =
      await getSignedUrl(
        r2Client,
        command,
        {
          expiresIn: 60,
          unhoistableHeaders:
            new Set([
              'x-amz-meta-owner',
              'x-amz-meta-originalfilename',
              'x-amz-meta-uploadtype',
              'x-amz-meta-expectedbytes',
            ]),
          signableHeaders:
            new Set([
              'content-type',
            ]),
        }
      );

    return createJsonResponse({
      success: true,
      uploadUrl,
      uploadHeaders,
      fileKey,
      maximumBytes:
        MAX_AVATAR_BYTES,
    });
  } catch (error) {
    console.error(
      'Profile avatar upload authorization error:',
      error
    );

    return createJsonResponse(
      {
        success: false,
        error:
          'The profile-picture upload could not be started.',
      },
      {
        status: 500,
      }
    );
  }
}