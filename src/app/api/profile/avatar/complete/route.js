import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  consumeApiRateLimit,
} from '@/lib/apiRateLimit';
import { r2Client } from '@/lib/r2';

export const runtime = 'nodejs';

const MEGABYTE = 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * MEGABYTE;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;

const COMPLETE_RATE_LIMIT_MAX_REQUESTS = 10;
const COMPLETE_RATE_LIMIT_WINDOW_SECONDS =
  10 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AVATAR_FORMATS = {
  'image/jpeg': {
    extension: '.jpg',
    signature: 'jpeg',
  },

  'image/png': {
    extension: '.png',
    signature: 'png',
  },

  'image/webp': {
    extension: '.webp',
    signature: 'webp',
  },
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
              Authentication can still be read when
              cookies cannot be updated here.
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

function parseExpectedBytes(value) {
  const numericValue =
    Number(value);

  if (
    !Number.isSafeInteger(
      numericValue
    ) ||
    numericValue <= 0
  ) {
    return null;
  }

  return numericValue;
}

function isValidAvatarKey(
  fileKey,
  userId
) {
  if (typeof fileKey !== 'string') {
    return false;
  }

  const segments =
    fileKey.split('/');

  if (segments.length !== 3) {
    return false;
  }

  const [
    rootDirectory,
    storedUserId,
    filename,
  ] = segments;

  if (
    rootDirectory !== 'avatars' ||
    storedUserId !== userId
  ) {
    return false;
  }

  const dotIndex =
    filename.lastIndexOf('.');

  if (dotIndex <= 0) {
    return false;
  }

  const objectId =
    filename.slice(0, dotIndex);

  const extension =
    filename
      .slice(dotIndex)
      .toLowerCase();

  return (
    UUID_PATTERN.test(objectId) &&
    (
      extension === '.jpg' ||
      extension === '.png' ||
      extension === '.webp'
    )
  );
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

async function readJsonBody(request) {
  const requestContentType =
    normalizeContentType(
      request.headers.get(
        'content-type'
      )
    );

  if (
    requestContentType !==
    'application/json'
  ) {
    return {
      success: false,
      status: 415,
      error:
        'The profile-picture request must use application/json.',
    };
  }

  const contentLengthHeader =
    request.headers.get(
      'content-length'
    );

  if (contentLengthHeader) {
    const normalizedLength =
      contentLengthHeader.trim();

    if (
      !/^\d+$/.test(
        normalizedLength
      )
    ) {
      return {
        success: false,
        status: 400,
        error:
          'The profile-picture request length is invalid.',
      };
    }

    const contentLength =
      Number(normalizedLength);

    if (
      !Number.isSafeInteger(
        contentLength
      )
    ) {
      return {
        success: false,
        status: 400,
        error:
          'The profile-picture request length is invalid.',
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
          'The profile-picture request is too large.',
      };
    }
  }

  try {
    const bodyText =
      await request.text();

    const bodyBytes =
      new TextEncoder().encode(
        bodyText
      ).byteLength;

    if (
      bodyBytes >
      MAX_REQUEST_BODY_BYTES
    ) {
      return {
        success: false,
        status: 413,
        error:
          'The profile-picture request is too large.',
      };
    }

    if (!bodyText.trim()) {
      return {
        success: false,
        status: 400,
        error:
          'The profile-picture request is invalid.',
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
        'The profile-picture request is invalid.',
    };
  }
}

async function readObjectBytes(body) {
  if (!body) {
    return new Uint8Array();
  }

  if (
    typeof body.transformToByteArray ===
    'function'
  ) {
    return new Uint8Array(
      await body.transformToByteArray()
    );
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of body) {
    const normalizedChunk =
      chunk instanceof Uint8Array
        ? chunk
        : new Uint8Array(chunk);

    chunks.push(normalizedChunk);
    totalBytes +=
      normalizedChunk.byteLength;
  }

  const combined =
    new Uint8Array(totalBytes);

  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

function hasValidImageSignature(
  bytes,
  signature
) {
  if (!(bytes instanceof Uint8Array)) {
    return false;
  }

  if (signature === 'jpeg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (signature === 'png') {
    const pngSignature = [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ];

    return (
      bytes.length >=
        pngSignature.length &&
      pngSignature.every(
        (value, index) =>
          bytes[index] === value
      )
    );
  }

  if (signature === 'webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  return false;
}

async function deleteObjectSafely(
  bucketName,
  fileKey
) {
  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
      })
    );

    return true;
  } catch (error) {
    console.error(
      'Profile avatar cleanup error:',
      error
    );

    return false;
  }
}

export async function POST(request) {
  try {
    const supabaseAuth =
      await getSupabaseAuthClient();

    const {
      data: { user },
      error: authError,
    } =
      await supabaseAuth.auth.getUser();

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
          `profile-avatar-complete:user:${user.id}`,
        maxRequests:
          COMPLETE_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds:
          COMPLETE_RATE_LIMIT_WINDOW_SECONDS,
      });

    if (!rateLimitResult.allowed) {
      return createJsonResponse(
        {
          success: false,
          error:
            'Too many profile-picture changes. Please wait before trying again.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(
                1,
                rateLimitResult
                  .retryAfterSeconds
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

    const fileKey =
      typeof bodyResult.body?.fileKey ===
        'string'
        ? bodyResult.body.fileKey.trim()
        : '';

    if (
      !isValidAvatarKey(
        fileKey,
        user.id
      )
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'The uploaded profile-picture key is invalid.',
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

    let objectInformation;

    try {
      objectInformation =
        await r2Client.send(
          new HeadObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
          })
        );
    } catch (error) {
      console.error(
        'Profile avatar inspection error:',
        error
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'The uploaded profile picture could not be found.',
        },
        {
          status: 400,
        }
      );
    }

    const contentType =
      normalizeContentType(
        objectInformation.ContentType
      );

    const formatPolicy =
      AVATAR_FORMATS[contentType];

    const contentLength =
      Number(
        objectInformation.ContentLength ||
        0
      );

    const metadata =
      objectInformation.Metadata || {};

    const expectedBytes =
      parseExpectedBytes(
        metadata.expectedbytes
      );

    const fileExtension =
      getFileExtension(fileKey);

    if (
      !formatPolicy ||
      fileExtension !==
        formatPolicy.extension
    ) {
      await deleteObjectSafely(
        bucketName,
        fileKey
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'The uploaded file is not a valid JPG, PNG, or WebP image.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      metadata.owner !== user.id ||
      metadata.uploadtype !== 'avatar'
    ) {
      await deleteObjectSafely(
        bucketName,
        fileKey
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'The uploaded profile picture does not belong to your account.',
        },
        {
          status: 403,
        }
      );
    }

    if (
      !Number.isSafeInteger(
        contentLength
      ) ||
      contentLength <= 0 ||
      contentLength >
        MAX_AVATAR_BYTES
    ) {
      await deleteObjectSafely(
        bucketName,
        fileKey
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'The uploaded profile picture has an invalid size.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      expectedBytes === null ||
      expectedBytes !== contentLength
    ) {
      await deleteObjectSafely(
        bucketName,
        fileKey
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'The uploaded profile-picture size does not match the authorized size.',
        },
        {
          status: 400,
        }
      );
    }

    let signatureBytes;

    try {
      const signatureResponse =
        await r2Client.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
            Range: 'bytes=0-15',
          })
        );

      signatureBytes =
        await readObjectBytes(
          signatureResponse.Body
        );
    } catch (error) {
      console.error(
        'Profile avatar signature inspection error:',
        error
      );

      await deleteObjectSafely(
        bucketName,
        fileKey
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'The uploaded profile picture could not be verified.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      !hasValidImageSignature(
        signatureBytes,
        formatPolicy.signature
      )
    ) {
      await deleteObjectSafely(
        bucketName,
        fileKey
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'The selected file is not a valid image.',
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: currentProfile,
      error: profileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (
      profileError ||
      !currentProfile
    ) {
      console.error(
        'Profile avatar profile lookup error:',
        profileError
      );

      await deleteObjectSafely(
        bucketName,
        fileKey
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'Your profile could not be loaded.',
        },
        {
          status: 500,
        }
      );
    }

    const previousAvatarKey =
      currentProfile.avatar_url;

    const {
      error: updateError,
    } = await supabaseAdmin
      .from('profiles')
      .update({
        avatar_url: fileKey,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error(
        'Profile avatar update error:',
        updateError
      );

      await deleteObjectSafely(
        bucketName,
        fileKey
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'Your profile picture could not be saved.',
        },
        {
          status: 500,
        }
      );
    }

    if (
      previousAvatarKey !== fileKey &&
      isValidAvatarKey(
        previousAvatarKey,
        user.id
      )
    ) {
      await deleteObjectSafely(
        bucketName,
        previousAvatarKey
      );
    }

    const avatarPath =
      `/api/profile/avatar/${user.id}?v=${Date.now()}`;

    return createJsonResponse({
      success: true,
      avatarPath,
    });
  } catch (error) {
    console.error(
      'Profile avatar completion error:',
      error
    );

    return createJsonResponse(
      {
        success: false,
        error:
          'Your profile picture could not be saved.',
      },
      {
        status: 500,
      }
    );
  }
}