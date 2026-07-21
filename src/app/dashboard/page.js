import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase-server';
import { activateProducerProfile } from './actions';

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

  const paidEarningsText =
    formatCurrencyTotals(
      earningsByStatus.paid
    );

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
                  Pending, available, and paid earnings
                  combined.
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