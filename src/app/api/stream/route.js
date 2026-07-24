import {
  GetObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';

import {
  createClient as createSupabaseAdminClient
} from '@supabase/supabase-js';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const s3 = new S3Client({
  region: 'auto',

  endpoint:
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

  credentials: {
    accessKeyId:
      process.env.R2_ACCESS_KEY_ID,

    secretAccessKey:
      process.env.R2_SECRET_ACCESS_KEY
  }
});

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
        persistSession: false
      }
    }
  );
}

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const beatId =
      searchParams.get('beatId')?.trim();

    if (
      !beatId ||
      !UUID_PATTERN.test(beatId)
    ) {
      return new Response(
        'A valid beat ID is required.',
        {
          status: 400
        }
      );
    }

    const supabaseAdmin =
      getSupabaseAdmin();

    /*
      The browser supplies only the public beat ID.

      The private R2 key is retrieved on the server and
      is never returned to the browser.
    */
    const {
      data: beat,
      error: beatError
    } = await supabaseAdmin
      .from('beats')
      .select(`
        id,
        preview_url
      `)
      .eq('id', beatId)
      .maybeSingle();

    if (beatError) {
      console.error(
        'Preview beat lookup error:',
        beatError
      );

      return new Response(
        'The preview could not be retrieved.',
        {
          status: 500
        }
      );
    }

    if (!beat?.preview_url) {
      return new Response(
        'Preview not found.',
        {
          status: 404
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

    const requestedRange =
      request.headers.get('range');

    const command =
      new GetObjectCommand({
        Bucket: bucketName,
        Key: beat.preview_url,

        ...(requestedRange
          ? {
              Range: requestedRange
            }
          : {})
      });

    const s3Response =
      await s3.send(command);

    if (!s3Response.Body) {
      return new Response(
        'Preview file not found.',
        {
          status: 404
        }
      );
    }

    const headers =
      new Headers();

    headers.set(
      'Content-Type',
      s3Response.ContentType ||
        'audio/mpeg'
    );

    headers.set(
      'Accept-Ranges',
      'bytes'
    );

    headers.set(
      'Cache-Control',
      'public, max-age=3600, s-maxage=3600'
    );

    headers.set(
      'X-Content-Type-Options',
      'nosniff'
    );

    if (
      s3Response.ContentLength !==
      undefined
    ) {
      headers.set(
        'Content-Length',
        String(
          s3Response.ContentLength
        )
      );
    }

    if (s3Response.ContentRange) {
      headers.set(
        'Content-Range',
        s3Response.ContentRange
      );
    }

    if (s3Response.ETag) {
      headers.set(
        'ETag',
        s3Response.ETag
      );
    }

    return new Response(
      s3Response.Body,
      {
        status:
          s3Response.ContentRange
            ? 206
            : 200,

        headers
      }
    );
  } catch (error) {
    console.error(
      'Secure preview streaming error:',
      error
    );

    return new Response(
      'Preview not found or storage error.',
      {
        status: 404
      }
    );
  }
}