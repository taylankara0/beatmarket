import 'postman-request';
import Iyzipay from 'iyzipay';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import {
  PAYMENT_MODES,
  getPaymentMode
} from '../../../../../lib/paymentMode';

export const runtime = 'nodejs';

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri:
    process.env.IYZICO_BASE_URL ||
    'https://sandbox-api.iyzipay.com'
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

  return createClient(
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

function getBaseUrl(request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL(
      process.env.NEXT_PUBLIC_SITE_URL
    );
  }

  return new URL(request.url);
}

function createRedirect(
  request,
  pathname,
  searchParams = {}
) {
  const redirectUrl = new URL(
    pathname,
    getBaseUrl(request)
  );

  Object.entries(searchParams).forEach(
    ([key, value]) => {
      if (
        value !== null &&
        value !== undefined &&
        value !== ''
      ) {
        redirectUrl.searchParams.set(
          key,
          String(value)
        );
      }
    }
  );

  /*
    Iyzico sends the callback as a POST request.

    A 303 redirect makes the browser open the destination
    page with GET instead of repeating the POST request.
  */
  return NextResponse.redirect(
    redirectUrl,
    303
  );
}

async function extractToken(request) {
  const contentType =
    request.headers.get('content-type') || '';

  if (
    contentType.includes(
      'application/json'
    )
  ) {
    const body = await request.json();

    return body?.token || null;
  }

  if (
    contentType.includes(
      'multipart/form-data'
    ) ||
    contentType.includes(
      'application/x-www-form-urlencoded'
    )
  ) {
    const formData =
      await request.formData();

    return formData.get('token');
  }

  const rawBody =
    await request.text();

  if (!rawBody) {
    return null;
  }

  const bodyParams =
    new URLSearchParams(rawBody);

  return bodyParams.get('token');
}

function moneyToCents(value) {
  const numericValue =
    Number(value);

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

function isTrue(value) {
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() ===
      'true'
  );
}

function getCartSnapshot(order) {
  const snapshot =
    order?.cart_snapshot;

  if (Array.isArray(snapshot)) {
    return snapshot;
  }

  if (typeof snapshot === 'string') {
    try {
      const parsedSnapshot =
        JSON.parse(snapshot);

      return Array.isArray(
        parsedSnapshot
      )
        ? parsedSnapshot
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getExclusiveBeatIds(order) {
  const cartSnapshot =
    getCartSnapshot(order);

  const exclusiveBeatIds =
    cartSnapshot
      .map((item) => {
        const isExclusive =
          item?.isExclusive ??
          item?.is_exclusive;

        const beatId =
          item?.beatId ??
          item?.beat_id;

        if (
          !isTrue(isExclusive) ||
          !hasValue(beatId)
        ) {
          return null;
        }

        return String(beatId);
      })
      .filter(Boolean);

  return [
    ...new Set(exclusiveBeatIds)
  ];
}

function verifyPaymentAgainstOrder(
  paymentResult,
  order,
  token
) {
  const errors = [];

  if (
    paymentResult.status !== 'success'
  ) {
    errors.push(
      'Iyzico API status is not success.'
    );
  }

  if (
    paymentResult.paymentStatus !==
    'SUCCESS'
  ) {
    errors.push(
      'Iyzico payment status is not SUCCESS.'
    );
  }

  if (!paymentResult.paymentId) {
    errors.push(
      'Iyzico payment ID is missing.'
    );
  }

  /*
    The order was found using the token stored during
    Checkout Form initialization.

    When Iyzico returns the token again, it must match.
  */
  if (
    hasValue(paymentResult.token) &&
    String(paymentResult.token) !==
      String(token)
  ) {
    errors.push(
      'The returned Iyzico token does not match.'
    );
  }

  /*
    checkoutForm.retrieve may not include conversationId.

    Compare it only when Iyzico returns one.
  */
  if (
    hasValue(
      paymentResult.conversationId
    ) &&
    String(
      paymentResult.conversationId
    ) !==
      String(order.conversation_id)
  ) {
    errors.push(
      'The conversation ID does not match the pending order.'
    );
  }

  if (
    !hasValue(paymentResult.basketId)
  ) {
    errors.push(
      'The Iyzico basket ID is missing.'
    );
  } else if (
    String(paymentResult.basketId) !==
    String(order.basket_id)
  ) {
    errors.push(
      'The basket ID does not match the pending order.'
    );
  }

  const expectedPrice =
    moneyToCents(order.price);

  const expectedPaidPrice =
    moneyToCents(order.paid_price);

  const retrievedPrice =
    moneyToCents(
      paymentResult.price
    );

  const retrievedPaidPrice =
    moneyToCents(
      paymentResult.paidPrice
    );

  if (
    expectedPrice === null ||
    retrievedPrice === null ||
    expectedPrice !== retrievedPrice
  ) {
    errors.push(
      'The retrieved basket price does not match the order.'
    );
  }

  if (
    expectedPaidPrice === null ||
    retrievedPaidPrice === null ||
    expectedPaidPrice !==
      retrievedPaidPrice
  ) {
    errors.push(
      'The retrieved paid price does not match the order.'
    );
  }

  if (
    String(
      paymentResult.currency || ''
    ).toUpperCase() !==
    String(
      order.currency || ''
    ).toUpperCase()
  ) {
    errors.push(
      'The retrieved currency does not match the order.'
    );
  }

  return errors;
}

async function releaseExclusiveReservations(
  supabase,
  orderId
) {
  const {
    error: releaseError
  } = await supabase
    .from(
      'exclusive_beat_reservations'
    )
    .delete()
    .eq('order_id', orderId)
    .eq('status', 'reserved');

  if (releaseError) {
    console.error(
      'Exclusive reservation release error:',
      releaseError
    );
  }
}

async function holdExclusiveReservationsForReview(
  supabase,
  orderId
) {
  /*
    A payment reported as successful but failing our
    verification must not automatically release the beat.

    Setting expires_at to null keeps the reservation until
    the payment can be reviewed manually.
  */
  const {
    error: holdError
  } = await supabase
    .from(
      'exclusive_beat_reservations'
    )
    .update({
      expires_at: null,
      updated_at:
        new Date().toISOString()
    })
    .eq('order_id', orderId)
    .eq('status', 'reserved');

  if (holdError) {
    console.error(
      'Exclusive reservation review hold error:',
      holdError
    );
  }
}

async function finalizeExclusiveSale(
  supabase,
  order
) {
  const exclusiveBeatIds =
    getExclusiveBeatIds(order);

  /*
    Normal license orders do not create an Exclusive
    reservation and require no additional processing.
  */
  if (
    exclusiveBeatIds.length === 0
  ) {
    return;
  }

  const updatedAt =
    new Date().toISOString();

  /*
    Convert this order's reservations from reserved to paid.

    A paid reservation has no expiration date and therefore
    cannot be deleted by the expired-reservation cleanup.
  */
  const {
    data: finalizedReservations,
    error: reservationUpdateError
  } = await supabase
    .from(
      'exclusive_beat_reservations'
    )
    .update({
      status: 'paid',
      expires_at: null,
      updated_at: updatedAt
    })
    .eq('order_id', order.id)
    .in(
      'beat_id',
      exclusiveBeatIds
    )
    .in(
      'status',
      ['reserved', 'paid']
    )
    .select('beat_id');

  if (reservationUpdateError) {
    console.error(
      'Exclusive reservation finalization error:',
      reservationUpdateError
    );

    throw new Error(
      'The Exclusive reservation could not be finalized.'
    );
  }

  const finalizedBeatIdSet =
    new Set(
      (finalizedReservations || [])
        .map(
          (reservation) =>
            String(
              reservation.beat_id
            )
        )
    );

  const missingReservationBeatIds =
    exclusiveBeatIds.filter(
      (beatId) =>
        !finalizedBeatIdSet.has(
          String(beatId)
        )
    );

  /*
    Never mark the order paid when its Exclusive reservation
    has disappeared or belongs to another order.
  */
  if (
    missingReservationBeatIds.length >
    0
  ) {
    console.error(
      'Exclusive reservation missing for paid order:',
      {
        orderId: order.id,
        missingReservationBeatIds
      }
    );

    throw new Error(
      'A required Exclusive reservation is missing.'
    );
  }

  /*
    Remove each purchased Exclusive beat from future sales.
  */
  const {
    data: soldBeats,
    error: beatUpdateError
  } = await supabase
    .from('beats')
    .update({
      is_sold_exclusive: true
    })
    .in('id', exclusiveBeatIds)
    .select('id');

  if (beatUpdateError) {
    console.error(
      'Exclusive beat sale finalization error:',
      beatUpdateError
    );

    throw new Error(
      'The beat could not be marked as sold exclusively.'
    );
  }

  const soldBeatIdSet =
    new Set(
      (soldBeats || []).map(
        (beat) =>
          String(beat.id)
      )
    );

  const missingSoldBeatIds =
    exclusiveBeatIds.filter(
      (beatId) =>
        !soldBeatIdSet.has(
          String(beatId)
        )
    );

  if (
    missingSoldBeatIds.length > 0
  ) {
    console.error(
      'Some Exclusive beats could not be finalized:',
      {
        orderId: order.id,
        missingSoldBeatIds
      }
    );

    throw new Error(
      'One or more Exclusive beats could not be finalized.'
    );
  }
}

async function updateOrderItemTransactions(
  supabase,
  orderId,
  itemTransactions
) {
  if (
    !Array.isArray(itemTransactions)
  ) {
    return;
  }

  const updateResults =
    await Promise.all(
      itemTransactions.map(
        async (transaction) => {
          if (!transaction.itemId) {
            return null;
          }

          const {
            error
          } = await supabase
            .from('order_items')
            .update({
              payment_transaction_id:
                transaction
                  .paymentTransactionId ||
                null,

              iyzico_paid_price:
                transaction.paidPrice !==
                  null &&
                transaction.paidPrice !==
                  undefined
                  ? Number(
                      transaction.paidPrice
                    ).toFixed(2)
                  : null,

              iyzico_transaction_status:
                transaction
                  .transactionStatus !==
                  null &&
                transaction
                  .transactionStatus !==
                  undefined
                  ? String(
                      transaction
                        .transactionStatus
                    )
                  : null
            })
            .eq(
              'order_id',
              orderId
            )
            .eq(
              'iyzico_item_id',
              String(
                transaction.itemId
              )
            );

          return error;
        }
      )
    );

  const transactionErrors =
    updateResults.filter(Boolean);

  if (
    transactionErrors.length > 0
  ) {
    console.error(
      'Some order item transaction details could not be updated:',
      transactionErrors
    );
  }
}

export async function POST(request) {
  let supabase;
  let order = null;

  try {
    const paymentMode =
      getPaymentMode();

    supabase =
      getSupabaseAdmin();

    const token =
      await extractToken(request);

    if (
      !token ||
      typeof token !== 'string'
    ) {
      console.error(
        'Iyzico callback token is missing.'
      );

      return createRedirect(
        request,
        '/explore',
        {
          payment: 'failed'
        }
      );
    }

    /*
      Find the pending order using the Iyzico token saved
      during Checkout Form initialization.
    */
    const {
      data: existingOrder,
      error: orderLookupError
    } = await supabase
      .from('orders')
      .select(`
        id,
        public_id,
        conversation_id,
        basket_id,
        status,
        price,
        paid_price,
        currency,
        payment_id,
        cart_snapshot
      `)
      .eq('iyzico_token', token)
      .maybeSingle();

    if (orderLookupError) {
      console.error(
        'Order lookup error:',
        orderLookupError
      );

      throw new Error(
        'The order belonging to the Iyzico token could not be retrieved.'
      );
    }

    if (!existingOrder) {
      console.error(
        'No order was found for the incoming Iyzico token.'
      );

      return createRedirect(
        request,
        '/explore',
        {
          payment:
            paymentMode ===
            PAYMENT_MODES.DISABLED
              ? 'disabled'
              : 'error'
        }
      );
    }

    /*
      A callback for an existing order must still be processed
      when payments were disabled after checkout began.

      This prevents a valid in-flight payment from being left
      unfinished during a controlled payment-mode change.
    */

    order = existingOrder;

    /*
      Iyzico may send the same callback multiple times.

      A previously verified paid order must not be modified
      or charged/granted again.
    */
    if (order.status === 'paid') {
      return createRedirect(
        request,
        '/payment/success',
        {
          order: order.public_id
        }
      );
    }

    /*
      Retrieve the payment directly from Iyzico.

      The browser redirect itself is not proof that the
      payment succeeded.
    */
    const paymentResult =
      await new Promise(
        (resolve, reject) => {
          iyzipay
            .checkoutForm
            .retrieve(
              {
                locale:
                  Iyzipay.LOCALE.TR,
                token
              },
              (error, result) => {
                if (error) {
                  reject(error);
                  return;
                }

                resolve(result);
              }
            );
        }
      );

    /*
      A confirmed payment failure releases the temporary
      Exclusive reservation so the beat can be purchased
      by another customer.
    */
    if (
      paymentResult.status !==
        'success' ||
      paymentResult.paymentStatus !==
        'SUCCESS'
    ) {
      console.error(
        'Payment failed according to Iyzico:',
        paymentResult
      );

      const {
        error: failedUpdateError
      } = await supabase
        .from('orders')
        .update({
          status:
            'payment_failed',

          payment_status:
            paymentResult
              .paymentStatus ||
            'FAILED',

          failure_reason:
            paymentResult
              .errorMessage ||
            'Iyzico did not report a successful payment.',

          iyzico_response:
            paymentResult,

          updated_at:
            new Date().toISOString()
        })
        .eq('id', order.id)
        .neq('status', 'paid');

      if (failedUpdateError) {
        console.error(
          'Failed payment status could not be saved:',
          failedUpdateError
        );
      }

      await releaseExclusiveReservations(
        supabase,
        order.id
      );

      return createRedirect(
        request,
        '/explore',
        {
          payment: 'failed'
        }
      );
    }

    /*
      Verify that the successful Iyzico payment belongs
      to this exact order.
    */
    const verificationErrors =
      verifyPaymentAgainstOrder(
        paymentResult,
        order,
        token
      );

    if (
      verificationErrors.length > 0
    ) {
      console.error(
        'Payment verification failed:',
        verificationErrors
      );

      const {
        error:
          verificationUpdateError
      } = await supabase
        .from('orders')
        .update({
          status:
            'verification_failed',

          payment_status:
            paymentResult
              .paymentStatus ||
            null,

          failure_reason:
            verificationErrors.join(
              ' '
            ),

          iyzico_response:
            paymentResult,

          updated_at:
            new Date().toISOString()
        })
        .eq('id', order.id)
        .neq('status', 'paid');

      if (
        verificationUpdateError
      ) {
        console.error(
          'Verification failure could not be saved:',
          verificationUpdateError
        );
      }

      /*
        Iyzico reported success, so do not release the
        Exclusive beat automatically.

        Hold it for manual investigation instead.
      */
      await holdExclusiveReservationsForReview(
        supabase,
        order.id
      );

      return createRedirect(
        request,
        '/explore',
        {
          payment: 'error'
        }
      );
    }

    /*
      Finalize the Exclusive reservation before marking the
      order paid.

      If a later database operation fails, the paid
      reservation remains protected and the callback can be
      retried safely.
    */
    await finalizeExclusiveSale(
      supabase,
      order
    );

    const paidAt =
      new Date().toISOString();

    const {
      data: paidOrder,
      error: paidOrderError
    } = await supabase
      .from('orders')
      .update({
        status:
          'paid',

        payment_id:
          String(
            paymentResult.paymentId
          ),

        payment_status:
          paymentResult.paymentStatus,

        paid_price:
          Number(
            paymentResult.paidPrice
          ).toFixed(2),

        iyzico_response:
          paymentResult,

        failure_reason:
          null,

        paid_at:
          paidAt,

        updated_at:
          paidAt
      })
      .eq('id', order.id)
      .neq('status', 'paid')
      .select('id, public_id')
      .maybeSingle();

    if (paidOrderError) {
      console.error(
        'Verified order could not be marked as paid:',
        paidOrderError
      );

      throw new Error(
        'The payment was verified, but the order could not be finalized.'
      );
    }

    /*
      Two valid callbacks can pass the initial paid-status check
      at nearly the same time.

      In that race, one callback marks the order paid and the
      other callback's conditional update returns no row. Re-read
      the order and treat it as success only when the stored
      payment ID matches this verified Iyzico payment.
    */
    if (!paidOrder) {
      const {
        data: concurrentlyPaidOrder,
        error: concurrentOrderError
      } = await supabase
        .from('orders')
        .select(`
          id,
          public_id,
          status,
          payment_id
        `)
        .eq('id', order.id)
        .maybeSingle();

      if (concurrentOrderError) {
        console.error(
          'Concurrent paid order lookup error:',
          concurrentOrderError
        );

        throw new Error(
          'The completed order could not be re-read.'
        );
      }

      const sameVerifiedPayment =
        concurrentlyPaidOrder?.status ===
          'paid' &&
        String(
          concurrentlyPaidOrder.payment_id ||
          ''
        ) ===
          String(paymentResult.paymentId);

      if (!sameVerifiedPayment) {
        console.error(
          'Concurrent callback did not resolve to the same paid order:',
          {
            orderId:
              order.id,

            storedStatus:
              concurrentlyPaidOrder?.status ||
              null,

            storedPaymentId:
              concurrentlyPaidOrder?.payment_id ||
              null,

            retrievedPaymentId:
              paymentResult.paymentId
          }
        );

        throw new Error(
          'The payment was verified, but the order could not be finalized safely.'
        );
      }

      /*
        This update is idempotent. It also recovers item-level
        transaction details when the winning callback completed
        the order update but had not yet stored those details.
      */
      await updateOrderItemTransactions(
        supabase,
        concurrentlyPaidOrder.id,
        paymentResult.itemTransactions
      );

      return createRedirect(
        request,
        '/payment/success',
        {
          order:
            concurrentlyPaidOrder.public_id
        }
      );
    }

    /*
      Store Iyzico's per-item transaction information.
    */
    await updateOrderItemTransactions(
      supabase,
      paidOrder.id,
      paymentResult.itemTransactions
    );

    /*
      Only the public order ID is included in the URL.

      The Iyzico token and payment ID remain private.
    */
    return createRedirect(
      request,
      '/payment/success',
      {
        order:
          paidOrder.public_id
      }
    );
  } catch (error) {
    console.error(
      'Callback processing error:',
      error
    );

    /*
      Do not release an Exclusive reservation here.

      A callback error may occur after Iyzico has successfully
      collected payment. Releasing it could allow the same
      Exclusive beat to be sold twice.
    */
    if (
      supabase &&
      order?.id
    ) {
      const {
        error: callbackUpdateError
      } = await supabase
        .from('orders')
        .update({
          status:
            'callback_error',

          failure_reason:
            error instanceof Error
              ? error.message
              : 'Unknown callback processing error.',

          updated_at:
            new Date().toISOString()
        })
        .eq('id', order.id)
        .neq('status', 'paid');

      if (callbackUpdateError) {
        console.error(
          'Callback error status could not be saved:',
          callbackUpdateError
        );
      }
    }

    return createRedirect(
      request,
      '/explore',
      {
        payment: 'error'
      }
    );
  }
}