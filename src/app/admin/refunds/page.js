import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';

import {
  createClient,
} from '@/lib/supabase-server';

import {
  createOrderRefundAction,
  processOrderRefundAction,
} from './actions';

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

function formatCurrency(
  value,
  currency = 'TRY'
) {
  const numericValue =
    Number(value);

  if (!Number.isFinite(numericValue)) {
    return '-';
  }

  try {
    return new Intl.NumberFormat(
      'tr-TR',
      {
        style: 'currency',
        currency:
          String(
            currency || 'TRY'
          ).toUpperCase(),
      }
    ).format(numericValue);
  } catch {
    return `${numericValue.toFixed(2)} ${currency}`;
  }
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '-';
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  ).format(date);
}

function getStatusPresentation(status) {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        background: '#fff7ed',
        color: '#c2410c',
      };

    case 'processing':
      return {
        label: 'Processing',
        background: '#eff6ff',
        color: '#1d4ed8',
      };

    case 'failed':
      return {
        label: 'Failed',
        background: '#fef3f2',
        color: '#b42318',
      };

    case 'manual_review':
      return {
        label: 'Manual Review',
        background: '#f9f5ff',
        color: '#6941c6',
      };

    case 'refunded':
      return {
        label: 'Refunded',
        background: '#ecfdf3',
        color: '#067647',
      };

    default:
      return {
        label: 'Unknown',
        background: '#f2f4f7',
        color: '#475467',
      };
  }
}

function getCartSnapshot(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsedValue =
        JSON.parse(value);

      return Array.isArray(
        parsedValue
      )
        ? parsedValue
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function orderContainsExclusive(order) {
  return getCartSnapshot(
    order.cart_snapshot
  ).some((item) => {
    const value =
      item?.isExclusive ??
      item?.is_exclusive;

    return (
      value === true ||
      value === 1 ||
      String(value).toLowerCase() ===
        'true'
    );
  });
}

function getOrderEligibility({
  itemCount,
  invalidTransactionCount,
  earnings,
}) {
  if (itemCount === 0) {
    return {
      eligible: false,
      reason:
        'The order has no order items.',
    };
  }

  if (
    invalidTransactionCount > 0
  ) {
    return {
      eligible: false,
      reason:
        'One or more order items are missing valid Iyzico transaction details.',
    };
  }

  if (
    earnings.length !== itemCount
  ) {
    return {
      eligible: false,
      reason:
        'The number of producer earnings does not match the number of order items.',
    };
  }

  if (
    earnings.some(
      (earning) =>
        earning.status ===
        'reserved'
    )
  ) {
    return {
      eligible: false,
      reason:
        'Earnings are reserved in an active payout request.',
    };
  }

  if (
    earnings.some(
      (earning) =>
        earning.status === 'paid'
    )
  ) {
    return {
      eligible: false,
      reason:
        'Producer earnings have already been paid out.',
    };
  }

  if (
    earnings.some(
      (earning) =>
        ![
          'pending',
          'available',
        ].includes(
          earning.status
        )
    )
  ) {
    return {
      eligible: false,
      reason:
        'One or more producer earnings cannot be reversed automatically.',
    };
  }

  return {
    eligible: true,
    reason:
      'Eligible for a full refund.',
  };
}

export default async function AdminRefundsPage({
  searchParams,
}) {
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
    console.error(
      'Refund page administrator authorization error:',
      adminCheckError
    );

    redirect('/dashboard');
  }

  const resolvedSearchParams =
    await searchParams;

  const successMessage =
    typeof resolvedSearchParams?.success ===
    'string'
      ? resolvedSearchParams.success
      : '';

  const errorMessage =
    typeof resolvedSearchParams?.error ===
    'string'
      ? resolvedSearchParams.error
      : '';

  const selectedRefundId =
    typeof resolvedSearchParams?.refund ===
    'string'
      ? resolvedSearchParams.refund
      : '';

  const supabaseAdmin =
    getSupabaseAdmin();

  const [
    paidOrdersResult,
    refundsResult,
    refundItemsResult,
    orderItemsResult,
    earningsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select(`
        id,
        public_id,
        buyer_email,
        status,
        paid_price,
        currency,
        payment_id,
        cart_snapshot,
        paid_at,
        refunded_at,
        created_at
      `)
      .eq('status', 'paid')
      .order('paid_at', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(100),

    supabaseAdmin
      .from('order_refunds')
      .select(`
        id,
        order_id,
        created_by,
        provider,
        requested_amount,
        refunded_amount,
        currency,
        status,
        refund_reason,
        restore_exclusive_beats,
        last_error,
        requested_at,
        started_at,
        completed_at,
        failed_at,
        created_at,
        updated_at
      `)
      .order('created_at', {
        ascending: false,
      })
      .limit(100),

    supabaseAdmin
      .from('order_refund_items')
      .select(`
        id,
        order_refund_id,
        order_item_id,
        provider_item_id,
        payment_transaction_id,
        amount,
        currency,
        status,
        failure_reason,
        refunded_at,
        created_at
      `)
      .order('created_at', {
        ascending: true,
      }),

    supabaseAdmin
      .from('order_items')
      .select(`
        id,
        order_id,
        title,
        license_name,
        iyzico_item_id,
        payment_transaction_id,
        iyzico_paid_price,
        currency
      `),

    supabaseAdmin
      .from('producer_earnings')
      .select(`
        id,
        order_id,
        status,
        producer_earning_amount,
        currency
      `),
  ]);

  const loadingErrors = [
    paidOrdersResult.error,
    refundsResult.error,
    refundItemsResult.error,
    orderItemsResult.error,
    earningsResult.error,
  ].filter(Boolean);

  if (
    loadingErrors.length > 0
  ) {
    console.error(
      'Admin refund page loading errors:',
      loadingErrors
    );

    return (
      <div
        style={{
          maxWidth: '1100px',
          margin: '40px auto',
          padding: '0 20px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            padding: '18px',
            border:
              '1px solid #fecdca',
            borderRadius: '10px',
            background: '#fef3f2',
            color: '#b42318',
          }}
        >
          Refund information could not be loaded.
        </div>
      </div>
    );
  }

  const paidOrders =
    paidOrdersResult.data || [];

  const refunds =
    refundsResult.data || [];

  const refundItems =
    refundItemsResult.data || [];

  const orderItems =
    orderItemsResult.data || [];

  const earnings =
    earningsResult.data || [];

  const refundByOrderId =
    new Map(
      refunds.map(
        (refund) => [
          String(refund.order_id),
          refund,
        ]
      )
    );

  const orderById =
    new Map(
      paidOrders.map(
        (order) => [
          String(order.id),
          order,
        ]
      )
    );

  const orderItemsByOrderId =
    new Map();

  for (
    const orderItem
    of orderItems
  ) {
    const orderId =
      String(orderItem.order_id);

    const existingItems =
      orderItemsByOrderId.get(
        orderId
      ) || [];

    existingItems.push(
      orderItem
    );

    orderItemsByOrderId.set(
      orderId,
      existingItems
    );
  }

  const earningsByOrderId =
    new Map();

  for (
    const earning
    of earnings
  ) {
    const orderId =
      String(earning.order_id);

    const existingEarnings =
      earningsByOrderId.get(
        orderId
      ) || [];

    existingEarnings.push(
      earning
    );

    earningsByOrderId.set(
      orderId,
      existingEarnings
    );
  }

  const refundItemsByRefundId =
    new Map();

  for (
    const refundItem
    of refundItems
  ) {
    const refundId =
      String(
        refundItem.order_refund_id
      );

    const existingItems =
      refundItemsByRefundId.get(
        refundId
      ) || [];

    existingItems.push(
      refundItem
    );

    refundItemsByRefundId.set(
      refundId,
      existingItems
    );
  }

  const refundableOrders =
    paidOrders
      .filter(
        (order) =>
          !refundByOrderId.has(
            String(order.id)
          )
      )
      .map((order) => {
        const currentOrderItems =
          orderItemsByOrderId.get(
            String(order.id)
          ) || [];

        const currentEarnings =
          earningsByOrderId.get(
            String(order.id)
          ) || [];

        const invalidTransactionCount =
          currentOrderItems.filter(
            (orderItem) => {
              const amount =
                Number(
                  orderItem
                    .iyzico_paid_price
                );

              return (
                !orderItem
                  .payment_transaction_id ||
                !String(
                  orderItem
                    .payment_transaction_id
                ).trim() ||
                !orderItem
                  .iyzico_item_id ||
                !String(
                  orderItem
                    .iyzico_item_id
                ).trim() ||
                !Number.isFinite(
                  amount
                ) ||
                amount <= 0
              );
            }
          ).length;

        const eligibility =
          getOrderEligibility({
            itemCount:
              currentOrderItems.length,

            invalidTransactionCount,

            earnings:
              currentEarnings,
          });

        return {
          ...order,
          orderItems:
            currentOrderItems,
          earnings:
            currentEarnings,
          eligibility,
          containsExclusive:
            orderContainsExclusive(
              order
            ),
        };
      });

  const eligibleOrderCount =
    refundableOrders.filter(
      (order) =>
        order.eligibility.eligible
    ).length;

  const pendingRefundCount =
    refunds.filter(
      (refund) =>
        refund.status === 'pending'
    ).length;

  const manualReviewCount =
    refunds.filter(
      (refund) =>
        refund.status ===
        'manual_review'
    ).length;

  const completedRefundCount =
    refunds.filter(
      (refund) =>
        refund.status ===
        'refunded'
    ).length;

  const refundedTotal =
    refunds
      .filter(
        (refund) =>
          refund.status ===
          'refunded'
      )
      .reduce(
        (total, refund) =>
          total +
          Number(
            refund.refunded_amount ||
            0
          ),
        0
      );

  return (
    <div
      style={{
        maxWidth: '1250px',
        margin: '40px auto',
        padding:
          '0 20px 60px',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom:
            '1px solid #e5e7eb',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin:
                '0 0 6px 0',
            }}
          >
            Admin Refunds
          </h1>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.5,
            }}
          >
            Create and process full-order Iyzico refunds.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/admin/payouts"
            style={{
              padding:
                '10px 16px',
              border:
                '1px solid #d0d5dd',
              borderRadius: '8px',
              background: '#fff',
              color: '#344054',
              textDecoration:
                'none',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Payouts
          </Link>

          <Link
            href="/dashboard"
            style={{
              padding:
                '10px 16px',
              border:
                '1px solid #d0d5dd',
              borderRadius: '8px',
              background: '#fff',
              color: '#344054',
              textDecoration:
                'none',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Dashboard
          </Link>
        </div>
      </header>

      {successMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding:
              '14px 16px',
            border:
              '1px solid #a6f4c5',
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
            padding:
              '14px 16px',
            border:
              '1px solid #fecdca',
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
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div
          style={{
            padding: '20px',
            border:
              '1px solid #e5e7eb',
            borderRadius: '10px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin:
                '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Eligible Orders
          </p>

          <p
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 'bold',
              color: '#175cd3',
            }}
          >
            {eligibleOrderCount}
          </p>
        </div>

        <div
          style={{
            padding: '20px',
            border:
              '1px solid #e5e7eb',
            borderRadius: '10px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin:
                '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Pending Refunds
          </p>

          <p
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 'bold',
              color: '#c2410c',
            }}
          >
            {pendingRefundCount}
          </p>
        </div>

        <div
          style={{
            padding: '20px',
            border:
              '1px solid #e5e7eb',
            borderRadius: '10px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin:
                '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Manual Review
          </p>

          <p
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 'bold',
              color: '#6941c6',
            }}
          >
            {manualReviewCount}
          </p>
        </div>

        <div
          style={{
            padding: '20px',
            border:
              '1px solid #e5e7eb',
            borderRadius: '10px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin:
                '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Completed Refunds
          </p>

          <p
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 'bold',
              color: '#067647',
            }}
          >
            {completedRefundCount}
          </p>
        </div>

        <div
          style={{
            padding: '20px',
            border:
              '1px solid #e5e7eb',
            borderRadius: '10px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin:
                '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Refunded Total
          </p>

          <p
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 'bold',
              color: '#067647',
            }}
          >
            {formatCurrency(
              refundedTotal,
              'TRY'
            )}
          </p>
        </div>
      </section>

      <section
        style={{
          marginBottom: '40px',
        }}
      >
        <div
          style={{
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin:
                '0 0 6px 0',
            }}
          >
            Paid Orders
          </h2>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.5,
            }}
          >
            Create a refund record only after confirming the order and refund reason.
          </p>
        </div>

        {refundableOrders.length ===
        0 ? (
          <div
            style={{
              padding: '32px',
              border:
                '1px dashed #d0d5dd',
              borderRadius: '10px',
              color: '#667085',
              textAlign: 'center',
              background: '#fff',
            }}
          >
            No paid orders are currently available for refund creation.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: '18px',
            }}
          >
            {refundableOrders.map(
              (order) => (
                <article
                  key={order.id}
                  style={{
                    padding: '22px',
                    border:
                      '1px solid #e5e7eb',
                    borderRadius:
                      '12px',
                    background: '#fff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent:
                        'space-between',
                      alignItems:
                        'flex-start',
                      gap: '20px',
                      flexWrap: 'wrap',
                      marginBottom:
                        '16px',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin:
                            '0 0 6px 0',
                        }}
                      >
                        {formatCurrency(
                          order.paid_price,
                          order.currency
                        )}
                      </h3>

                      <div
                        style={{
                          color:
                            '#667085',
                          fontSize:
                            '13px',
                          lineHeight: 1.6,
                        }}
                      >
                        <div>
                          Paid:{' '}
                          {formatDate(
                            order.paid_at
                          )}
                        </div>

                        <div>
                          Buyer:{' '}
                          {order.buyer_email ||
                            '-'}
                        </div>

                        <div
                          style={{
                            wordBreak:
                              'break-all',
                          }}
                        >
                          Order ID:{' '}
                          {order.id}
                        </div>

                        <div
                          style={{
                            wordBreak:
                              'break-all',
                          }}
                        >
                          Public ID:{' '}
                          {order.public_id}
                        </div>

                        <div>
                          Iyzico payment:{' '}
                          {order.payment_id ||
                            '-'}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth:
                          '240px',
                      }}
                    >
                      <div
                        style={{
                          marginBottom:
                            '8px',
                          padding:
                            '10px 12px',
                          border:
                            order
                              .eligibility
                              .eligible
                              ? '1px solid #a6f4c5'
                              : '1px solid #fecdca',
                          borderRadius:
                            '8px',
                          background:
                            order
                              .eligibility
                              .eligible
                              ? '#ecfdf3'
                              : '#fef3f2',
                          color:
                            order
                              .eligibility
                              .eligible
                              ? '#067647'
                              : '#b42318',
                          fontSize:
                            '13px',
                          lineHeight: 1.5,
                        }}
                      >
                        {
                          order
                            .eligibility
                            .reason
                        }
                      </div>

                      <div
                        style={{
                          color:
                            '#667085',
                          fontSize:
                            '13px',
                          lineHeight: 1.6,
                        }}
                      >
                        <div>
                          Items:{' '}
                          {
                            order
                              .orderItems
                              .length
                          }
                        </div>

                        <div>
                          Earnings:{' '}
                          {
                            order
                              .earnings
                              .length
                          }
                        </div>

                        <div>
                          Exclusive:{' '}
                          {order.containsExclusive
                            ? 'Yes'
                            : 'No'}
                        </div>

                        <div>
                          Earning status:{' '}
                          {[
                            ...new Set(
                              order.earnings.map(
                                (
                                  earning
                                ) =>
                                  earning.status
                              )
                            ),
                          ].join(', ') ||
                            '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {order.eligibility
                    .eligible && (
                    <form
                      action={
                        createOrderRefundAction
                      }
                      style={{
                        paddingTop:
                          '16px',
                        borderTop:
                          '1px solid #e5e7eb',
                      }}
                    >
                      <input
                        type="hidden"
                        name="order_id"
                        value={order.id}
                      />

                      <label
                        htmlFor={`refund_reason_${order.id}`}
                        style={{
                          display:
                            'block',
                          marginBottom:
                            '6px',
                          color:
                            '#344054',
                          fontSize:
                            '13px',
                          fontWeight:
                            'bold',
                        }}
                      >
                        Refund Reason
                      </label>

                      <textarea
                        id={`refund_reason_${order.id}`}
                        name="refund_reason"
                        required
                        minLength={2}
                        maxLength={500}
                        rows={3}
                        placeholder="Explain why this full order refund is being created."
                        style={{
                          width: '100%',
                          boxSizing:
                            'border-box',
                          marginBottom:
                            '12px',
                          padding:
                            '10px 12px',
                          border:
                            '1px solid #d0d5dd',
                          borderRadius:
                            '8px',
                          resize:
                            'vertical',
                          fontFamily:
                            'inherit',
                          fontSize:
                            '14px',
                        }}
                      />

                      {order.containsExclusive && (
                        <label
                          style={{
                            display:
                              'flex',
                            alignItems:
                              'flex-start',
                            gap: '8px',
                            marginBottom:
                              '12px',
                            color:
                              '#344054',
                            fontSize:
                              '13px',
                            lineHeight: 1.5,
                          }}
                        >
                          <input
                            type="checkbox"
                            name="restore_exclusive_beats"
                          />

                          <span>
                            Restore the Exclusive beat for sale after the refund completes.
                          </span>
                        </label>
                      )}

                      <button
                        type="submit"
                        style={{
                          border: 'none',
                          borderRadius:
                            '8px',
                          padding:
                            '11px 16px',
                          background:
                            '#b42318',
                          color: '#fff',
                          fontSize:
                            '14px',
                          fontWeight:
                            'bold',
                          cursor:
                            'pointer',
                        }}
                      >
                        Create Refund Record
                      </button>
                    </form>
                  )}
                </article>
              )
            )}
          </div>
        )}
      </section>

      <section>
        <div
          style={{
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin:
                '0 0 6px 0',
            }}
          >
            Refund Records
          </h2>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.5,
            }}
          >
            Processing a pending refund contacts Iyzico and cannot be automatically undone.
          </p>
        </div>

        {refunds.length === 0 ? (
          <div
            style={{
              padding: '32px',
              border:
                '1px dashed #d0d5dd',
              borderRadius: '10px',
              color: '#667085',
              textAlign: 'center',
              background: '#fff',
            }}
          >
            No refund records have been created yet.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: '18px',
            }}
          >
            {refunds.map(
              (refund) => {
                const presentation =
                  getStatusPresentation(
                    refund.status
                  );

                const refundOrder =
                  orderById.get(
                    String(
                      refund.order_id
                    )
                  );

                const currentRefundItems =
                  refundItemsByRefundId.get(
                    String(
                      refund.id
                    )
                  ) || [];

                const isSelected =
                  selectedRefundId ===
                  String(refund.id);

                return (
                  <article
                    key={refund.id}
                    style={{
                      padding: '22px',
                      border:
                        isSelected
                          ? '2px solid #7f56d9'
                          : '1px solid #e5e7eb',
                      borderRadius:
                        '12px',
                      background: '#fff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'flex-start',
                        gap: '20px',
                        flexWrap:
                          'wrap',
                        marginBottom:
                          '16px',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display:
                              'flex',
                            alignItems:
                              'center',
                            gap: '10px',
                            flexWrap:
                              'wrap',
                            marginBottom:
                              '8px',
                          }}
                        >
                          <h3
                            style={{
                              margin: 0,
                            }}
                          >
                            {formatCurrency(
                              refund.requested_amount,
                              refund.currency
                            )}
                          </h3>

                          <span
                            style={{
                              display:
                                'inline-block',
                              padding:
                                '5px 9px',
                              borderRadius:
                                '999px',
                              background:
                                presentation.background,
                              color:
                                presentation.color,
                              fontSize:
                                '12px',
                              fontWeight:
                                'bold',
                            }}
                          >
                            {
                              presentation.label
                            }
                          </span>
                        </div>

                        <p
                          style={{
                            margin:
                              '0 0 6px 0',
                            color:
                              '#344054',
                            lineHeight:
                              1.5,
                          }}
                        >
                          {
                            refund.refund_reason
                          }
                        </p>

                        <div
                          style={{
                            color:
                              '#667085',
                            fontSize:
                              '13px',
                            lineHeight:
                              1.6,
                          }}
                        >
                          <div>
                            Created:{' '}
                            {formatDate(
                              refund.created_at
                            )}
                          </div>

                          <div>
                            Completed:{' '}
                            {formatDate(
                              refund.completed_at
                            )}
                          </div>

                          <div>
                            Restore Exclusive:{' '}
                            {refund.restore_exclusive_beats
                              ? 'Yes'
                              : 'No'}
                          </div>

                          <div
                            style={{
                              wordBreak:
                                'break-all',
                            }}
                          >
                            Refund ID:{' '}
                            {refund.id}
                          </div>

                          <div
                            style={{
                              wordBreak:
                                'break-all',
                            }}
                          >
                            Order ID:{' '}
                            {
                              refund.order_id
                            }
                          </div>

                          {refundOrder && (
                            <div>
                              Buyer:{' '}
                              {refundOrder.buyer_email ||
                                '-'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          minWidth:
                            '240px',
                          color:
                            '#667085',
                          fontSize:
                            '13px',
                          lineHeight: 1.6,
                        }}
                      >
                        <div>
                          Requested:{' '}
                          {formatCurrency(
                            refund.requested_amount,
                            refund.currency
                          )}
                        </div>

                        <div>
                          Refunded:{' '}
                          {formatCurrency(
                            refund.refunded_amount,
                            refund.currency
                          )}
                        </div>

                        <div>
                          Items:{' '}
                          {
                            currentRefundItems.length
                          }
                        </div>

                        <div
                          style={{
                            wordBreak:
                              'break-all',
                          }}
                        >
                          Created by:{' '}
                          {
                            refund.created_by
                          }
                        </div>
                      </div>
                    </div>

                    {refund.last_error && (
                      <div
                        style={{
                          marginBottom:
                            '14px',
                          padding:
                            '12px 14px',
                          border:
                            '1px solid #fecdca',
                          borderRadius:
                            '8px',
                          background:
                            '#fef3f2',
                          color:
                            '#b42318',
                          fontSize:
                            '13px',
                          lineHeight: 1.5,
                        }}
                      >
                        {refund.last_error}
                      </div>
                    )}

                    {currentRefundItems.length >
                      0 && (
                      <div
                        style={{
                          display:
                            'grid',
                          gap: '8px',
                          marginBottom:
                            '16px',
                        }}
                      >
                        {currentRefundItems.map(
                          (
                            refundItem
                          ) => (
                            <div
                              key={
                                refundItem.id
                              }
                              style={{
                                padding:
                                  '10px 12px',
                                border:
                                  '1px solid #e5e7eb',
                                borderRadius:
                                  '8px',
                                color:
                                  '#475467',
                                fontSize:
                                  '12px',
                                lineHeight:
                                  1.6,
                              }}
                            >
                              <div>
                                {formatCurrency(
                                  refundItem.amount,
                                  refundItem.currency
                                )}{' '}
                                —{' '}
                                {
                                  refundItem.status
                                }
                              </div>

                              <div
                                style={{
                                  wordBreak:
                                    'break-all',
                                }}
                              >
                                Transaction:{' '}
                                {
                                  refundItem.payment_transaction_id
                                }
                              </div>

                              {refundItem.failure_reason && (
                                <div
                                  style={{
                                    color:
                                      '#b42318',
                                  }}
                                >
                                  {
                                    refundItem.failure_reason
                                  }
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {[
                      'pending',
                      'failed',
                    ].includes(
                      refund.status
                    ) && (
                      <form
                        action={
                          processOrderRefundAction
                        }
                        style={{
                          paddingTop:
                            '16px',
                          borderTop:
                            '1px solid #e5e7eb',
                        }}
                      >
                        <input
                          type="hidden"
                          name="refund_id"
                          value={
                            refund.id
                          }
                        />

                        <div
                          style={{
                            marginBottom:
                              '12px',
                            padding:
                              '12px 14px',
                            border:
                              '1px solid #fec84b',
                            borderRadius:
                              '8px',
                            background:
                              '#fffaeb',
                            color:
                              '#93370d',
                            fontSize:
                              '13px',
                            lineHeight:
                              1.5,
                          }}
                        >
                          This action contacts Iyzico and submits the full refund. Confirm the order and amount before continuing.
                        </div>

                        <button
                          type="submit"
                          style={{
                            border:
                              'none',
                            borderRadius:
                              '8px',
                            padding:
                              '11px 16px',
                            background:
                              '#b42318',
                            color: '#fff',
                            fontSize:
                              '14px',
                            fontWeight:
                              'bold',
                            cursor:
                              'pointer',
                          }}
                        >
                          Process Iyzico Refund
                        </button>
                      </form>
                    )}
                  </article>
                );
              }
            )}
          </div>
        )}
      </section>
    </div>
  );
}