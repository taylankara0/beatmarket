'use server';

import { cookies, headers } from 'next/headers';
import {
  redirect,
} from 'next/navigation';
import {
  revalidatePath,
} from 'next/cache';

import {
  createClient,
} from '@/lib/supabase-server';

function normalizeUuid(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue =
    value.trim().toLowerCase();

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  if (!uuidPattern.test(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}

function createRedirectUrl({
  success,
  error,
  refundId,
}) {
  const searchParams =
    new URLSearchParams();

  if (success) {
    searchParams.set(
      'success',
      success
    );
  }

  if (error) {
    searchParams.set(
      'error',
      error
    );
  }

  if (refundId) {
    searchParams.set(
      'refund',
      refundId
    );
  }

  const queryString =
    searchParams.toString();

  return queryString
    ? `/admin/refunds?${queryString}`
    : '/admin/refunds';
}

async function requirePlatformAdmin() {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const {
    data: isPlatformAdmin,
    error: adminCheckError,
  } = await supabase.rpc(
    'is_platform_admin'
  );

  if (
    adminCheckError ||
    isPlatformAdmin !== true
  ) {
    redirect('/dashboard');
  }

  return {
    supabase,
    user,
  };
}

async function getInternalBaseUrl() {
  if (
    process.env.NEXT_PUBLIC_SITE_URL
  ) {
    return new URL(
      process.env.NEXT_PUBLIC_SITE_URL
    ).origin;
  }

  const headerStore =
    await headers();

  const host =
    headerStore.get(
      'x-forwarded-host'
    ) ||
    headerStore.get('host');

  if (!host) {
    throw new Error(
      'The application host could not be determined.'
    );
  }

  const protocol =
    headerStore.get(
      'x-forwarded-proto'
    ) ||
    (
      process.env.NODE_ENV ===
      'development'
        ? 'http'
        : 'https'
    );

  return `${protocol}://${host}`;
}

async function getCookieHeader() {
  const cookieStore =
    await cookies();

  return cookieStore
    .getAll()
    .map(
      ({ name, value }) =>
        `${name}=${value}`
    )
    .join('; ');
}

export async function createOrderRefundAction(
  formData
) {
  const {
    supabase,
  } = await requirePlatformAdmin();

  const orderId =
    normalizeUuid(
      formData.get('order_id')
    );

  const refundReason =
    String(
      formData.get(
        'refund_reason'
      ) || ''
    ).trim();

  const restoreExclusiveBeats =
    formData.get(
      'restore_exclusive_beats'
    ) === 'on';

  if (!orderId) {
    redirect(
      createRedirectUrl({
        error:
          'A valid order ID is required.',
      })
    );
  }

  if (
    refundReason.length < 2 ||
    refundReason.length > 500
  ) {
    redirect(
      createRedirectUrl({
        error:
          'The refund reason must contain between 2 and 500 characters.',
      })
    );
  }

  const {
    data: refundId,
    error: refundError,
  } = await supabase.rpc(
    'create_order_refund',
    {
      target_order_id:
        orderId,

      refund_reason_value:
        refundReason,

      restore_exclusive_beats_value:
        restoreExclusiveBeats,
    }
  );

  if (refundError || !refundId) {
    console.error(
      'Order refund creation error:',
      refundError
    );

    redirect(
      createRedirectUrl({
        error:
          refundError?.message ||
          'The refund record could not be created.',
      })
    );
  }

  revalidatePath(
    '/admin/refunds'
  );

  redirect(
    createRedirectUrl({
      success:
        'The refund record was created. Review it before processing the Iyzico refund.',
      refundId:
        String(refundId),
    })
  );
}

export async function processOrderRefundAction(
  formData
) {
  await requirePlatformAdmin();

  const refundId =
    normalizeUuid(
      formData.get('refund_id')
    );

  if (!refundId) {
    redirect(
      createRedirectUrl({
        error:
          'A valid refund ID is required.',
      })
    );
  }

  let baseUrl;
  let cookieHeader;

  try {
    baseUrl =
      await getInternalBaseUrl();

    cookieHeader =
      await getCookieHeader();
  } catch (error) {
    console.error(
      'Refund endpoint request preparation error:',
      error
    );

    redirect(
      createRedirectUrl({
        error:
          error instanceof Error
            ? error.message
            : 'The refund request could not be prepared.',
        refundId,
      })
    );
  }

  let response;
  let responseBody;

  try {
    response = await fetch(
      `${baseUrl}/api/admin/refunds/${refundId}/process`,
      {
        method: 'POST',
        headers: {
          Accept:
            'application/json',

          Cookie:
            cookieHeader,
        },
        cache: 'no-store',
      }
    );

    responseBody =
      await response.json();
  } catch (error) {
    console.error(
      'Refund endpoint request error:',
      error
    );

    redirect(
      createRedirectUrl({
        error:
          'The refund processing endpoint could not be reached.',
        refundId,
      })
    );
  }

  revalidatePath(
    '/admin/refunds'
  );

  if (
    !response.ok ||
    responseBody?.success !== true
  ) {
    redirect(
      createRedirectUrl({
        error:
          responseBody?.error ||
          'The refund could not be processed.',
        refundId,
      })
    );
  }

  const refundedAmount =
    responseBody.refundedAmount ??
    responseBody.requestedAmount ??
    '';

  const currency =
    responseBody.currency ||
    'TRY';

  redirect(
    createRedirectUrl({
      success:
        `Refund completed successfully: ${refundedAmount} ${currency}.`,
      refundId,
    })
  );
}