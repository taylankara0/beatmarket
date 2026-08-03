import {
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

import {
  getSignedUrl,
} from '@aws-sdk/s3-request-presigner';

import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';

import {
  createServerClient,
} from '@supabase/ssr';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  consumeApiRateLimit,
} from '@/lib/apiRateLimit';

import {
  FREE_BEAT_LICENSE_VERSION,
  isAcceptedFreeBeatLicenseVersion,
} from '@/lib/freeBeatLicense';

import { r2Client } from '@/lib/r2';

export const runtime = 'nodejs';

const DOWNLOAD_RATE_LIMIT_MAX_REQUESTS = 20;
const DOWNLOAD_RATE_LIMIT_WINDOW_SECONDS = 60;

const MAX_REQUEST_BODY_BYTES = 8 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function getSupabaseAuthClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !supabaseUrl ||
    !supabaseAnonKey
  ) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.'
    );
  }

  const cookieStore =
    await cookies();

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
              Authentication can still be read if cookies
              cannot be updated in this request context.
            */
          }
        },
      },
    }
  );
}

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

function normalizeContentType(
  value
) {
  return String(value || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}

async function readJsonBodyWithLimit(
  request
) {
  const contentType =
    normalizeContentType(
      request.headers.get(
        'content-type'
      )
    );

  if (
    contentType !==
    'application/json'
  ) {
    return {
      success: false,
      status: 415,
      error:
        'The free-download request must use application/json.',
    };
  }

  const contentLengthHeader =
    request.headers.get(
      'content-length'
    );

  if (contentLengthHeader) {
    const normalizedContentLength =
      contentLengthHeader.trim();

    if (
      !/^\d+$/.test(
        normalizedContentLength
      )
    ) {
      return {
        success: false,
        status: 400,
        error:
          'The free-download request body length is invalid.',
      };
    }

    const declaredContentLength =
      Number(
        normalizedContentLength
      );

    if (
      !Number.isSafeInteger(
        declaredContentLength
      )
    ) {
      return {
        success: false,
        status: 400,
        error:
          'The free-download request body length is invalid.',
      };
    }

    if (
      declaredContentLength >
      MAX_REQUEST_BODY_BYTES
    ) {
      return {
        success: false,
        status: 413,
        error:
          'The free-download request body is too large.',
      };
    }
  }

  if (!request.body) {
    return {
      success: false,
      status: 400,
      error:
        'The free-download request body is invalid.',
    };
  }

  const reader =
    request.body.getReader();

  const decoder =
    new TextDecoder(
      'utf-8',
      {
        fatal: true,
      }
    );

  let totalBytes = 0;
  let bodyText = '';

  try {
    while (true) {
      const {
        done,
        value,
      } = await reader.read();

      if (done) {
        break;
      }

      totalBytes +=
        value.byteLength;

      if (
        totalBytes >
        MAX_REQUEST_BODY_BYTES
      ) {
        try {
          await reader.cancel();
        } catch {
          /*
            The request is already being rejected.
          */
        }

        return {
          success: false,
          status: 413,
          error:
            'The free-download request body is too large.',
        };
      }

      bodyText += decoder.decode(
        value,
        {
          stream: true,
        }
      );
    }

    bodyText += decoder.decode();
  } catch {
    return {
      success: false,
      status: 400,
      error:
        'The free-download request body is invalid.',
    };
  }

  if (!bodyText.trim()) {
    return {
      success: false,
      status: 400,
      error:
        'The free-download request body is invalid.',
    };
  }

  try {
    return {
      success: true,
      body:
        JSON.parse(bodyText),
    };
  } catch {
    return {
      success: false,
      status: 400,
      error:
        'The free-download request body is invalid.',
    };
  }
}

function sanitizeDownloadName(
  value
) {
  const sanitizedValue =
    String(
      value ||
      'free-beat'
    )
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      )
      .replace(
        /_+/g,
        '_'
      )
      .replace(
        /^_+|_+$/g,
        ''
      );

  return (
    sanitizedValue ||
    'free-beat'
  );
}

function getFileExtension(
  fileKey
) {
  const keyWithoutQuery =
    String(fileKey || '')
      .split('?')[0];

  const possibleExtension =
    keyWithoutQuery
      .split('.')
      .pop()
      ?.toLowerCase() || '';

  if (
    [
      'mp3',
      'wav',
      'flac',
    ].includes(
      possibleExtension
    )
  ) {
    return possibleExtension;
  }

  return 'audio';
}

export async function POST(
  request,
  { params }
) {
  try {
    const resolvedParams =
      await params;

    const beatId =
      resolvedParams?.beatId
        ?.trim();

    if (
      !beatId ||
      !UUID_PATTERN.test(
        beatId
      )
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'A valid beat ID is required.',
        },
        {
          status: 400,
        }
      );
    }

    const supabaseAuth =
      await getSupabaseAuthClient();

    const {
      data: { user },
      error: authError,
    } =
      await supabaseAuth.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'You must be signed in to download this free beat.',
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
          `free-download:user:${user.id}`,

        maxRequests:
          DOWNLOAD_RATE_LIMIT_MAX_REQUESTS,

        windowSeconds:
          DOWNLOAD_RATE_LIMIT_WINDOW_SECONDS,
      });

    if (!rateLimitResult.allowed) {
      return createJsonResponse(
        {
          success: false,
          error:
            'Too many download requests. Please wait before trying again.',
        },
        {
          status: 429,

          headers: {
            'Retry-After':
              String(
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

    const requestBodyResult =
      await readJsonBodyWithLimit(
        request
      );

    if (!requestBodyResult.success) {
      return createJsonResponse(
        {
          success: false,
          error:
            requestBodyResult.error,
        },
        {
          status:
            requestBodyResult.status,
        }
      );
    }

    const requestBody =
      requestBodyResult.body;

    if (
      requestBody?.accepted !==
      true
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'You must accept the free-beat license before downloading.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      !isAcceptedFreeBeatLicenseVersion(
        requestBody?.licenseVersion
      )
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'The accepted free-beat license version is invalid or outdated.',
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: beat,
      error: beatError,
    } = await supabaseAdmin
      .from('beats')
      .select(`
        id,
        title,
        producer_id,
        untagged_file_key,
        is_sold_exclusive,
        is_free_download_enabled
      `)
      .eq('id', beatId)
      .maybeSingle();

    if (beatError) {
      console.error(
        'Free beat download lookup error:',
        beatError
      );

      throw new Error(
        'The free beat could not be retrieved.'
      );
    }

    if (!beat) {
      return createJsonResponse(
        {
          success: false,
          error:
            'Beat not found.',
        },
        {
          status: 404,
        }
      );
    }

    if (
      beat.is_sold_exclusive ===
      true
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'This beat is no longer available for free download.',
        },
        {
          status: 403,
        }
      );
    }

    if (
      beat.is_free_download_enabled !==
      true
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'Free downloads are currently disabled for this beat.',
        },
        {
          status: 403,
        }
      );
    }

    if (
      !beat.untagged_file_key
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            'The free-download master file is not available.',
        },
        {
          status: 404,
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

    try {
      await r2Client.send(
        new HeadObjectCommand({
          Bucket:
            bucketName,

          Key:
            beat.untagged_file_key,
        })
      );
    } catch (storageError) {
      console.error(
        'Free beat master file lookup error:',
        storageError
      );

      return createJsonResponse(
        {
          success: false,
          error:
            'The free-download master file could not be found in private storage.',
        },
        {
          status: 404,
        }
      );
    }

    const extension =
      getFileExtension(
        beat.untagged_file_key
      );

    const safeBeatTitle =
      sanitizeDownloadName(
        beat.title
      );

    const filename =
      `${safeBeatTitle}-free-beat.${extension}`;

    const command =
      new GetObjectCommand({
        Bucket:
          bucketName,

        Key:
          beat.untagged_file_key,

        ResponseContentDisposition:
          `attachment; filename="${filename}"`,
      });

    const downloadUrl =
      await getSignedUrl(
        r2Client,
        command,
        {
          expiresIn: 60,
        }
      );

    const now =
      new Date().toISOString();

    const {
      error: downloadRecordError,
    } = await supabaseAdmin
      .from(
        'free_beat_downloads'
      )
      .insert({
        beat_id:
          beat.id,

        downloader_id:
          user.id,

        license_version:
          FREE_BEAT_LICENSE_VERSION,

        accepted_at:
          now,

        downloaded_at:
          now,
      });

    if (downloadRecordError) {
      console.error(
        'Free beat download record error:',
        downloadRecordError
      );

      throw new Error(
        'The free-beat license acceptance could not be recorded.'
      );
    }

    return createJsonResponse(
      {
        success: true,

        downloadUrl,

        filename,

        expiresIn: 60,

        licenseVersion:
          FREE_BEAT_LICENSE_VERSION,
      }
    );
  } catch (error) {
    console.error(
      'Secure free beat download error:',
      error
    );

    return createJsonResponse(
      {
        success: false,
        error:
          'The secure free-download link could not be generated.',
      },
      {
        status: 500,
      }
    );
  }
}