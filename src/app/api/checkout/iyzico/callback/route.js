import Iyzipay from 'iyzipay';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function getBaseUrl(request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL);
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
    page using GET instead of repeating the POST request.
  */
  return NextResponse.redirect(redirectUrl, 303);
}

async function extractToken(request) {
  const contentType =
    request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await request.json();

    return body?.token || null;
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes(
      'application/x-www-form-urlencoded'
    )
  ) {
    const formData = await request.formData();

    return formData.get('token');
  }

  const rawBody = await request.text();

  if (!rawBody) {
    return null;
  }

  const bodyParams = new URLSearchParams(rawBody);

  return bodyParams.get('token');
}

function moneyToCents(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.round(numericValue * 100);
}

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ''
  );
}

function verifyPaymentAgainstOrder(
  paymentResult,
  order,
  token
) {
  const errors = [];

  if (paymentResult.status !== 'success') {
    errors.push(
      'Iyzico API status is not success.'
    );
  }

  if (
    paymentResult.paymentStatus !== 'SUCCESS'
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
    The order was found using the token saved during
    Checkout Form initialization.

    If Iyzico returns the token again, it must match.
  */
  if (
    hasValue(paymentResult.token) &&
    String(paymentResult.token) !== String(token)
  ) {
    errors.push(
      'The returned Iyzico token does not match.'
    );
  }

  /*
    checkoutForm.retrieve may not include conversationId
    in its response.

    Therefore, compare it only when Iyzico actually
    returns a conversationId.
  */
  if (
    hasValue(paymentResult.conversationId) &&
    String(paymentResult.conversationId) !==
      String(order.conversation_id)
  ) {
    errors.push(
      'The conversation ID does not match the pending order.'
    );
  }

  /*
    Basket ID must be present and must match the order.
  */
  if (!hasValue(paymentResult.basketId)) {
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

  const expectedPrice = moneyToCents(
    order.price
  );

  const expectedPaidPrice = moneyToCents(
    order.paid_price
  );

  const retrievedPrice = moneyToCents(
    paymentResult.price
  );

  const retrievedPaidPrice = moneyToCents(
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
    expectedPaidPrice !== retrievedPaidPrice
  ) {
    errors.push(
      'The retrieved paid price does not match the order.'
    );
  }

  if (
    String(
      paymentResult.currency || ''
    ).toUpperCase() !==
    String(order.currency || '').toUpperCase()
  ) {
    errors.push(
      'The retrieved currency does not match the order.'
    );
  }

  return errors;
}

async function updateOrderItemTransactions(
  supabase,
  orderId,
  itemTransactions
) {
  if (!Array.isArray(itemTransactions)) {
    return;
  }

  const updateResults = await Promise.all(
    itemTransactions.map(
      async (transaction) => {
        if (!transaction.itemId) {
          return null;
        }

        const { error } = await supabase
          .from('order_items')
          .update({
            payment_transaction_id:
              transaction.paymentTransactionId ||
              null,

            iyzico_paid_price:
              transaction.paidPrice !== null &&
              transaction.paidPrice !== undefined
                ? Number(
                    transaction.paidPrice
                  ).toFixed(2)
                : null,

            iyzico_transaction_status:
              transaction.transactionStatus !==
                null &&
              transaction.transactionStatus !==
                undefined
                ? String(
                    transaction.transactionStatus
                  )
                : null
          })
          .eq('order_id', orderId)
          .eq(
            'iyzico_item_id',
            String(transaction.itemId)
          );

        return error;
      }
    )
  );

  const transactionErrors =
    updateResults.filter(Boolean);

  if (transactionErrors.length > 0) {
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
    supabase = getSupabaseAdmin();

    const token = await extractToken(request);

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
      Find the order using the Iyzico token saved during
      Checkout Form initialization.
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
        payment_id
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
          payment: 'error'
        }
      );
    }

    order = existingOrder;

    /*
      Retrieve the result directly from Iyzico.

      The browser redirect itself is not proof that
      the payment was successful.
    */
    const paymentResult = await new Promise(
      (resolve, reject) => {
        iyzipay.checkoutForm.retrieve(
          {
            locale: Iyzipay.LOCALE.TR,
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
      If Iyzico reports failure, store the result
      and redirect to the failed-payment state.
    */
    if (
      paymentResult.status !== 'success' ||
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
          status: 'payment_failed',

          payment_status:
            paymentResult.paymentStatus ||
            'FAILED',

          failure_reason:
            paymentResult.errorMessage ||
            'Iyzico did not report a successful payment.',

          iyzico_response: paymentResult,

          updated_at:
            new Date().toISOString()
        })
        .eq('id', order.id);

      if (failedUpdateError) {
        console.error(
          'Failed payment status could not be saved:',
          failedUpdateError
        );
      }

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
      to the order created before checkout.

      conversationId is checked only when it is present
      in the retrieve response.
    */
    const verificationErrors =
      verifyPaymentAgainstOrder(
        paymentResult,
        order,
        token
      );

    if (verificationErrors.length > 0) {
      console.error(
        'Payment verification failed:',
        verificationErrors
      );

      const {
        error: verificationUpdateError
      } = await supabase
        .from('orders')
        .update({
          status: 'verification_failed',

          payment_status:
            paymentResult.paymentStatus ||
            null,

          failure_reason:
            verificationErrors.join(' '),

          iyzico_response: paymentResult,

          updated_at:
            new Date().toISOString()
        })
        .eq('id', order.id);

      if (verificationUpdateError) {
        console.error(
          'Verification failure could not be saved:',
          verificationUpdateError
        );
      }

      return createRedirect(
        request,
        '/explore',
        {
          payment: 'error'
        }
      );
    }

    /*
      Iyzico may send the same callback more than once.

      If the order is already paid with the same payment ID,
      do not process or grant it a second time.
    */
    if (order.status === 'paid') {
      if (
        order.payment_id &&
        String(order.payment_id) !==
          String(paymentResult.paymentId)
      ) {
        console.error(
          'The order is already paid with a different payment ID.'
        );

        return createRedirect(
          request,
          '/explore',
          {
            payment: 'error'
          }
        );
      }

      return createRedirect(
        request,
        '/payment/success',
        {
          order: order.public_id
        }
      );
    }

    /*
      Mark the verified order as paid.
    */
    const {
      data: paidOrder,
      error: paidOrderError
    } = await supabase
      .from('orders')
      .update({
        status: 'paid',

        payment_id:
          String(paymentResult.paymentId),

        payment_status:
          paymentResult.paymentStatus,

        paid_price:
          Number(
            paymentResult.paidPrice
          ).toFixed(2),

        iyzico_response: paymentResult,

        failure_reason: null,

        paid_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString()
      })
      .eq('id', order.id)
      .select('id, public_id')
      .single();

    if (
      paidOrderError ||
      !paidOrder
    ) {
      console.error(
        'Verified order could not be marked as paid:',
        paidOrderError
      );

      throw new Error(
        'The payment was verified, but the order could not be finalized.'
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
      Only the public order ID is placed in the URL.

      The Iyzico token and payment ID are not exposed.
    */
    return createRedirect(
      request,
      '/payment/success',
      {
        order: paidOrder.public_id
      }
    );
  } catch (error) {
    console.error(
      'Callback processing error:',
      error
    );

    if (
      supabase &&
      order?.id
    ) {
      const {
        error: callbackUpdateError
      } = await supabase
        .from('orders')
        .update({
          status: 'callback_error',

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