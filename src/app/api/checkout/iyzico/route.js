import { createHash, randomUUID } from 'crypto';
import 'postman-request';
import Iyzipay from 'iyzipay';
import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  createItemFinancialSnapshot,
} from '../../../../lib/paymentFinancials';

import {
  PAYMENT_MODES,
  getPaymentMode,
} from '../../../../lib/paymentMode';

export const runtime = 'nodejs';

const EXCLUSIVE_RESERVATION_TTL_MINUTES = 60;
const MAX_CART_ITEMS = 50;

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
                cookieStore.set(name, value, options);
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

function getBaseUrl(request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL(
      process.env.NEXT_PUBLIC_SITE_URL
    );
  }

  return new URL(request.url);
}

function toNullableString(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  return String(value);
}

function normalizeIdempotencyKey(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value
    .trim()
    .toLowerCase();

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  if (!uuidPattern.test(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}

function getBuyerIdentity(user) {
  const metadata = user.user_metadata || {};

  const fullName =
    metadata.full_name ||
    metadata.name ||
    '';

  const nameParts = String(fullName)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const name = nameParts.shift() || 'Test';
  const surname = nameParts.join(' ') || 'Buyer';

  return {
    name,
    surname,
    email: user.email || 'test@test.com',
  };
}

function getBuyerIp(request) {
  const forwardedFor = request.headers.get(
    'x-forwarded-for'
  );

  const forwardedIp = forwardedFor
    ?.split(',')[0]
    ?.trim();

  const realIp = request.headers.get('x-real-ip');
  const detectedIp = forwardedIp || realIp;

  /*
    Iyzico Sandbox may reject local IP addresses,
    so use its Sandbox test IP during local development.
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

function extractRequestedItems(items) {
  return items.map((item, index) => {
    const beatId =
      item.beatId ??
      item.beat_id ??
      item.beat?.id ??
      null;

    const licenseId =
      item.licenseId ??
      item.license_id ??
      item.license?.id ??
      null;

    return {
      index,
      beatId: toNullableString(beatId),
      licenseId: toNullableString(licenseId),
    };
  });
}

async function loadTrustedCartItems(
  supabaseAdmin,
  requestedItems
) {
  const uniqueLicenseIds = [
    ...new Set(
      requestedItems.map((item) => item.licenseId)
    ),
  ];

  const uniqueBeatIds = [
    ...new Set(
      requestedItems.map((item) => item.beatId)
    ),
  ];

  /*
    Browser-provided titles, license names, prices, formats,
    and exclusivity values are never trusted.
  */
  const {
    data: databaseLicenses,
    error: licensesError,
  } = await supabaseAdmin
    .from('licenses')
    .select(`
      id,
      beat_id,
      name,
      price,
      file_format,
      is_exclusive
    `)
    .in('id', uniqueLicenseIds);

  if (licensesError) {
    console.error(
      'License lookup error:',
      licensesError
    );

    throw new Error(
      'The license information could not be retrieved.'
    );
  }

  const {
    data: databaseBeats,
    error: beatsError,
  } = await supabaseAdmin
    .from('beats')
    .select(`
      id,
      title,
      producer_id,
      is_sold_exclusive
    `)
    .in('id', uniqueBeatIds);

  if (beatsError) {
    console.error(
      'Beat lookup error:',
      beatsError
    );

    throw new Error(
      'The beat information could not be retrieved.'
    );
  }

  const licenseMap = new Map(
    (databaseLicenses || []).map((license) => [
      String(license.id),
      license,
    ])
  );

  const beatMap = new Map(
    (databaseBeats || []).map((beat) => [
      String(beat.id),
      beat,
    ])
  );

  const normalizedItems = [];

  for (const requestedItem of requestedItems) {
    const databaseLicense = licenseMap.get(
      String(requestedItem.licenseId)
    );

    const databaseBeat = beatMap.get(
      String(requestedItem.beatId)
    );

    if (!databaseLicense || !databaseBeat) {
      return {
        success: false,
        status: 400,
        error:
          'One or more selected beats or licenses no longer exist.',
      };
    }

    if (
      String(databaseLicense.beat_id) !==
      String(databaseBeat.id)
    ) {
      return {
        success: false,
        status: 400,
        error:
          'A selected license does not belong to the selected beat.',
      };
    }

    if (databaseBeat.is_sold_exclusive) {
      return {
        success: false,
        status: 409,
        error:
          `"${databaseBeat.title}" has already been sold exclusively and is no longer available.`,
      };
    }

    const trustedProducerId =
      toNullableString(
        databaseBeat.producer_id
      );

    if (!trustedProducerId) {
      return {
        success: false,
        status: 400,
        error:
          'One or more selected beats have invalid producer ownership information.',
      };
    }

    const databasePrice = Number(
      databaseLicense.price
    );

    if (
      !Number.isFinite(databasePrice) ||
      databasePrice <= 0
    ) {
      return {
        success: false,
        status: 400,
        error:
          'One or more selected licenses have an invalid database price.',
      };
    }

    const trustedPrice = databasePrice.toFixed(2);

    const trustedTitle = String(
      databaseBeat.title || 'Beat'
    );

    const trustedLicenseName = String(
      databaseLicense.name || 'License'
    );

    const isExclusive = Boolean(
      databaseLicense.is_exclusive
    );

    normalizedItems.push({
      iyzicoItemId: `item_${requestedItem.index}`,
      beatId: String(databaseBeat.id),
      licenseId: String(databaseLicense.id),
      producerId: trustedProducerId,
      title: trustedTitle,
      licenseName: trustedLicenseName,
      price: trustedPrice,
      isExclusive,

      snapshot: {
        beatId: String(databaseBeat.id),
        licenseId: String(databaseLicense.id),
        producerId: trustedProducerId,
        title: trustedTitle,
        licenseName: trustedLicenseName,
        price: trustedPrice,
        fileFormat:
          databaseLicense.file_format || null,
        isExclusive,
      },
    });
  }

  return {
    success: true,
    items: normalizedItems,
  };
}

function createCheckoutRequestHash({
  userId,
  normalizedItems,
}) {
  const canonicalItems = normalizedItems
    .map((item) => ({
      beatId: item.beatId,
      licenseId: item.licenseId,
      producerId: item.producerId,
      price: item.price,
      isExclusive: item.isExclusive,
    }))
    .sort((firstItem, secondItem) => {
      const firstKey =
        `${firstItem.beatId}:${firstItem.licenseId}`;

      const secondKey =
        `${secondItem.beatId}:${secondItem.licenseId}`;

      return firstKey.localeCompare(secondKey);
    });

  const canonicalRequest = JSON.stringify({
    userId: String(userId),
    currency: 'TRY',
    items: canonicalItems,
  });

  return createHash('sha256')
    .update(canonicalRequest)
    .digest('hex');
}

async function findIdempotentOrder({
  supabaseAdmin,
  userId,
  idempotencyKey,
}) {
  const { data: order, error } =
    await supabaseAdmin
      .from('orders')
      .select(`
        id,
        public_id,
        status,
        checkout_request_hash,
        payment_page_url,
        failure_reason,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

  if (error) {
    console.error(
      'Idempotent order lookup error:',
      error
    );

    throw new Error(
      'The existing checkout attempt could not be inspected.'
    );
  }

  return order || null;
}

function createExistingCheckoutResponse({
  existingOrder,
  checkoutRequestHash,
}) {
  if (
    existingOrder.checkout_request_hash !==
    checkoutRequestHash
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'This checkout key has already been used for a different cart. Start a new checkout attempt.',
      },
      {
        status: 409,
      }
    );
  }

  if (
    existingOrder.status ===
      'payment_form_created' &&
    existingOrder.payment_page_url
  ) {
    return NextResponse.json({
      success: true,
      reused: true,
      paymentPageUrl:
        existingOrder.payment_page_url,
      orderPublicId:
        existingOrder.public_id,
    });
  }

  if (existingOrder.status === 'paid') {
    return NextResponse.json(
      {
        success: false,
        error:
          'This checkout attempt has already been paid.',
        orderPublicId:
          existingOrder.public_id,
      },
      {
        status: 409,
      }
    );
  }

  if (
    [
      'initialization_failed',
      'initialization_error',
    ].includes(existingOrder.status)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          existingOrder.failure_reason ||
          'The previous checkout attempt failed. Start a new checkout attempt.',
      },
      {
        status: 409,
      }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        'This checkout request is already being processed. Please wait before trying again.',
      retryable: true,
    },
    {
      status: 409,
      headers: {
        'Retry-After': '2',
      },
    }
  );
}

async function reserveExclusiveBeats(
  supabaseAdmin,
  orderId,
  userId,
  normalizedItems
) {
  const exclusiveBeatIds = [
    ...new Set(
      normalizedItems
        .filter((item) => item.isExclusive)
        .map((item) => item.beatId)
    ),
  ];

  if (exclusiveBeatIds.length === 0) {
    return {
      success: true,
      reservedBeatIds: [],
      expiresAt: null,
    };
  }

  const now = new Date();

  const expiresAt = new Date(
    now.getTime() +
      EXCLUSIVE_RESERVATION_TTL_MINUTES *
        60 *
        1000
  );

  const { error: expiredCleanupError } =
    await supabaseAdmin
      .from('exclusive_beat_reservations')
      .delete()
      .in('beat_id', exclusiveBeatIds)
      .eq('status', 'reserved')
      .lt('expires_at', now.toISOString());

  if (expiredCleanupError) {
    console.error(
      'Expired exclusive reservation cleanup error:',
      expiredCleanupError
    );

    throw new Error(
      'Expired Exclusive reservations could not be cleaned up.'
    );
  }

  const reservationRows = exclusiveBeatIds.map(
    (beatId) => ({
      beat_id: beatId,
      order_id: orderId,
      user_id: userId,
      status: 'reserved',
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
  );

  const { error: reservationError } =
    await supabaseAdmin
      .from('exclusive_beat_reservations')
      .insert(reservationRows);

  if (reservationError) {
    if (reservationError.code === '23505') {
      return {
        success: false,
        status: 409,
        error:
          'One of the Exclusive licenses is currently reserved by another checkout. Please try again later.',
      };
    }

    console.error(
      'Exclusive reservation creation error:',
      reservationError
    );

    throw new Error(
      'The Exclusive license could not be reserved.'
    );
  }

  return {
    success: true,
    reservedBeatIds: exclusiveBeatIds,
    expiresAt: expiresAt.toISOString(),
  };
}

async function releaseExclusiveReservations(
  supabaseAdmin,
  orderId
) {
  if (!supabaseAdmin || !orderId) {
    return;
  }

  const { error: releaseError } =
    await supabaseAdmin
      .from('exclusive_beat_reservations')
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

async function deletePendingOrder(
  supabaseAdmin,
  orderId
) {
  if (!supabaseAdmin || !orderId) {
    return;
  }

  const { error: orderDeleteError } =
    await supabaseAdmin
      .from('orders')
      .delete()
      .eq('id', orderId);

  if (orderDeleteError) {
    console.error(
      'Pending order cleanup error:',
      orderDeleteError
    );
  }
}

async function initializeIyzicoCheckout(
  requestData
) {
  return new Promise((resolve, reject) => {
    iyzipay.checkoutFormInitialize.create(
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

export async function POST(request) {
  let supabaseAdmin;
  let createdOrderId = null;

  try {
    const paymentMode = getPaymentMode();

    if (
      paymentMode ===
      PAYMENT_MODES.DISABLED
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Payments are not currently available.',
          paymentMode,
        },
        {
          status: 503,
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
        'Checkout authentication error:',
        authError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'You must be signed in before starting checkout.',
        },
        {
          status: 401,
        }
      );
    }

    supabaseAdmin = getSupabaseAdmin();

    let requestBody;

    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            'The checkout request body is invalid.',
        },
        {
          status: 400,
        }
      );
    }

    const items = requestBody?.items;

    const idempotencyKey =
      normalizeIdempotencyKey(
        request.headers.get(
          'idempotency-key'
        ) ||
          requestBody?.idempotencyKey
      );

    if (!idempotencyKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'A valid checkout idempotency key is required.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cart is empty',
        },
        {
          status: 400,
        }
      );
    }

    if (items.length > MAX_CART_ITEMS) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The cart contains too many items.',
        },
        {
          status: 400,
        }
      );
    }

    const requestedItems =
      extractRequestedItems(items);

    const hasMissingIdentifiers =
      requestedItems.some(
        (item) =>
          !item.beatId ||
          !item.licenseId
      );

    if (hasMissingIdentifiers) {
      return NextResponse.json(
        {
          success: false,
          error:
            'One or more cart items are missing beat or license information. Please clear the cart and add the license again.',
        },
        {
          status: 400,
        }
      );
    }

    const uniqueBeatIds = new Set(
      requestedItems.map(
        (item) => item.beatId
      )
    );

    if (
      uniqueBeatIds.size !==
      requestedItems.length
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Only one license can be purchased for each beat in a single checkout.',
        },
        {
          status: 400,
        }
      );
    }

    const uniquePurchaseKeys = new Set(
      requestedItems.map(
        (item) =>
          `${item.beatId}:${item.licenseId}`
      )
    );

    if (
      uniquePurchaseKeys.size !==
      requestedItems.length
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The same license cannot be added to the cart more than once.',
        },
        {
          status: 400,
        }
      );
    }

    const trustedCartResult =
      await loadTrustedCartItems(
        supabaseAdmin,
        requestedItems
      );

    if (!trustedCartResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: trustedCartResult.error,
        },
        {
          status:
            trustedCartResult.status || 400,
        }
      );
    }

    const normalizedItems =
      trustedCartResult.items;

    const checkoutRequestHash =
      createCheckoutRequestHash({
        userId: user.id,
        normalizedItems,
      });

    const existingOrder =
      await findIdempotentOrder({
        supabaseAdmin,
        userId: user.id,
        idempotencyKey,
      });

    if (existingOrder) {
      return createExistingCheckoutResponse({
        existingOrder,
        checkoutRequestHash,
      });
    }

    const totalBasketPrice =
      normalizedItems.reduce(
        (sum, item) =>
          sum + Number(item.price),
        0
      );

    const formattedPrice =
      totalBasketPrice.toFixed(2);

    const checkoutReference = randomUUID();

    const conversationId =
      `order_${checkoutReference}`;

    const basketId =
      `basket_${checkoutReference}`;

    const buyer = getBuyerIdentity(user);

    const {
      data: order,
      error: orderError,
    } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        basket_id: basketId,
        status: 'initializing',
        price: formattedPrice,
        paid_price: formattedPrice,
        currency: 'TRY',
        payment_provider: 'iyzico',
        buyer_email: buyer.email,

        cart_snapshot: normalizedItems.map(
          (item) => item.snapshot
        ),

        idempotency_key:
          idempotencyKey,

        checkout_request_hash:
          checkoutRequestHash,

        payment_page_url: null,
      })
      .select('id, public_id')
      .single();

    if (orderError || !order) {
      if (orderError?.code === '23505') {
        const concurrentOrder =
          await findIdempotentOrder({
            supabaseAdmin,
            userId: user.id,
            idempotencyKey,
          });

        if (concurrentOrder) {
          return createExistingCheckoutResponse({
            existingOrder:
              concurrentOrder,
            checkoutRequestHash,
          });
        }
      }

      console.error(
        'Order creation error:',
        orderError
      );

      throw new Error(
        'The pending order could not be created.'
      );
    }

    createdOrderId = order.id;

    const reservationResult =
      await reserveExclusiveBeats(
        supabaseAdmin,
        order.id,
        user.id,
        normalizedItems
      );

    if (!reservationResult.success) {
      await deletePendingOrder(
        supabaseAdmin,
        order.id
      );

      createdOrderId = null;

      return NextResponse.json(
        {
          success: false,
          error:
            reservationResult.error,
        },
        {
          status:
            reservationResult.status ||
            409,
        }
      );
    }

    const orderItemRows =
      normalizedItems.map((item) => {
        const financialSnapshot =
          createItemFinancialSnapshot({
            grossAmount: item.price,
            currency: 'TRY',
          });

        return {
          order_id: order.id,
          beat_id: item.beatId,
          license_id: item.licenseId,
          producer_id: item.producerId,
          title: item.title,
          license_name: item.licenseName,
          price: item.price,
          iyzico_item_id:
            item.iyzicoItemId,
          item_snapshot: item.snapshot,

          gross_amount:
            financialSnapshot.grossAmount,

          platform_fee_amount:
            financialSnapshot
              .platformFeeAmount,

          producer_earning_amount:
            financialSnapshot
              .producerEarningAmount,

          commission_rate:
            financialSnapshot
              .commissionRate,

          currency:
            financialSnapshot.currency,
        };
      });

    const { error: orderItemsError } =
      await supabaseAdmin
        .from('order_items')
        .insert(orderItemRows);

    if (orderItemsError) {
      console.error(
        'Order items creation error:',
        orderItemsError
      );

      await deletePendingOrder(
        supabaseAdmin,
        order.id
      );

      createdOrderId = null;

      throw new Error(
        'The pending order items could not be created.'
      );
    }

    const callbackUrl = new URL(
      '/api/checkout/iyzico/callback',
      getBaseUrl(request)
    ).toString();

    const requestData = {
      locale: Iyzipay.LOCALE.TR,
      conversationId,
      price: formattedPrice,
      paidPrice: formattedPrice,
      currency: Iyzipay.CURRENCY.TRY,
      basketId,

      paymentGroup:
        Iyzipay.PAYMENT_GROUP.PRODUCT,

      callbackUrl,

      buyer: {
        id: user.id,
        name: buyer.name,
        surname: buyer.surname,
        gsmNumber: '+905350000000',
        email: buyer.email,
        identityNumber: '11111111110',

        registrationAddress:
          'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',

        ip: getBuyerIp(request),
        city: 'Istanbul',
        country: 'Turkey',
        zipCode: '34732',
      },

      shippingAddress: {
        contactName:
          `${buyer.name} ${buyer.surname}`,

        city: 'Istanbul',
        country: 'Turkey',

        address:
          'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',

        zipCode: '34732',
      },

      billingAddress: {
        contactName:
          `${buyer.name} ${buyer.surname}`,

        city: 'Istanbul',
        country: 'Turkey',

        address:
          'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',

        zipCode: '34732',
      },

      basketItems: normalizedItems.map(
        (item) => ({
          id: item.iyzicoItemId,

          name:
            `${item.title} - ${item.licenseName}`,

          category1: 'Digital Music',

          itemType:
            Iyzipay.BASKET_ITEM_TYPE
              .VIRTUAL,

          price: item.price,
        })
      ),
    };

    const checkoutForm =
      await initializeIyzicoCheckout(
        requestData
      );

    if (
      checkoutForm.status ===
        'success' &&
      checkoutForm.token &&
      checkoutForm.paymentPageUrl
    ) {
      const {
        error: orderUpdateError,
      } = await supabaseAdmin
        .from('orders')
        .update({
          status:
            'payment_form_created',

          iyzico_token:
            checkoutForm.token,

          payment_page_url:
            checkoutForm.paymentPageUrl,

          iyzico_response:
            checkoutForm,

          updated_at:
            new Date().toISOString(),
        })
        .eq('id', order.id);

      if (orderUpdateError) {
        console.error(
          'Iyzico checkout information could not be saved:',
          orderUpdateError
        );

        throw new Error(
          'The payment form was created, but its details could not be saved.'
        );
      }

      return NextResponse.json({
        success: true,
        reused: false,

        paymentPageUrl:
          checkoutForm.paymentPageUrl,

        orderPublicId:
          order.public_id,

        exclusiveReservationExpiresAt:
          reservationResult.expiresAt,
      });
    }

    console.error(
      'Iyzico initialization failed:',
      checkoutForm
    );

    await releaseExclusiveReservations(
      supabaseAdmin,
      order.id
    );

    const {
      error: failureUpdateError,
    } = await supabaseAdmin
      .from('orders')
      .update({
        status:
          'initialization_failed',

        failure_reason:
          checkoutForm.errorMessage ||
          'Iyzico checkout initialization failed.',

        iyzico_response:
          checkoutForm,

        updated_at:
          new Date().toISOString(),
      })
      .eq('id', order.id);

    if (failureUpdateError) {
      console.error(
        'Initialization failure could not be saved:',
        failureUpdateError
      );
    }

    return NextResponse.json(
      {
        success: false,

        error:
          checkoutForm.errorMessage ||
          'The payment form could not be initialized.',
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      'Critical checkout API error:',
      error
    );

    if (
      supabaseAdmin &&
      createdOrderId
    ) {
      await releaseExclusiveReservations(
        supabaseAdmin,
        createdOrderId
      );

      const {
        error: statusUpdateError,
      } = await supabaseAdmin
        .from('orders')
        .update({
          status:
            'initialization_error',

          failure_reason:
            error instanceof Error
              ? error.message
              : 'Unknown checkout initialization error.',

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          createdOrderId
        );

      if (statusUpdateError) {
        console.error(
          'Order error status could not be saved:',
          statusUpdateError
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
      },
      {
        status: 500,
      }
    );
  }
}