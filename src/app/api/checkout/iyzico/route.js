import { randomUUID } from 'crypto';
import Iyzipay from 'iyzipay';

import {
  createClient as createSupabaseAdminClient
} from '@supabase/supabase-js';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const EXCLUSIVE_RESERVATION_TTL_MINUTES = 60;

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
              Authentication can still be read when cookies
              cannot be updated in this request context.
            */
          }
        }
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

function getBuyerIdentity(user) {
  const metadata =
    user.user_metadata || {};

  const fullName =
    metadata.full_name ||
    metadata.name ||
    '';

  const nameParts = String(fullName)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const name =
    nameParts.shift() || 'Test';

  const surname =
    nameParts.join(' ') || 'Buyer';

  return {
    name,
    surname,
    email:
      user.email || 'test@test.com'
  };
}

function getBuyerIp(request) {
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
      beatId:
        toNullableString(beatId),
      licenseId:
        toNullableString(licenseId)
    };
  });
}

async function loadTrustedCartItems(
  supabaseAdmin,
  requestedItems
) {
  const uniqueLicenseIds = [
    ...new Set(
      requestedItems.map(
        (item) => item.licenseId
      )
    )
  ];

  const uniqueBeatIds = [
    ...new Set(
      requestedItems.map(
        (item) => item.beatId
      )
    )
  ];

  /*
    Load the real product information from Supabase.

    Browser-provided titles, license names and prices
    are ignored.
  */
  const {
    data: databaseLicenses,
    error: licensesError
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
    error: beatsError
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
    (databaseLicenses || []).map(
      (license) => [
        String(license.id),
        license
      ]
    )
  );

  const beatMap = new Map(
    (databaseBeats || []).map(
      (beat) => [
        String(beat.id),
        beat
      ]
    )
  );

  const normalizedItems = [];

  for (const requestedItem of requestedItems) {
    const databaseLicense =
      licenseMap.get(
        String(requestedItem.licenseId)
      );

    const databaseBeat =
      beatMap.get(
        String(requestedItem.beatId)
      );

    if (!databaseLicense || !databaseBeat) {
      return {
        success: false,
        status: 400,
        error:
          'One or more selected beats or licenses no longer exist.'
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
          'A selected license does not belong to the selected beat.'
      };
    }

    /*
      Once an Exclusive license has been paid, no further
      license type can be purchased for that beat.
    */
    if (databaseBeat.is_sold_exclusive) {
      return {
        success: false,
        status: 409,
        error:
          `"${databaseBeat.title}" has already been sold exclusively and is no longer available.`
      };
    }

    const databasePrice =
      Number(databaseLicense.price);

    if (
      !Number.isFinite(databasePrice) ||
      databasePrice <= 0
    ) {
      return {
        success: false,
        status: 400,
        error:
          'One or more selected licenses have an invalid database price.'
      };
    }

    const trustedPrice =
      databasePrice.toFixed(2);

    const trustedTitle =
      String(
        databaseBeat.title || 'Beat'
      );

    const trustedLicenseName =
      String(
        databaseLicense.name ||
          'License'
      );

    const isExclusive =
      Boolean(
        databaseLicense.is_exclusive
      );

    normalizedItems.push({
      iyzicoItemId:
        `item_${requestedItem.index}`,

      beatId:
        String(databaseBeat.id),

      licenseId:
        String(databaseLicense.id),

      title:
        trustedTitle,

      licenseName:
        trustedLicenseName,

      price:
        trustedPrice,

      isExclusive,

      snapshot: {
        beatId:
          String(databaseBeat.id),

        licenseId:
          String(databaseLicense.id),

        title:
          trustedTitle,

        licenseName:
          trustedLicenseName,

        price:
          trustedPrice,

        fileFormat:
          databaseLicense.file_format ||
          null,

        isExclusive
      }
    });
  }

  return {
    success: true,
    items: normalizedItems
  };
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
        .filter(
          (item) => item.isExclusive
        )
        .map(
          (item) => item.beatId
        )
    )
  ];

  if (exclusiveBeatIds.length === 0) {
    return {
      success: true,
      reservedBeatIds: [],
      expiresAt: null
    };
  }

  const now = new Date();

  const expiresAt = new Date(
    now.getTime() +
      EXCLUSIVE_RESERVATION_TTL_MINUTES *
        60 *
        1000
  );

  /*
    Remove expired unpaid reservations for the beats
    currently being checked out.

    Paid reservations are never removed here.
  */
  const {
    error: expiredCleanupError
  } = await supabaseAdmin
    .from('exclusive_beat_reservations')
    .delete()
    .in('beat_id', exclusiveBeatIds)
    .eq('status', 'reserved')
    .lt(
      'expires_at',
      now.toISOString()
    );

  if (expiredCleanupError) {
    console.error(
      'Expired exclusive reservation cleanup error:',
      expiredCleanupError
    );

    throw new Error(
      'Expired Exclusive reservations could not be cleaned up.'
    );
  }

  /*
    beat_id is the primary key of the reservation table.

    Therefore, two simultaneous checkouts cannot reserve
    the same beat. One insert succeeds and the other gets
    a duplicate-key conflict.
  */
  const reservationRows =
    exclusiveBeatIds.map((beatId) => ({
      beat_id: beatId,
      order_id: orderId,
      user_id: userId,
      status: 'reserved',
      expires_at:
        expiresAt.toISOString(),
      updated_at:
        now.toISOString()
    }));

  const {
    error: reservationError
  } = await supabaseAdmin
    .from('exclusive_beat_reservations')
    .insert(reservationRows);

  if (reservationError) {
    if (
      reservationError.code === '23505'
    ) {
      return {
        success: false,
        status: 409,
        error:
          'One of the Exclusive licenses is currently reserved by another checkout. Please try again later.'
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
    reservedBeatIds:
      exclusiveBeatIds,
    expiresAt:
      expiresAt.toISOString()
  };
}

async function releaseExclusiveReservations(
  supabaseAdmin,
  orderId
) {
  if (!supabaseAdmin || !orderId) {
    return;
  }

  const {
    error: releaseError
  } = await supabaseAdmin
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

  /*
    The reservation table uses ON DELETE CASCADE,
    so deleting the pending order also deletes its
    associated unpaid reservation.
  */
  const {
    error: orderDeleteError
  } = await supabaseAdmin
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

export async function POST(request) {
  let supabaseAdmin;
  let createdOrderId = null;

  try {
    /*
      Authenticate using the Supabase session stored
      in the browser cookies.
    */
    const supabaseAuth =
      await getSupabaseAuthClient();

    const {
      data: { user },
      error: authError
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
            'You must be signed in before starting checkout.'
        },
        {
          status: 401
        }
      );
    }

    supabaseAdmin =
      getSupabaseAdmin();

    const requestBody =
      await request.json();

    const items =
      requestBody?.items;

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cart is empty'
        },
        {
          status: 400
        }
      );
    }

    if (items.length > 50) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The cart contains too many items.'
        },
        {
          status: 400
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
            'One or more cart items are missing beat or license information. Please clear the cart and add the license again.'
        },
        {
          status: 400
        }
      );
    }

    /*
      Only one license for a particular beat may exist
      in the same cart.
    */
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
            'Only one license can be purchased for each beat in a single checkout.'
        },
        {
          status: 400
        }
      );
    }

    const uniquePurchaseKeys =
      new Set(
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
            'The same license cannot be added to the cart more than once.'
        },
        {
          status: 400
        }
      );
    }

    /*
      Replace all browser-provided product information
      with trusted database values.
    */
    const trustedCartResult =
      await loadTrustedCartItems(
        supabaseAdmin,
        requestedItems
      );

    if (!trustedCartResult.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            trustedCartResult.error
        },
        {
          status:
            trustedCartResult.status ||
            400
        }
      );
    }

    const normalizedItems =
      trustedCartResult.items;

    /*
      Preserve the strict Iyzico price logic.

      The reduce now uses only database-verified
      two-decimal price strings.
    */
    const totalBasketPrice =
      normalizedItems.reduce(
        (sum, item) =>
          sum + Number(item.price),
        0
      );

    const formattedPrice =
      totalBasketPrice.toFixed(2);

    const checkoutReference =
      randomUUID();

    const conversationId =
      `order_${checkoutReference}`;

    const basketId =
      `basket_${checkoutReference}`;

    const buyer =
      getBuyerIdentity(user);

    /*
      Create the order before attempting the Exclusive
      reservation because the reservation references order_id.
    */
    const {
      data: order,
      error: orderError
    } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id:
          user.id,

        conversation_id:
          conversationId,

        basket_id:
          basketId,

        status:
          'pending',

        price:
          formattedPrice,

        paid_price:
          formattedPrice,

        currency:
          'TRY',

        payment_provider:
          'iyzico',

        buyer_email:
          buyer.email,

        cart_snapshot:
          normalizedItems.map(
            (item) => item.snapshot
          )
      })
      .select('id, public_id')
      .single();

    if (orderError || !order) {
      console.error(
        'Order creation error:',
        orderError
      );

      throw new Error(
        'The pending order could not be created.'
      );
    }

    createdOrderId =
      order.id;

    /*
      Reserve every Exclusive beat before creating
      the Iyzico Checkout Form.
    */
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
            reservationResult.error
        },
        {
          status:
            reservationResult.status ||
            409
        }
      );
    }

    const orderItemRows =
      normalizedItems.map((item) => ({
        order_id:
          order.id,

        beat_id:
          item.beatId,

        license_id:
          item.licenseId,

        title:
          item.title,

        license_name:
          item.licenseName,

        price:
          item.price,

        iyzico_item_id:
          item.iyzicoItemId,

        item_snapshot:
          item.snapshot
      }));

    const {
      error: orderItemsError
    } = await supabaseAdmin
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
      locale:
        Iyzipay.LOCALE.TR,

      conversationId,

      price:
        formattedPrice,

      paidPrice:
        formattedPrice,

      currency:
        Iyzipay.CURRENCY.TRY,

      basketId,

      paymentGroup:
        Iyzipay.PAYMENT_GROUP.PRODUCT,

      callbackUrl,

      buyer: {
        id:
          user.id,

        name:
          buyer.name,

        surname:
          buyer.surname,

        gsmNumber:
          '+905350000000',

        email:
          buyer.email,

        identityNumber:
          '11111111110',

        registrationAddress:
          'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',

        ip:
          getBuyerIp(request),

        city:
          'Istanbul',

        country:
          'Turkey',

        zipCode:
          '34732'
      },

      shippingAddress: {
        contactName:
          `${buyer.name} ${buyer.surname}`,

        city:
          'Istanbul',

        country:
          'Turkey',

        address:
          'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',

        zipCode:
          '34732'
      },

      billingAddress: {
        contactName:
          `${buyer.name} ${buyer.surname}`,

        city:
          'Istanbul',

        country:
          'Turkey',

        address:
          'Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1',

        zipCode:
          '34732'
      },

      basketItems:
        normalizedItems.map(
          (item) => ({
            id:
              item.iyzicoItemId,

            name:
              `${item.title} - ${item.licenseName}`,

            category1:
              'Digital Music',

            itemType:
              Iyzipay
                .BASKET_ITEM_TYPE
                .VIRTUAL,

            price:
              item.price
          })
        )
    };

    const checkoutForm =
      await new Promise(
        (resolve, reject) => {
          iyzipay
            .checkoutFormInitialize
            .create(
              requestData,
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

    if (
      checkoutForm.status ===
        'success' &&
      checkoutForm.token &&
      checkoutForm.paymentPageUrl
    ) {
      const {
        error: orderUpdateError
      } = await supabaseAdmin
        .from('orders')
        .update({
          status:
            'payment_form_created',

          iyzico_token:
            checkoutForm.token,

          iyzico_response:
            checkoutForm,

          updated_at:
            new Date().toISOString()
        })
        .eq('id', order.id);

      if (orderUpdateError) {
        console.error(
          'Iyzico token could not be saved:',
          orderUpdateError
        );

        throw new Error(
          'The payment form was created, but its token could not be saved.'
        );
      }

      return NextResponse.json({
        success: true,

        paymentPageUrl:
          checkoutForm.paymentPageUrl,

        exclusiveReservationExpiresAt:
          reservationResult.expiresAt
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

    await supabaseAdmin
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
          new Date().toISOString()
      })
      .eq('id', order.id);

    return NextResponse.json(
      {
        success: false,
        error:
          checkoutForm.errorMessage ||
          'The payment form could not be initialized.'
      },
      {
        status: 400
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
        error: statusUpdateError
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
            new Date().toISOString()
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
        error:
          'Internal Server Error'
      },
      {
        status: 500
      }
    );
  }
}