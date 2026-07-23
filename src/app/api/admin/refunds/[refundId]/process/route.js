import 'postman-request';
import Iyzipay from 'iyzipay';
import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri:
    process.env.IYZICO_BASE_URL ||
    'https://sandbox-api.iyzipay.com',
});

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
              Authentication can still be read when cookies
              cannot be updated in this request context.
            */
          }
        },
      },
    }
  );
}

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

function getRequesterIp(request) {
  const forwardedFor =
    request.headers.get('x-forwarded-for');

  const forwardedIp = forwardedFor
    ?.split(',')[0]
    ?.trim();

  const realIp =
    request.headers.get('x-real-ip');

  const detectedIp =
    forwardedIp || realIp;

  /*
    Iyzico Sandbox rejects local IP addresses, so use the
    documented Sandbox test IP during local development.
  */
  if (
    !detectedIp ||
    detectedIp === '::1' ||
    detectedIp === '127.0.0.1'
  ) {
    return '85.34.78.112';
  }

  return detectedIp;
}

function moneyToCents(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.round(
    numericValue * 100
  );
}

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ''
  );
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (
    error &&
    typeof error === 'object'
  ) {
    try {
      return JSON.parse(
        JSON.stringify(error)
      );
    } catch {
      return {
        message:
          'An unrecognized refund transport error occurred.',
      };
    }
  }

  return {
    message:
      String(
        error ||
          'An unknown refund transport error occurred.'
      ),
  };
}

function createIyzicoRefund(requestData) {
  return new Promise((resolve, reject) => {
    iyzipay.refund.create(
      requestData,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );
  });
}

function verifySuccessfulRefundResponse({
  result,
  refundItem,
  conversationId,
}) {
  const errors = [];

  if (result?.status !== 'success') {
    errors.push(
      'Iyzico did not report a successful refund.'
    );

    return errors;
  }

  if (
    hasValue(result.conversationId) &&
    String(result.conversationId) !==
      String(conversationId)
  ) {
    errors.push(
      'The refund conversation ID does not match.'
    );
  }

  if (
    hasValue(
      result.paymentTransactionId
    ) &&
    String(
      result.paymentTransactionId
    ) !==
      String(
        refundItem.payment_transaction_id
      )
  ) {
    errors.push(
      'The refunded payment transaction ID does not match.'
    );
  }

  const returnedPrice =
    result.price ??
    result.refundPrice;

  if (hasValue(returnedPrice)) {
    const expectedPrice =
      moneyToCents(refundItem.amount);

    const actualPrice =
      moneyToCents(returnedPrice);

    if (
      expectedPrice === null ||
      actualPrice === null ||
      expectedPrice !== actualPrice
    ) {
      errors.push(
        'The refunded amount does not match the requested amount.'
      );
    }
  }

  if (
    hasValue(result.currency) &&
    String(result.currency).toUpperCase() !==
      String(
        refundItem.currency
      ).toUpperCase()
  ) {
    errors.push(
      'The refunded currency does not match.'
    );
  }

  return errors;
}

async function markParentManualReview({
  supabaseAdmin,
  refundId,
  reason,
}) {
  const updatedAt =
    new Date().toISOString();

  const {
    error: updateError,
  } = await supabaseAdmin
    .from('order_refunds')
    .update({
      status: 'manual_review',
      failed_at: updatedAt,
      last_error: reason,
      updated_at: updatedAt,
    })
    .eq('id', refundId)
    .neq('status', 'refunded');

  if (updateError) {
    console.error(
      'Refund manual-review fallback update error:',
      updateError
    );
  }
}

async function markItemManualReview({
  supabaseAdmin,
  refundId,
  refundItemId,
  providerResponse,
  reason,
}) {
  const {
    error: manualReviewError,
  } = await supabaseAdmin.rpc(
    'mark_order_refund_item_manual_review',
    {
      target_order_refund_item_id:
        refundItemId,

      provider_response_value:
        providerResponse,

      failure_reason_value:
        reason,
    }
  );

  if (!manualReviewError) {
    return;
  }

  console.error(
    'Refund item manual-review RPC error:',
    manualReviewError
  );

  await markParentManualReview({
    supabaseAdmin,
    refundId,
    reason,
  });
}

async function loadRefund({
  supabaseAdmin,
  refundId,
}) {
  const {
    data: refund,
    error: refundError,
  } = await supabaseAdmin
    .from('order_refunds')
    .select(`
      id,
      order_id,
      provider,
      requested_amount,
      refunded_amount,
      currency,
      status,
      refund_reason,
      restore_exclusive_beats,
      provider_payment_id_snapshot,
      provider_conversation_id_snapshot
    `)
    .eq('id', refundId)
    .maybeSingle();

  if (refundError) {
    console.error(
      'Refund loading error:',
      refundError
    );

    throw new Error(
      'The refund could not be loaded.'
    );
  }

  return refund || null;
}

async function loadRefundItems({
  supabaseAdmin,
  refundId,
}) {
  const {
    data: refundItems,
    error: refundItemsError,
  } = await supabaseAdmin
    .from('order_refund_items')
    .select(`
      id,
      order_refund_id,
      order_item_id,
      provider_item_id,
      payment_transaction_id,
      amount,
      currency,
      status
    `)
    .eq('order_refund_id', refundId)
    .order('created_at', {
      ascending: true,
    })
    .order('id', {
      ascending: true,
    });

  if (refundItemsError) {
    console.error(
      'Refund items loading error:',
      refundItemsError
    );

    throw new Error(
      'The refund items could not be loaded.'
    );
  }

  return refundItems || [];
}

export async function POST(
  request,
  context
) {
  let supabaseAdmin;
  let refund = null;
  let processingStarted = false;

  try {
    const resolvedParams =
      await context.params;

    const refundId =
      normalizeUuid(
        resolvedParams?.refundId
      );

    if (!refundId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'A valid refund ID is required.',
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const supabaseAuth =
      await getSupabaseAuthClient();

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.error(
        'Refund authentication error:',
        authError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Authentication is required.',
        },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const {
      data: isPlatformAdmin,
      error: adminCheckError,
    } = await supabaseAuth.rpc(
      'is_platform_admin'
    );

    if (
      adminCheckError ||
      isPlatformAdmin !== true
    ) {
      console.error(
        'Refund administrator authorization error:',
        adminCheckError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Administrator access is required.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    supabaseAdmin =
      getSupabaseAdmin();

    refund = await loadRefund({
      supabaseAdmin,
      refundId,
    });

    if (!refund) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The refund was not found.',
        },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    if (refund.provider !== 'iyzico') {
      return NextResponse.json(
        {
          success: false,
          error:
            'This refund does not use the Iyzico provider.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    if (refund.status === 'refunded') {
      return NextResponse.json(
        {
          success: true,
          alreadyRefunded: true,
          refundId: refund.id,
          orderId: refund.order_id,
          status: refund.status,
          refundedAmount:
            refund.refunded_amount,
          currency: refund.currency,
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    if (refund.status === 'processing') {
      return NextResponse.json(
        {
          success: false,
          error:
            'This refund is already being processed.',
          refundId: refund.id,
          status: refund.status,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    if (
      refund.status === 'manual_review'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This refund requires manual review.',
          refundId: refund.id,
          status: refund.status,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const {
      data: pendingItemCount,
      error: startError,
    } = await supabaseAdmin.rpc(
      'start_order_refund',
      {
        target_order_refund_id:
          refund.id,
      }
    );

    if (startError) {
      console.error(
        'Refund start error:',
        startError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            startError.message ||
            'The refund could not be started.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    processingStarted = true;

    if (
      Number(pendingItemCount || 0) === 0
    ) {
      const completedRefund =
        await loadRefund({
          supabaseAdmin,
          refundId: refund.id,
        });

      if (
        completedRefund?.status ===
        'refunded'
      ) {
        return NextResponse.json(
          {
            success: true,
            alreadyRefunded: true,
            refundId:
              completedRefund.id,
            orderId:
              completedRefund.order_id,
            status:
              completedRefund.status,
            refundedAmount:
              completedRefund
                .refunded_amount,
            currency:
              completedRefund.currency,
          },
          {
            status: 200,
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      throw new Error(
        'The refund has no pending items to process.'
      );
    }

    const refundItems =
      await loadRefundItems({
        supabaseAdmin,
        refundId: refund.id,
      });

    const pendingRefundItems =
      refundItems.filter(
        (refundItem) =>
          refundItem.status ===
          'pending'
      );

    if (
      pendingRefundItems.length !==
      Number(pendingItemCount)
    ) {
      throw new Error(
        'The pending refund item count changed unexpectedly.'
      );
    }

    const requesterIp =
      getRequesterIp(request);

    for (
      const refundItem
      of pendingRefundItems
    ) {
      const conversationId =
        `refund_${refund.id}_${refundItem.id}`;

      const amount =
        Number(refundItem.amount);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        const reason =
          'The refund item amount is invalid.';

        await markItemManualReview({
          supabaseAdmin,
          refundId: refund.id,
          refundItemId:
            refundItem.id,
          providerResponse: {
            validationError: reason,
          },
          reason,
        });

        return NextResponse.json(
          {
            success: false,
            error: reason,
            refundId: refund.id,
            refundItemId:
              refundItem.id,
            status: 'manual_review',
          },
          {
            status: 409,
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const requestData = {
        locale:
          Iyzipay.LOCALE.TR,

        conversationId,

        paymentTransactionId:
          String(
            refundItem
              .payment_transaction_id
          ),

        price:
          amount.toFixed(2),

        currency:
          Iyzipay.CURRENCY.TRY,

        ip:
          requesterIp,

        reason:
          Iyzipay.REFUND_REASON.OTHER,

        description:
          String(
            refund.refund_reason
          ).slice(0, 500),
      };

      let refundResult;

      try {
        refundResult =
          await createIyzicoRefund(
            requestData
          );
      } catch (providerError) {
        const serializedProviderError =
          serializeError(providerError);

        const reason =
          'The Iyzico refund request had an uncertain transport result. Verify the transaction manually before retrying.';

        console.error(
          'Iyzico refund transport error:',
          {
            refundId: refund.id,
            refundItemId:
              refundItem.id,
            providerError,
          }
        );

        await markItemManualReview({
          supabaseAdmin,
          refundId: refund.id,
          refundItemId:
            refundItem.id,
          providerResponse: {
            request: {
              conversationId,
              paymentTransactionId:
                requestData
                  .paymentTransactionId,
              price:
                requestData.price,
              currency:
                refundItem.currency,
            },
            transportError:
              serializedProviderError,
          },
          reason,
        });

        return NextResponse.json(
          {
            success: false,
            error: reason,
            refundId: refund.id,
            refundItemId:
              refundItem.id,
            status: 'manual_review',
          },
          {
            status: 502,
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      if (
        refundResult?.status !==
        'success'
      ) {
        const failureReason =
          refundResult?.errorMessage ||
          refundResult?.errorCode ||
          'Iyzico rejected the refund request.';

        const {
          data: recordedStatus,
          error: recordFailureError,
        } = await supabaseAdmin.rpc(
          'record_order_refund_item_result',
          {
            target_order_refund_item_id:
              refundItem.id,

            succeeded:
              false,

            provider_response_value:
              refundResult || {},

            failure_reason_value:
              String(failureReason),
          }
        );

        if (recordFailureError) {
          console.error(
            'Refund failure recording error:',
            recordFailureError
          );

          await markParentManualReview({
            supabaseAdmin,
            refundId: refund.id,
            reason:
              'Iyzico rejected the refund, but the failure could not be recorded safely.',
          });

          return NextResponse.json(
            {
              success: false,
              error:
                'The provider rejected the refund, but its result could not be recorded safely.',
              refundId: refund.id,
              refundItemId:
                refundItem.id,
              status:
                'manual_review',
            },
            {
              status: 500,
              headers: {
                'Cache-Control':
                  'no-store',
              },
            }
          );
        }

        return NextResponse.json(
          {
            success: false,
            error:
              String(failureReason),
            refundId: refund.id,
            refundItemId:
              refundItem.id,
            status:
              recordedStatus ||
              'failed',
            providerErrorCode:
              refundResult?.errorCode ||
              null,
          },
          {
            status: 502,
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const verificationErrors =
        verifySuccessfulRefundResponse({
          result:
            refundResult,
          refundItem,
          conversationId,
        });

      if (
        verificationErrors.length > 0
      ) {
        const reason =
          verificationErrors.join(' ');

        console.error(
          'Successful refund response verification error:',
          {
            refundId: refund.id,
            refundItemId:
              refundItem.id,
            verificationErrors,
            refundResult,
          }
        );

        await markItemManualReview({
          supabaseAdmin,
          refundId: refund.id,
          refundItemId:
            refundItem.id,
          providerResponse:
            refundResult,
          reason,
        });

        return NextResponse.json(
          {
            success: false,
            error:
              'Iyzico reported success, but the refund response did not match the requested transaction. Manual review is required.',
            details:
              verificationErrors,
            refundId: refund.id,
            refundItemId:
              refundItem.id,
            status:
              'manual_review',
          },
          {
            status: 502,
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const {
        error: recordSuccessError,
      } = await supabaseAdmin.rpc(
        'record_order_refund_item_result',
        {
          target_order_refund_item_id:
            refundItem.id,

          succeeded:
            true,

          provider_response_value:
            refundResult,

          failure_reason_value:
            null,
        }
      );

      if (recordSuccessError) {
        console.error(
          'Successful refund recording error:',
          recordSuccessError
        );

        const reason =
          'Iyzico reported a successful refund, but the success could not be recorded safely. Manual review is required.';

        await markItemManualReview({
          supabaseAdmin,
          refundId: refund.id,
          refundItemId:
            refundItem.id,
          providerResponse:
            refundResult,
          reason,
        });

        return NextResponse.json(
          {
            success: false,
            error: reason,
            refundId: refund.id,
            refundItemId:
              refundItem.id,
            status:
              'manual_review',
          },
          {
            status: 500,
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      }
    }

    const {
      data: reversedEarningCount,
      error: finalizeError,
    } = await supabaseAdmin.rpc(
      'finalize_order_refund',
      {
        target_order_refund_id:
          refund.id,
      }
    );

    if (finalizeError) {
      console.error(
        'Refund finalization error:',
        finalizeError
      );

      const reason =
        'All Iyzico refund transactions succeeded, but the order could not be finalized safely. Manual review is required.';

      await markParentManualReview({
        supabaseAdmin,
        refundId: refund.id,
        reason,
      });

      return NextResponse.json(
        {
          success: false,
          error: reason,
          refundId: refund.id,
          status: 'manual_review',
        },
        {
          status: 500,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const completedRefund =
      await loadRefund({
        supabaseAdmin,
        refundId: refund.id,
      });

    return NextResponse.json(
      {
        success: true,
        refundId: refund.id,
        orderId: refund.order_id,
        status:
          completedRefund?.status ||
          'refunded',
        requestedAmount:
          refund.requested_amount,
        refundedAmount:
          completedRefund
            ?.refunded_amount ??
          refund.requested_amount,
        currency:
          refund.currency,
        processedItemCount:
          pendingRefundItems.length,
        reversedEarningCount:
          Number(
            reversedEarningCount || 0
          ),
        restoredExclusiveBeats:
          refund
            .restore_exclusive_beats,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Critical refund processing error:',
      error
    );

    if (
      processingStarted &&
      supabaseAdmin &&
      refund?.id
    ) {
      await markParentManualReview({
        supabaseAdmin,
        refundId: refund.id,
        reason:
          error instanceof Error
            ? error.message
            : 'An unknown refund processing error occurred.',
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          'The refund could not be processed safely.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}