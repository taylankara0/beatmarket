import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase-server';
import DownloadButton from '../payment/success/DownloadButton';

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
        persistSession: false,
      },
    }
  );
}

function formatPrice(value, currency) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '-';
  }

  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency || 'TRY',
    }).format(numericValue);
  } catch {
    return `${numericValue.toFixed(2)} ${
      currency || 'TRY'
    }`;
  }
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default async function LibraryPage() {
  const supabaseAuth = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    redirect(
      `/login?error=${encodeURIComponent(
        'You must be signed in to view your purchase library.'
      )}`
    );
  }

  let purchasedItems = [];
  let pageError = '';

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const {
      data: paidOrders,
      error: ordersError,
    } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        public_id,
        currency,
        paid_at,
        created_at
      `)
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .order('paid_at', {
        ascending: false,
        nullsFirst: false,
      });

    if (ordersError) {
      console.error(
        'Purchase library orders error:',
        ordersError
      );

      pageError =
        'Your paid orders could not be loaded.';
    } else if (paidOrders?.length) {
      const orderIds = paidOrders.map(
        (order) => order.id
      );

      const orderById = new Map(
        paidOrders.map((order) => [
          order.id,
          order,
        ])
      );

      const {
        data: orderItems,
        error: itemsError,
      } = await supabaseAdmin
        .from('order_items')
        .select(`
          id,
          order_id,
          beat_id,
          license_id,
          title,
          license_name,
          price,
          created_at
        `)
        .in('order_id', orderIds)
        .order('created_at', {
          ascending: false,
        });

      if (itemsError) {
        console.error(
          'Purchase library items error:',
          itemsError
        );

        pageError =
          'Your purchased items could not be loaded.';
      } else {
        purchasedItems = (orderItems || [])
          .map((item) => {
            const order = orderById.get(
              item.order_id
            );

            if (!order) {
              return null;
            }

            return {
              ...item,
              orderPublicId: order.public_id,
              currency: order.currency || 'TRY',
              paidAt:
                order.paid_at ||
                order.created_at ||
                item.created_at,
            };
          })
          .filter(Boolean)
          .sort(
            (firstItem, secondItem) =>
              new Date(secondItem.paidAt).getTime() -
              new Date(firstItem.paidAt).getTime()
          );
      }
    }
  } catch (error) {
    console.error(
      'Purchase library page error:',
      error
    );

    pageError =
      'Your purchase library could not be loaded.';
  }

  return (
    <main className="min-h-[calc(100vh-80px)] bg-neutral-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Purchase Library
            </h1>

            <p className="mt-3 text-neutral-400">
              Access the master tracks from your
              successfully paid orders.
            </p>
          </div>

          <Link
            href="/explore"
            className="inline-flex rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Explore More Beats
          </Link>
        </header>

        {pageError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-red-300">
              {pageError}
            </p>
          </div>
        ) : purchasedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900 p-10 text-center">
            <h2 className="text-xl font-semibold">
              Your library is empty
            </h2>

            <p className="mt-3 text-neutral-400">
              Purchased beats will appear here after
              their payments are successfully verified.
            </p>

            <Link
              href="/explore"
              className="mt-6 inline-flex rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500"
            >
              Browse Beats
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-neutral-400">
              {purchasedItems.length}{' '}
              {purchasedItems.length === 1
                ? 'purchased item'
                : 'purchased items'}
            </p>

            <div className="space-y-5">
              {purchasedItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg"
                >
                  <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {item.title ||
                          'Purchased Beat'}
                      </h2>

                      <p className="mt-2 text-sm text-neutral-400">
                        {item.license_name ||
                          'Purchased License'}
                      </p>

                      <p className="mt-3 font-medium text-white">
                        {formatPrice(
                          item.price,
                          item.currency
                        )}
                      </p>

                      <div className="mt-4 space-y-1 text-xs text-neutral-500">
                        <p>
                          Purchased:{' '}
                          {formatDate(item.paidAt)}
                        </p>

                        <p className="break-all font-mono">
                          Order:{' '}
                          {item.orderPublicId || '-'}
                        </p>
                      </div>
                    </div>

                    <DownloadButton
                      orderItemId={item.id}
                    />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}