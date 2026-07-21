import Link from 'next/link';

import {
  createClient as createSupabaseAdminClient
} from '@supabase/supabase-js';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import ClearCartOnSuccess from './ClearCartOnSuccess';
import DownloadButton from './DownloadButton';

export const dynamic = 'force-dynamic';

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

        setAll() {
          /*
            This page only needs to read the authenticated
            session. Cookie refreshing is handled elsewhere.
          */
        }
      }
    }
  );
}

function formatPrice(value, currency) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '-';
  }

  try {
    return new Intl.NumberFormat(
      'tr-TR',
      {
        style: 'currency',
        currency: currency || 'TRY'
      }
    ).format(numericValue);
  } catch {
    return `${numericValue.toFixed(2)} ${
      currency || 'TRY'
    }`;
  }
}

export default async function PaymentSuccessPage({
  searchParams
}) {
  const params = await searchParams;

  const rawOrderId = params?.order;

  const orderPublicId = Array.isArray(
    rawOrderId
  )
    ? rawOrderId[0]
    : rawOrderId;

  let order = null;
  let orderItems = [];
  let user = null;
  let pageError = '';

  try {
    const supabaseAuth =
      await getSupabaseAuthClient();

    const {
      data: { user: authenticatedUser },
      error: authError
    } = await supabaseAuth.auth.getUser();

    if (authError || !authenticatedUser) {
      pageError =
        'You must be signed in to view and download this purchase.';
    } else {
      user = authenticatedUser;
    }

    if (!orderPublicId) {
      pageError =
        'The order reference is missing.';
    }

    if (user && orderPublicId) {
      const supabaseAdmin =
        getSupabaseAdmin();

      /*
        Only load an order when:
        - its public reference matches,
        - it belongs to the signed-in user,
        - its payment status is paid.
      */
      const {
        data: purchasedOrder,
        error: orderError
      } = await supabaseAdmin
        .from('orders')
        .select(`
          id,
          public_id,
          status,
          price,
          paid_price,
          currency,
          paid_at
        `)
        .eq('public_id', orderPublicId)
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .maybeSingle();

      if (orderError) {
        console.error(
          'Success page order lookup error:',
          orderError
        );

        pageError =
          'The purchased order could not be loaded.';
      } else if (!purchasedOrder) {
        pageError =
          'This paid order was not found or does not belong to your account.';
      } else {
        order = purchasedOrder;

        const {
          data: purchasedItems,
          error: itemsError
        } = await supabaseAdmin
          .from('order_items')
          .select(`
            id,
            beat_id,
            license_id,
            title,
            license_name,
            price,
            created_at
          `)
          .eq('order_id', purchasedOrder.id)
          .order('created_at', {
            ascending: true
          });

        if (itemsError) {
          console.error(
            'Success page order items error:',
            itemsError
          );

          pageError =
            'The purchased items could not be loaded.';
        } else {
          orderItems = purchasedItems || [];
        }
      }
    }
  } catch (error) {
    console.error(
      'Payment success page error:',
      error
    );

    pageError =
      'The purchase details could not be loaded.';
  }

  return (
    <main className="min-h-[calc(100vh-80px)] bg-neutral-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 text-3xl text-green-400">
            ✓
          </div>

          <h1 className="text-3xl font-bold">
            Payment Successful
          </h1>

          <p className="mt-4 text-neutral-300">
            Your payment was verified and your
            purchase is ready.
          </p>
        </div>

        {pageError ? (
          <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-center">
            <p className="text-red-300">
              {pageError}
            </p>

            {!user && (
              <Link
                href="/login"
                className="mt-5 inline-flex rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500"
              >
                Sign In
              </Link>
            )}
          </div>
        ) : (
          <>
            <ClearCartOnSuccess />

            <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-neutral-400">
                    Order reference
                  </p>

                  <p className="mt-1 break-all font-mono text-sm text-white">
                    {order.public_id}
                  </p>
                </div>

                <div className="sm:text-right">
                  <p className="text-sm text-neutral-400">
                    Paid total
                  </p>

                  <p className="mt-1 text-lg font-bold text-green-400">
                    {formatPrice(
                      order.paid_price,
                      order.currency
                    )}
                  </p>
                </div>
              </div>
            </div>

            <section className="mt-8">
              <h2 className="text-xl font-bold">
                Purchased Items
              </h2>

              {orderItems.length === 0 ? (
                <p className="mt-4 text-neutral-400">
                  No purchased items were found for
                  this order.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {orderItems.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl border border-neutral-800 bg-neutral-950 p-5"
                    >
                      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">
                            {item.title ||
                              'Purchased Beat'}
                          </h3>

                          <p className="mt-1 text-sm text-neutral-400">
                            {item.license_name ||
                              'Purchased License'}
                          </p>

                          <p className="mt-2 font-medium text-white">
                            {formatPrice(
                              item.price,
                              order.currency
                            )}
                          </p>
                        </div>

                        <DownloadButton
                          orderItemId={item.id}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/explore"
            className="inline-flex rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Return to Explore
          </Link>
        </div>
      </div>
    </main>
  );
}