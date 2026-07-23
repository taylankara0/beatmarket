import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  createClient as createSupabaseAdminClient
} from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { r2Client } from '@/lib/r2';

export const runtime = 'nodejs';

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
        persistSession: false
      }
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
              ({ name, value, options }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            /*
              Reading the authenticated session still works
              if cookies cannot be updated in this request.
            */
          }
        }
      }
    }
  );
}

function sanitizeDownloadName(value) {
  return String(value || 'purchased-beat')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getFileExtension(fileKey, fileFormat) {
  const normalizedFormat = String(
    fileFormat || ''
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (normalizedFormat) {
    return normalizedFormat;
  }

  const keyWithoutQuery = String(fileKey)
    .split('?')[0];

  const possibleExtension = keyWithoutQuery
    .split('.')
    .pop()
    ?.toLowerCase();

  if (
    possibleExtension &&
    possibleExtension !==
      keyWithoutQuery.toLowerCase()
  ) {
    return possibleExtension.replace(
      /[^a-z0-9]/g,
      ''
    );
  }

  return 'audio';
}

export async function GET(
  request,
  { params }
) {
  try {
    const resolvedParams = await params;

    const orderItemId =
      resolvedParams?.orderItemId;

    if (!orderItemId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Order item ID is missing.'
        },
        {
          status: 400
        }
      );
    }

    /*
      Verify the user through their Supabase session.

      The user ID is never accepted from a query parameter
      or request body.
    */
    const supabaseAuth =
      await getSupabaseAuthClient();

    const {
      data: { user },
      error: authError
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You must be signed in to download this purchase.'
        },
        {
          status: 401
        }
      );
    }

    const supabaseAdmin =
      getSupabaseAdmin();

    /*
      Load the purchased order item.
    */
    const {
      data: orderItem,
      error: orderItemError
    } = await supabaseAdmin
      .from('order_items')
      .select(`
        id,
        order_id,
        beat_id,
        license_id,
        title,
        license_name
      `)
      .eq('id', orderItemId)
      .maybeSingle();

    if (orderItemError) {
      console.error(
        'Order item lookup error:',
        orderItemError
      );

      throw new Error(
        'The purchased item could not be retrieved.'
      );
    }

    if (!orderItem) {
      return NextResponse.json(
        {
          success: false,
          error: 'Purchased item not found.'
        },
        {
          status: 404
        }
      );
    }

    /*
      Verify that:
      - the order exists,
      - the payment is complete,
      - the order has not been refunded,
      - the current user owns it.
    */
    const {
      data: order,
      error: orderError
    } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        user_id,
        status,
        refunded_at
      `)
      .eq('id', orderItem.order_id)
      .maybeSingle();

    if (orderError) {
      console.error(
        'Download order lookup error:',
        orderError
      );

      throw new Error(
        'The order could not be retrieved.'
      );
    }

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: 'Order not found.'
        },
        {
          status: 404
        }
      );
    }

    if (order.status === 'refunded') {
      return NextResponse.json(
        {
          success: false,
          error:
            'This purchase has been refunded, so its files are no longer available for download.'
        },
        {
          status: 403
        }
      );
    }

    if (order.status !== 'paid') {
      return NextResponse.json(
        {
          success: false,
          error:
            'This order has not been paid successfully.'
        },
        {
          status: 403
        }
      );
    }

    if (
      !order.user_id ||
      String(order.user_id) !==
        String(user.id)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You do not have permission to download this purchase.'
        },
        {
          status: 403
        }
      );
    }

    if (
      !orderItem.beat_id ||
      !orderItem.license_id
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The purchased beat or license information is missing.'
        },
        {
          status: 400
        }
      );
    }

    /*
      Confirm that the purchased license belongs to
      the purchased beat.
    */
    const {
      data: license,
      error: licenseError
    } = await supabaseAdmin
      .from('licenses')
      .select(`
        id,
        beat_id,
        name,
        file_format,
        is_exclusive
      `)
      .eq('id', orderItem.license_id)
      .eq('beat_id', orderItem.beat_id)
      .maybeSingle();

    if (licenseError) {
      console.error(
        'License lookup error:',
        licenseError
      );

      throw new Error(
        'The purchased license could not be verified.'
      );
    }

    if (!license) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The purchased license could not be verified.'
        },
        {
          status: 404
        }
      );
    }

    /*
      Retrieve the private master-file key.

      This key is never sent directly to the frontend.
    */
    const {
      data: beat,
      error: beatError
    } = await supabaseAdmin
      .from('beats')
      .select(`
        id,
        title,
        untagged_file_key
      `)
      .eq('id', orderItem.beat_id)
      .maybeSingle();

    if (beatError) {
      console.error(
        'Beat download lookup error:',
        beatError
      );

      throw new Error(
        'The purchased beat could not be retrieved.'
      );
    }

    if (!beat?.untagged_file_key) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The master audio file is not available.'
        },
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

    const extension = getFileExtension(
      beat.untagged_file_key,
      license.file_format
    );

    const safeBeatTitle =
      sanitizeDownloadName(
        beat.title ||
          orderItem.title ||
          'purchased-beat'
      );

    const safeLicenseName =
      sanitizeDownloadName(
        license.name ||
          orderItem.license_name ||
          'license'
      );

    const filename =
      `${safeBeatTitle}-${safeLicenseName}.${extension}`;

    /*
      Generate a short-lived R2 URL.

      The URL expires after 60 seconds. Opening it downloads
      the private master file with a readable filename.
    */
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: beat.untagged_file_key,
      ResponseContentDisposition:
        `attachment; filename="${filename}"`
    });

    const downloadUrl = await getSignedUrl(
      r2Client,
      command,
      {
        expiresIn: 60
      }
    );

    return NextResponse.json({
      success: true,
      downloadUrl,
      filename,
      expiresIn: 60
    });
  } catch (error) {
    console.error(
      'Secure download error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'The secure download link could not be generated.'
      },
      {
        status: 500
      }
    );
  }
}