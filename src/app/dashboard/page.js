import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase-server';
import { activateProducerProfile } from './actions';
import {
  cancelProducerPayout,
  requestProducerPayout,
  saveProducerPayoutAccount,
} from './payout-actions';

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

function formatCurrency(value, currency = 'TRY') {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '-';
  }

  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
    }).format(numericValue);
  } catch {
    return `${numericValue.toFixed(2)} ${currency}`;
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

function maskIban(value) {
  if (typeof value !== 'string') {
    return '-';
  }

  const normalizedIban = value
    .replace(/\s+/g, '')
    .toUpperCase();

  if (!/^TR[0-9]{24}$/.test(normalizedIban)) {
    return '-';
  }

  return `${normalizedIban.slice(0, 4)} •••• •••• •••• •••• ${normalizedIban.slice(-4)}`;
}

function getPayoutStatusPresentation(status) {
  switch (status) {
    case 'requested':
      return {
        label: 'Requested',
        background: '#fff7ed',
        color: '#c2410c',
      };

    case 'approved':
      return {
        label: 'Approved',
        background: '#eff6ff',
        color: '#1d4ed8',
      };

    case 'paid':
      return {
        label: 'Paid',
        background: '#ecfdf3',
        color: '#067647',
      };

    case 'rejected':
      return {
        label: 'Rejected',
        background: '#fef3f2',
        color: '#b42318',
      };

    case 'cancelled':
      return {
        label: 'Cancelled',
        background: '#f2f4f7',
        color: '#475467',
      };

    default:
      return {
        label: 'Unknown',
        background: '#f2f4f7',
        color: '#475467',
      };
  }
}

function getOrderFromRelation(orderRelation) {
  if (Array.isArray(orderRelation)) {
    return orderRelation[0] ?? null;
  }

  return orderRelation ?? null;
}

function normalizeCurrencyCode(value) {
  if (
    typeof value === 'string' &&
    /^[A-Za-z]{3}$/.test(value.trim())
  ) {
    return value.trim().toUpperCase();
  }

  return 'TRY';
}

function addCurrencyAmount(
  totals,
  currency,
  amount
) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return;
  }

  const normalizedCurrency =
    normalizeCurrencyCode(currency);

  const currentTotal =
    totals.get(normalizedCurrency) ?? 0;

  totals.set(
    normalizedCurrency,
    currentTotal + numericAmount
  );
}

function formatCurrencyTotals(totals) {
  if (!(totals instanceof Map) || totals.size === 0) {
    return formatCurrency(0, 'TRY');
  }

  return Array.from(totals.entries())
    .sort(([firstCurrency], [secondCurrency]) =>
      firstCurrency.localeCompare(secondCurrency)
    )
    .map(([currency, total]) =>
      formatCurrency(total, currency)
    )
    .join(' + ');
}

export default async function DashboardPage({
  searchParams,
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const resolvedSearchParams = await searchParams;

  const successMessage =
    typeof resolvedSearchParams?.success === 'string'
      ? resolvedSearchParams.success
      : '';

  const errorMessage =
    typeof resolvedSearchParams?.error === 'string'
      ? resolvedSearchParams.error
      : '';

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('is_producer')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error(
      'Profile loading error:',
      profileError
    );

    return (
      <div
        style={{
          padding: '40px',
          color: '#b42318',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        Error loading your account profile.
      </div>
    );
  }

  if (!profile.is_producer) {
    return (
      <div
        style={{
          maxWidth: '800px',
          margin: '40px auto',
          padding: '0 20px',
          fontFamily: 'sans-serif',
        }}
      >
        <header
          style={{
            marginBottom: '30px',
            borderBottom: '1px solid #eee',
            paddingBottom: '20px',
          }}
        >
          <h1
            style={{
              margin: '0 0 5px 0',
            }}
          >
            Your Dashboard
          </h1>

          <p
            style={{
              margin: 0,
              color: '#666',
            }}
          >
            Manage your account and marketplace activity.
          </p>
        </header>

        {successMessage && (
          <div
            style={{
              marginBottom: '20px',
              padding: '14px 16px',
              border: '1px solid #a6f4c5',
              borderRadius: '8px',
              background: '#ecfdf3',
              color: '#067647',
            }}
          >
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              marginBottom: '20px',
              padding: '14px 16px',
              border: '1px solid #fecdca',
              borderRadius: '8px',
              background: '#fef3f2',
              color: '#b42318',
            }}
          >
            {errorMessage}
          </div>
        )}

        <section
          style={{
            padding: '32px',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#fff',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px 0',
            }}
          >
            Start Selling Beats
          </h2>

          <p
            style={{
              margin: '0 0 24px 0',
              color: '#666',
              lineHeight: 1.6,
            }}
          >
            Activate producer features to upload beats,
            create licenses, and publish your music in the
            marketplace. Your account will still retain all
            buyer and download features.
          </p>

          <form action={activateProducerProfile}>
            <button
              type="submit"
              style={{
                border: 'none',
                borderRadius: '6px',
                padding: '11px 20px',
                background: '#0070f3',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Activate Producer Profile
            </button>
          </form>
        </section>
      </div>
    );
  }

  const {
    data: myBeatsData,
    error: beatsError,
  } = await supabase
    .from('beats')
    .select(`
      id,
      title,
      bpm,
      created_at,
      licenses (
        name,
        price
      )
    `)
    .eq('producer_id', user.id)
    .order('created_at', {
      ascending: false,
    });

  if (beatsError) {
    console.error(
      'Dashboard beats loading error:',
      beatsError
    );

    return (
      <div
        style={{
          padding: '40px',
          color: '#b42318',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        Error loading dashboard data.
      </div>
    );
  }

  const myBeats = myBeatsData ?? [];

  let paidSales = [];
  let salesErrorMessage = '';

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const {
      data: salesData,
      error: salesError,
    } = await supabaseAdmin
      .from('order_items')
      .select(`
        id,
        beat_id,
        title,
        license_name,
        price,
        gross_amount,
        iyzico_paid_price,
        currency,
        created_at,
        orders!order_items_order_id_fkey!inner (
          public_id,
          status,
          currency,
          paid_at
        )
      `)
      .eq('producer_id', user.id)
      .eq('orders.status', 'paid');

    if (salesError) {
      console.error(
        'Producer sales loading error:',
        salesError
      );

      salesErrorMessage =
        'Verified sales could not be loaded.';
    } else {
      paidSales = (salesData ?? [])
        .map((sale) => {
          const order = getOrderFromRelation(
            sale.orders
          );

          if (!order || order.status !== 'paid') {
            return null;
          }

          const grossAmount = Number(
            sale.gross_amount
          );

          const iyzicoPaidPrice = Number(
            sale.iyzico_paid_price
          );

          const listedPrice = Number(sale.price);

          const paidAmount = Number.isFinite(
            grossAmount
          )
            ? grossAmount
            : Number.isFinite(iyzicoPaidPrice)
              ? iyzicoPaidPrice
              : Number.isFinite(listedPrice)
                ? listedPrice
                : 0;

          return {
            id: sale.id,
            beatId: sale.beat_id,
            title:
              sale.title || 'Purchased Beat',
            licenseName:
              sale.license_name ||
              'Purchased License',
            paidAmount,
            currency: normalizeCurrencyCode(
              sale.currency ||
                order.currency
            ),
            paidAt:
              order.paid_at ||
              sale.created_at,
            orderPublicId:
              order.public_id || null,
          };
        })
        .filter(Boolean)
        .sort((firstSale, secondSale) => {
          const firstTime = new Date(
            firstSale.paidAt
          ).getTime();

          const secondTime = new Date(
            secondSale.paidAt
          ).getTime();

          const safeFirstTime = Number.isFinite(
            firstTime
          )
            ? firstTime
            : 0;

          const safeSecondTime = Number.isFinite(
            secondTime
          )
            ? secondTime
            : 0;

          return safeSecondTime - safeFirstTime;
        });
    }
  } catch (error) {
    console.error(
      'Producer sales dashboard error:',
      error
    );

    salesErrorMessage =
      'Verified sales could not be loaded.';
  }

  let producerEarnings = [];
  let earningsErrorMessage = '';

  try {
    const {
      data: earningsData,
      error: earningsError,
    } = await supabase
      .from('producer_earnings')
      .select(`
        producer_earning_amount,
        currency,
        status
      `)
      .eq('producer_id', user.id);

    if (earningsError) {
      console.error(
        'Producer earnings loading error:',
        earningsError
      );

      earningsErrorMessage =
        'Producer earnings could not be loaded.';
    } else {
      producerEarnings = (earningsData ?? [])
        .map((earning) => {
          const amount = Number(
            earning.producer_earning_amount
          );

          return {
            amount:
              Number.isFinite(amount)
                ? amount
                : 0,
            currency: normalizeCurrencyCode(
              earning.currency
            ),
            status: earning.status,
          };
        });
    }
  } catch (error) {
    console.error(
      'Producer earnings dashboard error:',
      error
    );

    earningsErrorMessage =
      'Producer earnings could not be loaded.';
  }

  let payoutAccount = null;
  let payoutRequests = [];
  let payoutErrorMessage = '';

  try {
    const [
      payoutAccountResult,
      payoutRequestsResult,
    ] = await Promise.all([
      supabase
        .from('producer_payout_accounts')
        .select(`
          id,
          account_holder_name,
          iban,
          currency,
          updated_at
        `)
        .eq('producer_id', user.id)
        .maybeSingle(),

      supabase
        .from('payout_requests')
        .select(`
          id,
          requested_amount,
          currency,
          status,
          account_holder_name_snapshot,
          iban_snapshot,
          approved_at,
          paid_at,
          rejected_at,
          cancelled_at,
          rejection_reason,
          bank_transfer_reference,
          created_at,
          updated_at
        `)
        .eq('producer_id', user.id)
        .order('created_at', {
          ascending: false,
        })
        .limit(20),
    ]);

    if (payoutAccountResult.error) {
      console.error(
        'Producer payout account loading error:',
        payoutAccountResult.error
      );

      payoutErrorMessage =
        'Your payout account could not be loaded.';
    } else {
      payoutAccount = payoutAccountResult.data ?? null;
    }

    if (payoutRequestsResult.error) {
      console.error(
        'Producer payout requests loading error:',
        payoutRequestsResult.error
      );

      payoutErrorMessage = payoutErrorMessage
        ? `${payoutErrorMessage} Your payout history could not be loaded.`
        : 'Your payout history could not be loaded.';
    } else {
      payoutRequests = (
        payoutRequestsResult.data ?? []
      ).map((request) => {
        const requestedAmount = Number(
          request.requested_amount
        );

        return {
          ...request,
          requested_amount:
            Number.isFinite(requestedAmount)
              ? requestedAmount
              : 0,
          currency: normalizeCurrencyCode(
            request.currency
          ),
        };
      });
    }
  } catch (error) {
    console.error(
      'Producer payout dashboard error:',
      error
    );

    payoutErrorMessage =
      'Payout information could not be loaded.';
  }

  const grossSalesByCurrency = new Map();

  for (const sale of paidSales) {
    addCurrencyAmount(
      grossSalesByCurrency,
      sale.currency,
      sale.paidAmount
    );
  }

  const grossSalesText =
    formatCurrencyTotals(
      grossSalesByCurrency
    );

  const earningsByStatus = {
    pending: new Map(),
    available: new Map(),
    reserved: new Map(),
    paid: new Map(),
    total: new Map(),
  };

  let reversedEarningsCount = 0;

  for (const earning of producerEarnings) {
    if (earning.status === 'reversed') {
      reversedEarningsCount += 1;
      continue;
    }

    if (
      earning.status !== 'pending' &&
      earning.status !== 'available' &&
      earning.status !== 'reserved' &&
      earning.status !== 'paid'
    ) {
      continue;
    }

    addCurrencyAmount(
      earningsByStatus[earning.status],
      earning.currency,
      earning.amount
    );

    addCurrencyAmount(
      earningsByStatus.total,
      earning.currency,
      earning.amount
    );
  }

  const totalEarningsText =
    formatCurrencyTotals(
      earningsByStatus.total
    );

  const pendingEarningsText =
    formatCurrencyTotals(
      earningsByStatus.pending
    );

  const availableEarningsText =
    formatCurrencyTotals(
      earningsByStatus.available
    );

  const reservedEarningsText =
    formatCurrencyTotals(
      earningsByStatus.reserved
    );

  const paidEarningsText =
    formatCurrencyTotals(
      earningsByStatus.paid
    );

  const availableTryAmount =
    earningsByStatus.available.get('TRY') ?? 0;

  const activePayoutRequest =
    payoutRequests.find((request) =>
      request.status === 'requested' ||
      request.status === 'approved'
    ) ?? null;

  const canRequestPayout =
    payoutAccount !== null &&
    activePayoutRequest === null &&
    availableTryAmount >= 200 &&
    !payoutErrorMessage;

  const uniqueBeatsSold = new Set(
    paidSales.map((sale) => sale.beatId)
  ).size;

  const recentSales = paidSales.slice(0, 10);

  return (
    <div
      style={{
        maxWidth: '1000px',
        margin: '40px auto',
        padding: '0 20px',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '30px',
          borderBottom: '1px solid #eee',
          paddingBottom: '20px',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 5px 0',
            }}
          >
            Producer Dashboard
          </h1>

          <p
            style={{
              margin: 0,
              color: '#666',
            }}
          >
            Manage your catalog and review verified
            marketplace sales and earnings.
          </p>
        </div>

        <Link
          href="/upload-beat"
          style={{
            flexShrink: 0,
            background: '#0070f3',
            color: '#fff',
            textDecoration: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            fontWeight: 'bold',
          }}
        >
          + Upload New Beat
        </Link>
      </header>

      {successMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            border: '1px solid #a6f4c5',
            borderRadius: '8px',
            background: '#ecfdf3',
            color: '#067647',
          }}
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            border: '1px solid #fecdca',
            borderRadius: '8px',
            background: '#fef3f2',
            color: '#b42318',
          }}
        >
          {errorMessage}
        </div>
      )}

      <section
        style={{
          marginBottom: '40px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: '20px',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2
              style={{
                margin: '0 0 6px 0',
                fontSize: '1.5rem',
              }}
            >
              Sales Overview
            </h2>

            <p
              style={{
                margin: 0,
                color: '#666',
                lineHeight: 1.5,
              }}
            >
              Only successfully verified paid orders
              are included.
            </p>
          </div>
        </div>

        {salesErrorMessage ? (
          <div
            style={{
              padding: '16px',
              border: '1px solid #fecdca',
              borderRadius: '8px',
              background: '#fef3f2',
              color: '#b42318',
            }}
          >
            {salesErrorMessage}
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    color: '#666',
                    fontSize: '14px',
                  }}
                >
                  Gross Sales
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#067647',
                    fontSize: '24px',
                    fontWeight: 'bold',
                  }}
                >
                  {grossSalesText}
                </p>

                <p
                  style={{
                    margin: '8px 0 0 0',
                    color: '#888',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                >
                  Before payment fees, taxes, refunds,
                  and producer payouts.
                </p>
              </div>

              <div
                style={{
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    color: '#666',
                    fontSize: '14px',
                  }}
                >
                  Paid Items
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#111',
                    fontSize: '24px',
                    fontWeight: 'bold',
                  }}
                >
                  {paidSales.length}
                </p>
              </div>

              <div
                style={{
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    color: '#666',
                    fontSize: '14px',
                  }}
                >
                  Unique Beats Sold
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#111',
                    fontSize: '24px',
                    fontWeight: 'bold',
                  }}
                >
                  {uniqueBeatsSold}
                </p>
              </div>
            </div>

            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '1.15rem',
              }}
            >
              Recent Paid Sales
            </h3>

            {recentSales.length === 0 ? (
              <div
                style={{
                  padding: '30px',
                  border: '1px dashed #ccc',
                  borderRadius: '8px',
                  background: '#fff',
                  textAlign: 'center',
                  color: '#666',
                }}
              >
                No verified paid sales have been
                recorded yet.
              </div>
            ) : (
              <div
                style={{
                  overflowX: 'auto',
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  background: '#fff',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: '#f5f5f7',
                        borderBottom:
                          '1px solid #eee',
                      }}
                    >
                      <th
                        style={{
                          padding: '14px',
                        }}
                      >
                        Beat
                      </th>

                      <th
                        style={{
                          padding: '14px',
                        }}
                      >
                        License
                      </th>

                      <th
                        style={{
                          padding: '14px',
                        }}
                      >
                        Paid Amount
                      </th>

                      <th
                        style={{
                          padding: '14px',
                        }}
                      >
                        Paid At
                      </th>

                      <th
                        style={{
                          padding: '14px',
                        }}
                      >
                        Order Reference
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentSales.map((sale) => (
                      <tr
                        key={sale.id}
                        style={{
                          borderBottom:
                            '1px solid #eee',
                        }}
                      >
                        <td
                          style={{
                            padding: '14px',
                            fontWeight: 'bold',
                          }}
                        >
                          {sale.title}
                        </td>

                        <td
                          style={{
                            padding: '14px',
                          }}
                        >
                          {sale.licenseName}
                        </td>

                        <td
                          style={{
                            padding: '14px',
                            color: '#067647',
                            fontWeight: 'bold',
                          }}
                        >
                          {formatCurrency(
                            sale.paidAmount,
                            sale.currency
                          )}
                        </td>

                        <td
                          style={{
                            padding: '14px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatDate(sale.paidAt)}
                        </td>

                        <td
                          style={{
                            padding: '14px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            wordBreak: 'break-all',
                          }}
                        >
                          {sale.orderPublicId || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section
        style={{
          marginBottom: '40px',
        }}
      >
        <div
          style={{
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              margin: '0 0 6px 0',
              fontSize: '1.5rem',
            }}
          >
            Earnings Overview
          </h2>

          <p
            style={{
              margin: 0,
              color: '#666',
              lineHeight: 1.5,
            }}
          >
            Producer earnings are calculated after the
            10% marketplace commission. New earnings remain
            pending for seven days before becoming available.
          </p>
        </div>

        {earningsErrorMessage ? (
          <div
            style={{
              padding: '16px',
              border: '1px solid #fecdca',
              borderRadius: '8px',
              background: '#fef3f2',
              color: '#b42318',
            }}
          >
            {earningsErrorMessage}
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
              }}
            >
              <div
                style={{
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    color: '#666',
                    fontSize: '14px',
                  }}
                >
                  Total Earnings
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#111',
                    fontSize: '24px',
                    fontWeight: 'bold',
                  }}
                >
                  {totalEarningsText}
                </p>

                <p
                  style={{
                    margin: '8px 0 0 0',
                    color: '#888',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                >
                  Pending, available, reserved, and paid
                  earnings combined.
                </p>
              </div>

              <div
                style={{
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    color: '#666',
                    fontSize: '14px',
                  }}
                >
                  Pending
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#b54708',
                    fontSize: '24px',
                    fontWeight: 'bold',
                  }}
                >
                  {pendingEarningsText}
                </p>

                <p
                  style={{
                    margin: '8px 0 0 0',
                    color: '#888',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                >
                  Still inside the seven-day hold period.
                </p>
              </div>

              <div
                style={{
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    color: '#666',
                    fontSize: '14px',
                  }}
                >
                  Available
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#067647',
                    fontSize: '24px',
                    fontWeight: 'bold',
                  }}
                >
                  {availableEarningsText}
                </p>

                <p
                  style={{
                    margin: '8px 0 0 0',
                    color: '#888',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                >
                  Hold completed and eligible for payout.
                </p>
              </div>

              <div
                style={{
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    color: '#666',
                    fontSize: '14px',
                  }}
                >
                  Reserved
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#7f56d9',
                    fontSize: '24px',
                    fontWeight: 'bold',
                  }}
                >
                  {reservedEarningsText}
                </p>

                <p
                  style={{
                    margin: '8px 0 0 0',
                    color: '#888',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                >
                  Included in an active payout request.
                </p>
              </div>

              <div
                style={{
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  background: '#fff',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    color: '#666',
                    fontSize: '14px',
                  }}
                >
                  Paid Out
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#175cd3',
                    fontSize: '24px',
                    fontWeight: 'bold',
                  }}
                >
                  {paidEarningsText}
                </p>

                <p
                  style={{
                    margin: '8px 0 0 0',
                    color: '#888',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                >
                  Earnings recorded as paid to you.
                </p>
              </div>
            </div>

            {reversedEarningsCount > 0 && (
              <p
                style={{
                  margin: '14px 0 0 0',
                  color: '#b42318',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              >
                {reversedEarningsCount}{' '}
                reversed earning
                {reversedEarningsCount === 1
                  ? ''
                  : 's'}{' '}
                excluded from these totals.
              </p>
            )}
          </>
        )}
      </section>

      <section
        style={{
          marginBottom: '40px',
        }}
      >
        <div
          style={{
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              margin: '0 0 6px 0',
              fontSize: '1.5rem',
            }}
          >
            Producer Payouts
          </h2>

          <p
            style={{
              margin: 0,
              color: '#666',
              lineHeight: 1.5,
            }}
          >
            Save a Turkish IBAN and request all available TRY
            earnings when your balance reaches the ₺200 minimum.
          </p>
        </div>

        {payoutErrorMessage && (
          <div
            style={{
              marginBottom: '20px',
              padding: '16px',
              border: '1px solid #fecdca',
              borderRadius: '8px',
              background: '#fef3f2',
              color: '#b42318',
            }}
          >
            {payoutErrorMessage}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              padding: '24px',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              background: '#fff',
            }}
          >
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '1.1rem',
              }}
            >
              Payout Account
            </h3>

            <p
              style={{
                margin: '0 0 20px 0',
                color: '#666',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
            >
              Your full IBAN is never displayed after saving.
              Enter both fields whenever you save changes.
            </p>

            {payoutAccount && (
              <div
                style={{
                  marginBottom: '20px',
                  padding: '14px',
                  border: '1px solid #d1fadf',
                  borderRadius: '8px',
                  background: '#ecfdf3',
                }}
              >
                <p
                  style={{
                    margin: '0 0 6px 0',
                    color: '#067647',
                    fontWeight: 'bold',
                  }}
                >
                  Account saved
                </p>

                <p
                  style={{
                    margin: '0 0 4px 0',
                    color: '#344054',
                    fontSize: '14px',
                  }}
                >
                  {payoutAccount.account_holder_name}
                </p>

                <p
                  style={{
                    margin: 0,
                    color: '#344054',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                  }}
                >
                  {maskIban(payoutAccount.iban)}
                </p>
              </div>
            )}

            <form action={saveProducerPayoutAccount}>
              <label
                htmlFor="account_holder_name"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  color: '#344054',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Account Holder Name
              </label>

              <input
                id="account_holder_name"
                name="account_holder_name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                defaultValue={
                  payoutAccount?.account_holder_name ?? ''
                }
                autoComplete="name"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginBottom: '16px',
                  padding: '11px 12px',
                  border: '1px solid #d0d5dd',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />

              <label
                htmlFor="iban"
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  color: '#344054',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Turkish IBAN
              </label>

              <input
                id="iban"
                name="iban"
                type="text"
                required
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                autoComplete="off"
                inputMode="text"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginBottom: '16px',
                  padding: '11px 12px',
                  border: '1px solid #d0d5dd',
                  borderRadius: '8px',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  textTransform: 'uppercase',
                }}
              />

              <button
                type="submit"
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '11px 16px',
                  background: '#111827',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                {payoutAccount
                  ? 'Update Payout Account'
                  : 'Save Payout Account'}
              </button>
            </form>
          </div>

          <div
            style={{
              padding: '24px',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              background: '#fff',
            }}
          >
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '1.1rem',
              }}
            >
              Request Payout
            </h3>

            <p
              style={{
                margin: '0 0 20px 0',
                color: '#666',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
            >
              A request includes all currently available TRY
              earnings. Requested earnings remain reserved until
              the request is paid, rejected, or cancelled.
            </p>

            <div
              style={{
                marginBottom: '18px',
                padding: '18px',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                background: '#f9fafb',
              }}
            >
              <p
                style={{
                  margin: '0 0 6px 0',
                  color: '#667085',
                  fontSize: '13px',
                }}
              >
                Available to request
              </p>

              <p
                style={{
                  margin: 0,
                  color: '#067647',
                  fontSize: '28px',
                  fontWeight: 'bold',
                }}
              >
                {formatCurrency(
                  availableTryAmount,
                  'TRY'
                )}
              </p>
            </div>

            {activePayoutRequest ? (
              <div
                style={{
                  padding: '16px',
                  border: '1px solid #fedf89',
                  borderRadius: '8px',
                  background: '#fffaeb',
                }}
              >
                <p
                  style={{
                    margin: '0 0 6px 0',
                    color: '#b54708',
                    fontWeight: 'bold',
                  }}
                >
                  Active payout request
                </p>

                <p
                  style={{
                    margin: '0 0 12px 0',
                    color: '#7a2e0e',
                    fontSize: '14px',
                    lineHeight: 1.5,
                  }}
                >
                  {formatCurrency(
                    activePayoutRequest.requested_amount,
                    activePayoutRequest.currency
                  )}{' '}
                  is currently{' '}
                  {
                    getPayoutStatusPresentation(
                      activePayoutRequest.status
                    ).label.toLowerCase()
                  }.
                </p>

                {activePayoutRequest.status ===
                  'requested' && (
                  <form action={cancelProducerPayout}>
                    <input
                      type="hidden"
                      name="payout_request_id"
                      value={activePayoutRequest.id}
                    />

                    <button
                      type="submit"
                      style={{
                        border: '1px solid #f04438',
                        borderRadius: '8px',
                        padding: '9px 14px',
                        background: '#fff',
                        color: '#b42318',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel Request
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <form action={requestProducerPayout}>
                <button
                  type="submit"
                  disabled={!canRequestPayout}
                  style={{
                    width: '100%',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    background: canRequestPayout
                      ? '#0070f3'
                      : '#d0d5dd',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: canRequestPayout
                      ? 'pointer'
                      : 'not-allowed',
                  }}
                >
                  Request Full Available Balance
                </button>
              </form>
            )}

            {!payoutAccount && (
              <p
                style={{
                  margin: '12px 0 0 0',
                  color: '#b54708',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              >
                Save a payout account before requesting a payout.
              </p>
            )}

            {payoutAccount &&
              !activePayoutRequest &&
              availableTryAmount < 200 && (
                <p
                  style={{
                    margin: '12px 0 0 0',
                    color: '#667085',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  You need at least ₺200 in available earnings
                  before requesting a payout.
                </p>
              )}
          </div>
        </div>

        <h3
          style={{
            margin: '0 0 16px 0',
            fontSize: '1.15rem',
          }}
        >
          Payout History
        </h3>

        {payoutRequests.length === 0 ? (
          <div
            style={{
              padding: '30px',
              border: '1px dashed #ccc',
              borderRadius: '8px',
              background: '#fff',
              textAlign: 'center',
              color: '#666',
            }}
          >
            No payout requests have been recorded yet.
          </div>
        ) : (
          <div
            style={{
              overflowX: 'auto',
              border: '1px solid #eee',
              borderRadius: '8px',
              background: '#fff',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#f5f5f7',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <th style={{ padding: '14px' }}>
                    Requested
                  </th>

                  <th style={{ padding: '14px' }}>
                    Amount
                  </th>

                  <th style={{ padding: '14px' }}>
                    Status
                  </th>

                  <th style={{ padding: '14px' }}>
                    Destination
                  </th>

                  <th style={{ padding: '14px' }}>
                    Details
                  </th>
                </tr>
              </thead>

              <tbody>
                {payoutRequests.map((request) => {
                  const presentation =
                    getPayoutStatusPresentation(
                      request.status
                    );

                  return (
                    <tr
                      key={request.id}
                      style={{
                        borderBottom:
                          '1px solid #eee',
                      }}
                    >
                      <td
                        style={{
                          padding: '14px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatDate(request.created_at)}
                      </td>

                      <td
                        style={{
                          padding: '14px',
                          color: '#111',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatCurrency(
                          request.requested_amount,
                          request.currency
                        )}
                      </td>

                      <td
                        style={{
                          padding: '14px',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '5px 9px',
                            borderRadius: '999px',
                            background:
                              presentation.background,
                            color: presentation.color,
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          {presentation.label}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: '14px',
                        }}
                      >
                        <div
                          style={{
                            marginBottom: '4px',
                            fontSize: '13px',
                            fontWeight: 'bold',
                          }}
                        >
                          {
                            request.account_holder_name_snapshot
                          }
                        </div>

                        <div
                          style={{
                            color: '#667085',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {maskIban(
                            request.iban_snapshot
                          )}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: '14px',
                          color: '#667085',
                          fontSize: '13px',
                          lineHeight: 1.5,
                          minWidth: '220px',
                        }}
                      >
                        {request.status === 'paid' && (
                          <>
                            Paid:{' '}
                            {formatDate(request.paid_at)}
                            <br />
                            Transfer reference:{' '}
                            {request.bank_transfer_reference ||
                              '-'}
                          </>
                        )}

                        {request.status ===
                          'rejected' && (
                          <>
                            Rejected:{' '}
                            {formatDate(
                              request.rejected_at
                            )}
                            <br />
                            Reason:{' '}
                            {request.rejection_reason ||
                              '-'}
                          </>
                        )}

                        {request.status ===
                          'cancelled' && (
                          <>
                            Cancelled:{' '}
                            {formatDate(
                              request.cancelled_at
                            )}
                          </>
                        )}

                        {request.status ===
                          'approved' && (
                          <>
                            Approved:{' '}
                            {formatDate(
                              request.approved_at
                            )}
                          </>
                        )}

                        {request.status ===
                          'requested' && (
                          <>
                            Awaiting platform review.
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2
          style={{
            fontSize: '1.5rem',
            marginBottom: '20px',
          }}
        >
          Your Published Beats ({myBeats.length})
        </h2>

        {myBeats.length === 0 ? (
          <div
            style={{
              background: '#fff',
              border: '1px dashed #ccc',
              borderRadius: '8px',
              padding: '40px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                color: '#666',
                margin: '0 0 20px 0',
              }}
            >
              You haven&apos;t uploaded any beats yet.
            </p>

            <Link
              href="/upload-beat"
              style={{
                color: '#0070f3',
                fontWeight: 'bold',
                textDecoration: 'none',
              }}
            >
              Get started →
            </Link>
          </div>
        ) : (
          <div
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: '8px',
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#f5f5f7',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    Title
                  </th>

                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    BPM
                  </th>

                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    Basic Price
                  </th>

                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    Exclusive Price
                  </th>
                </tr>
              </thead>

              <tbody>
                {myBeats.map((beat) => {
                  const licenses = Array.isArray(
                    beat.licenses
                  )
                    ? beat.licenses
                    : [];

                  const basicPrice = Number(
                    licenses.find(
                      (license) =>
                        license.name === 'Basic'
                    )?.price ?? 0
                  );

                  const exclusivePrice = Number(
                    licenses.find(
                      (license) =>
                        license.name === 'Exclusive'
                    )?.price ?? 0
                  );

                  return (
                    <tr
                      key={beat.id}
                      style={{
                        borderBottom:
                          '1px solid #eee',
                      }}
                    >
                      <td
                        style={{
                          padding: '15px',
                          fontWeight: 'bold',
                        }}
                      >
                        {beat.title}
                      </td>

                      <td
                        style={{
                          padding: '15px',
                        }}
                      >
                        {beat.bpm || 'N/A'}
                      </td>

                      <td
                        style={{
                          padding: '15px',
                        }}
                      >
                        ${basicPrice.toFixed(2)}
                      </td>

                      <td
                        style={{
                          padding: '15px',
                        }}
                      >
                        ${exclusivePrice.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}