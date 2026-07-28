import 'server-only';

import { Resend } from 'resend';

import {
  logError,
  logInfo,
  logWarning,
} from './serverLogger';

const DEFAULT_FROM_EMAIL =
  'BeatMarket <onboarding@resend.dev>';

const DELIVERY_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
};

function getResendClient() {
  const apiKey =
    process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

function getFromEmail() {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    DEFAULT_FROM_EMAIL
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatMoney(
  value,
  currency = 'TRY'
) {
  const numericValue =
    Number(value);

  if (!Number.isFinite(numericValue)) {
    return `0.00 ${currency}`;
  }

  try {
    return new Intl.NumberFormat(
      'tr-TR',
      {
        style: 'currency',
        currency:
          String(currency || 'TRY')
            .toUpperCase(),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(numericValue);
  } catch {
    return `${numericValue.toFixed(2)} ${currency}`;
  }
}

function getDashboardUrl(baseUrl) {
  try {
    return new URL(
      '/dashboard',
      baseUrl
    ).toString();
  } catch {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL;

    if (!siteUrl) {
      return null;
    }

    try {
      return new URL(
        '/dashboard',
        siteUrl
      ).toString();
    } catch {
      return null;
    }
  }
}

function calculateRefundRatio({
  refundedAmount,
  originalGrossAmount,
}) {
  const normalizedRefundedAmount =
    Number(refundedAmount);

  const normalizedOriginalGrossAmount =
    Number(originalGrossAmount);

  if (
    !Number.isFinite(
      normalizedRefundedAmount
    ) ||
    !Number.isFinite(
      normalizedOriginalGrossAmount
    ) ||
    normalizedRefundedAmount <= 0 ||
    normalizedOriginalGrossAmount <= 0
  ) {
    return 0;
  }

  return Math.min(
    1,
    normalizedRefundedAmount /
      normalizedOriginalGrossAmount
  );
}

async function loadCompletedRefund({
  supabase,
  refundId,
}) {
  const {
    data: refund,
    error,
  } = await supabase
    .from('order_refunds')
    .select(`
      id,
      order_id,
      requested_amount,
      refunded_amount,
      currency,
      status,
      refund_reason,
      created_at,
      updated_at
    `)
    .eq('id', refundId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `The completed refund could not be loaded: ${error.message}`
    );
  }

  if (!refund) {
    throw new Error(
      'The completed refund no longer exists.'
    );
  }

  if (refund.status !== 'refunded') {
    throw new Error(
      'Producer refund notifications require a completed refund.'
    );
  }

  return refund;
}

async function loadOrder({
  supabase,
  orderId,
}) {
  const {
    data: order,
    error,
  } = await supabase
    .from('orders')
    .select(`
      id,
      public_id,
      status,
      currency
    `)
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `The refunded order could not be loaded: ${error.message}`
    );
  }

  if (!order) {
    throw new Error(
      'The refunded order no longer exists.'
    );
  }

  return order;
}

async function loadRefundItems({
  supabase,
  refundId,
}) {
  const {
    data: refundItems,
    error,
  } = await supabase
    .from('order_refund_items')
    .select(`
      id,
      order_refund_id,
      order_item_id,
      amount,
      currency,
      status,
      created_at
    `)
    .eq(
      'order_refund_id',
      refundId
    )
    .order('created_at', {
      ascending: true,
    })
    .order('id', {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `The refunded order items could not be loaded: ${error.message}`
    );
  }

  return (refundItems || []).filter(
    (refundItem) =>
      refundItem.status === 'refunded'
  );
}

async function loadOrderItems({
  supabase,
  orderItemIds,
}) {
  if (orderItemIds.length === 0) {
    return [];
  }

  const {
    data: orderItems,
    error,
  } = await supabase
    .from('order_items')
    .select(`
      id,
      order_id,
      producer_id,
      beat_id,
      gross_amount,
      platform_fee_amount,
      producer_earning_amount,
      currency,
      created_at
    `)
    .in('id', orderItemIds)
    .order('created_at', {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `The original producer sale items could not be loaded: ${error.message}`
    );
  }

  return orderItems || [];
}

async function loadBeatTitles({
  supabase,
  beatIds,
}) {
  if (beatIds.length === 0) {
    return new Map();
  }

  const {
    data: beats,
    error,
  } = await supabase
    .from('beats')
    .select(`
      id,
      title
    `)
    .in('id', beatIds);

  if (error) {
    throw new Error(
      `The refunded beat titles could not be loaded: ${error.message}`
    );
  }

  return new Map(
    (beats || []).map((beat) => [
      String(beat.id),
      String(
        beat.title || 'Untitled beat'
      ),
    ])
  );
}

function buildRefundedProducerItems({
  refundItems,
  orderItems,
  beatTitleMap,
}) {
  const orderItemMap =
    new Map(
      orderItems.map((orderItem) => [
        String(orderItem.id),
        orderItem,
      ])
    );

  return refundItems.map(
    (refundItem) => {
      const orderItem =
        orderItemMap.get(
          String(
            refundItem.order_item_id
          )
        );

      if (!orderItem) {
        throw new Error(
          `The original order item ${refundItem.order_item_id} could not be found.`
        );
      }

      const refundRatio =
        calculateRefundRatio({
          refundedAmount:
            refundItem.amount,
          originalGrossAmount:
            orderItem.gross_amount,
        });

      return {
        refundItemId:
          String(refundItem.id),

        orderItemId:
          String(orderItem.id),

        producerId:
          orderItem.producer_id
            ? String(
                orderItem.producer_id
              )
            : null,

        beatId:
          orderItem.beat_id
            ? String(orderItem.beat_id)
            : null,

        beatTitle:
          beatTitleMap.get(
            String(orderItem.beat_id)
          ) || 'Untitled beat',

        currency:
          String(
            refundItem.currency ||
              orderItem.currency ||
              'TRY'
          ).toUpperCase(),

        refundedGrossAmount:
          Number(
            refundItem.amount || 0
          ),

        reversedPlatformFeeAmount:
          Number(
            orderItem
              .platform_fee_amount || 0
          ) * refundRatio,

        reversedProducerEarningAmount:
          Number(
            orderItem
              .producer_earning_amount ||
              0
          ) * refundRatio,
      };
    }
  );
}

function groupItemsByProducer(
  refundedProducerItems
) {
  const producerGroups =
    new Map();

  refundedProducerItems.forEach(
    (item) => {
      if (!item.producerId) {
        return;
      }

      const existingGroup =
        producerGroups.get(
          item.producerId
        ) || {
          producerId:
            item.producerId,
          items: [],
        };

      existingGroup.items.push(item);

      producerGroups.set(
        item.producerId,
        existingGroup
      );
    }
  );

  return [
    ...producerGroups.values(),
  ];
}

async function getProducerEmail({
  supabase,
  producerId,
}) {
  const {
    data,
    error,
  } = await supabase.auth.admin
    .getUserById(producerId);

  if (error) {
    throw new Error(
      `The producer account could not be loaded: ${error.message}`
    );
  }

  const producerEmail =
    String(
      data?.user?.email || ''
    ).trim();

  if (!producerEmail) {
    throw new Error(
      'The producer account does not contain an email address.'
    );
  }

  return producerEmail;
}

async function claimDelivery({
  supabase,
  refundId,
  producerId,
}) {
  const {
    data: existingDelivery,
    error: existingError,
  } = await supabase
    .from(
      'producer_refund_email_deliveries'
    )
    .select(`
      id,
      status
    `)
    .eq(
      'order_refund_id',
      refundId
    )
    .eq(
      'producer_id',
      producerId
    )
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `The producer refund email delivery state could not be loaded: ${existingError.message}`
    );
  }

  const updatedAt =
    new Date().toISOString();

  if (existingDelivery) {
    if (
      existingDelivery.status !==
      DELIVERY_STATUS.FAILED
    ) {
      return {
        claimed: false,
        reason:
          'The notification was already sent or is currently being processed.',
      };
    }

    const {
      data: reclaimedDelivery,
      error: reclaimError,
    } = await supabase
      .from(
        'producer_refund_email_deliveries'
      )
      .update({
        status:
          DELIVERY_STATUS.SENDING,
        sent_at: null,
        provider_message_id: null,
        error_message: null,
        updated_at: updatedAt,
      })
      .eq(
        'id',
        existingDelivery.id
      )
      .eq(
        'status',
        DELIVERY_STATUS.FAILED
      )
      .select('id')
      .maybeSingle();

    if (reclaimError) {
      throw new Error(
        `The failed producer refund email delivery could not be retried: ${reclaimError.message}`
      );
    }

    return {
      claimed:
        Boolean(reclaimedDelivery),
      reason:
        reclaimedDelivery
          ? null
          : 'Another request claimed the notification first.',
    };
  }

  const {
    data: insertedDelivery,
    error: insertError,
  } = await supabase
    .from(
      'producer_refund_email_deliveries'
    )
    .insert({
      order_refund_id:
        refundId,
      producer_id:
        producerId,
      status:
        DELIVERY_STATUS.SENDING,
      updated_at:
        updatedAt,
    })
    .select('id')
    .maybeSingle();

  if (
    insertError?.code === '23505'
  ) {
    return {
      claimed: false,
      reason:
        'Another request created the notification first.',
    };
  }

  if (insertError) {
    throw new Error(
      `The producer refund email delivery could not be claimed: ${insertError.message}`
    );
  }

  return {
    claimed:
      Boolean(insertedDelivery),
    reason:
      insertedDelivery
        ? null
        : 'The notification could not be claimed.',
  };
}

async function recordDeliveryFailure({
  supabase,
  refundId,
  producerId,
  errorMessage,
}) {
  const normalizedError =
    String(
      errorMessage ||
        'Unknown producer refund email error.'
    ).slice(0, 2000);

  const {
    error,
  } = await supabase
    .from(
      'producer_refund_email_deliveries'
    )
    .update({
      status:
        DELIVERY_STATUS.FAILED,
      sent_at: null,
      provider_message_id: null,
      error_message:
        normalizedError,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      'order_refund_id',
      refundId
    )
    .eq(
      'producer_id',
      producerId
    )
    .eq(
      'status',
      DELIVERY_STATUS.SENDING
    );

  if (error) {
    logError(
      'producer_refund_email_failure_recording_failed',
      {
        refundId,
        producerId,
      },
      error
    );
  }
}

async function recordDeliverySuccess({
  supabase,
  refundId,
  producerId,
  providerMessageId,
}) {
  const sentAt =
    new Date().toISOString();

  const {
    data: updatedDelivery,
    error,
  } = await supabase
    .from(
      'producer_refund_email_deliveries'
    )
    .update({
      status:
        DELIVERY_STATUS.SENT,
      sent_at:
        sentAt,
      provider_message_id:
        providerMessageId || null,
      error_message: null,
      updated_at:
        sentAt,
    })
    .eq(
      'order_refund_id',
      refundId
    )
    .eq(
      'producer_id',
      producerId
    )
    .eq(
      'status',
      DELIVERY_STATUS.SENDING
    )
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(
      `The producer refund email success could not be recorded: ${error.message}`
    );
  }

  if (!updatedDelivery) {
    throw new Error(
      'The producer refund email delivery was no longer in the sending state.'
    );
  }
}

function buildEmailContent({
  refund,
  order,
  producerItems,
  baseUrl,
}) {
  const currency =
    String(
      producerItems[0]?.currency ||
        refund.currency ||
        order.currency ||
        'TRY'
    ).toUpperCase();

  const refundedGrossTotal =
    producerItems.reduce(
      (total, item) =>
        total +
        Number(
          item.refundedGrossAmount ||
            0
        ),
      0
    );

  const reversedPlatformFeeTotal =
    producerItems.reduce(
      (total, item) =>
        total +
        Number(
          item
            .reversedPlatformFeeAmount ||
            0
        ),
      0
    );

  const reversedProducerEarningTotal =
    producerItems.reduce(
      (total, item) =>
        total +
        Number(
          item
            .reversedProducerEarningAmount ||
            0
        ),
      0
    );

  const publicOrderId =
    String(
      order.public_id || order.id
    );

  const refundId =
    String(refund.id);

  const refundReason =
    String(
      refund.refund_reason ||
        'No refund reason was provided.'
    );

  const dashboardUrl =
    getDashboardUrl(baseUrl);

  const itemRowsHtml =
    producerItems
      .map((item) => `
        <tr>
          <td style="padding: 14px 0; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: 600; color: #111827;">
              ${escapeHtml(item.beatTitle)}
            </div>

            <div style="margin-top: 5px; color: #6b7280; font-size: 14px;">
              Refunded sale amount:
              ${escapeHtml(
                formatMoney(
                  item.refundedGrossAmount,
                  currency
                )
              )}
            </div>

            <div style="margin-top: 4px; color: #6b7280; font-size: 14px;">
              Reversed earnings:
              ${escapeHtml(
                formatMoney(
                  item.reversedProducerEarningAmount,
                  currency
                )
              )}
            </div>
          </td>
        </tr>
      `)
      .join('');

  const dashboardButtonHtml =
    dashboardUrl
      ? `
          <div style="margin-top: 28px;">
            <a
              href="${escapeHtml(dashboardUrl)}"
              style="display: inline-block; padding: 12px 20px; border-radius: 8px; background: #111827; color: #ffffff; text-decoration: none; font-weight: 600;"
            >
              Open producer dashboard
            </a>
          </div>
        `
      : '';

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>BeatMarket producer refund notification</title>
      </head>

      <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif;">
        <div style="padding: 32px 16px;">
          <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
            <div style="padding: 24px 28px; background: #111827; color: #ffffff;">
              <div style="font-size: 22px; font-weight: 700;">
                BeatMarket
              </div>
            </div>

            <div style="padding: 28px;">
              <h1 style="margin: 0; color: #111827; font-size: 24px; line-height: 1.3;">
                A sale was refunded
              </h1>

              <p style="margin: 16px 0 0; color: #4b5563; line-height: 1.6;">
                A completed refund included your beat${producerItems.length === 1 ? '' : 's'}. The related producer earnings were reversed.
              </p>

              <div style="margin-top: 24px; padding: 16px; border-radius: 8px; background: #f9fafb;">
                <div style="font-size: 13px; color: #6b7280;">
                  Order
                </div>

                <div style="margin-top: 4px; color: #111827; font-weight: 600; word-break: break-all;">
                  ${escapeHtml(publicOrderId)}
                </div>

                <div style="margin-top: 14px; font-size: 13px; color: #6b7280;">
                  Refund
                </div>

                <div style="margin-top: 4px; color: #111827; font-weight: 600; word-break: break-all;">
                  ${escapeHtml(refundId)}
                </div>
              </div>

              <div style="margin-top: 20px; padding: 16px; border-radius: 8px; background: #fff7ed; border: 1px solid #fed7aa;">
                <div style="font-size: 13px; color: #9a3412; font-weight: 600;">
                  Refund reason
                </div>

                <div style="margin-top: 6px; color: #7c2d12; line-height: 1.6;">
                  ${escapeHtml(refundReason)}
                </div>
              </div>

              <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
                <tbody>
                  ${itemRowsHtml}
                </tbody>
              </table>

              <div style="margin-top: 22px; padding: 16px; border-radius: 8px; background: #f9fafb;">
                <div style="display: flex; justify-content: space-between; gap: 16px;">
                  <span style="color: #6b7280;">
                    Refunded sales
                  </span>

                  <strong style="color: #111827;">
                    ${escapeHtml(
                      formatMoney(
                        refundedGrossTotal,
                        currency
                      )
                    )}
                  </strong>
                </div>

                <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 10px;">
                  <span style="color: #6b7280;">
                    Reversed platform fee
                  </span>

                  <strong style="color: #111827;">
                    ${escapeHtml(
                      formatMoney(
                        reversedPlatformFeeTotal,
                        currency
                      )
                    )}
                  </strong>
                </div>

                <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                  <span style="color: #111827; font-weight: 600;">
                    Reversed earnings
                  </span>

                  <strong style="color: #111827; font-size: 18px;">
                    ${escapeHtml(
                      formatMoney(
                        reversedProducerEarningTotal,
                        currency
                      )
                    )}
                  </strong>
                </div>
              </div>

              <p style="margin: 20px 0 0; color: #4b5563; line-height: 1.6;">
                The refund and related earnings adjustment are now recorded in your producer dashboard.
              </p>

              ${dashboardButtonHtml}

              <p style="margin: 28px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This is an automated producer refund notification from BeatMarket.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const itemLines =
    producerItems.map(
      (item) =>
        [
          `- ${item.beatTitle}`,
          `  Refunded sale amount: ${formatMoney(
            item.refundedGrossAmount,
            currency
          )}`,
          `  Reversed earnings: ${formatMoney(
            item.reversedProducerEarningAmount,
            currency
          )}`,
        ].join('\n')
    );

  const text = [
    'BeatMarket',
    '',
    'A sale was refunded.',
    '',
    `Order: ${publicOrderId}`,
    `Refund: ${refundId}`,
    '',
    `Refund reason: ${refundReason}`,
    '',
    ...itemLines,
    '',
    `Refunded sales: ${formatMoney(
      refundedGrossTotal,
      currency
    )}`,
    `Reversed platform fee: ${formatMoney(
      reversedPlatformFeeTotal,
      currency
    )}`,
    `Reversed earnings: ${formatMoney(
      reversedProducerEarningTotal,
      currency
    )}`,
    '',
    'The refund and related earnings adjustment are now recorded in your producer dashboard.',
    ...(dashboardUrl
      ? [
          '',
          `Open producer dashboard: ${dashboardUrl}`,
        ]
      : []),
  ].join('\n');

  return {
    subject:
      producerItems.length === 1
        ? `A beat sale was refunded — ${publicOrderId}`
        : `${producerItems.length} beat sales were refunded — ${publicOrderId}`,
    html,
    text,
  };
}

async function sendProducerGroupEmail({
  supabase,
  refund,
  order,
  producerGroup,
  baseUrl,
  requestId,
}) {
  const {
    producerId,
    items,
  } = producerGroup;

  let claimed = false;
  let providerAccepted = false;

  try {
    const claimResult =
      await claimDelivery({
        supabase,
        refundId: refund.id,
        producerId,
      });

    claimed =
      claimResult.claimed;

    if (!claimed) {
      logInfo(
        'producer_refund_email_not_claimed',
        {
          requestId,
          refundId:
            refund.id,
          orderId:
            refund.order_id,
          producerId,
          reason:
            claimResult.reason,
        }
      );

      return {
        producerId,
        sent: false,
        skipped: true,
      };
    }

    const producerEmail =
      await getProducerEmail({
        supabase,
        producerId,
      });

    const resend =
      getResendClient();

    if (!resend) {
      throw new Error(
        'RESEND_API_KEY is missing.'
      );
    }

    const emailContent =
      buildEmailContent({
        refund,
        order,
        producerItems: items,
        baseUrl,
      });

    const {
      data,
      error,
    } = await resend.emails.send({
      from:
        getFromEmail(),
      to: [
        producerEmail,
      ],
      subject:
        emailContent.subject,
      html:
        emailContent.html,
      text:
        emailContent.text,
    });

    if (error) {
      throw new Error(
        error.message ||
          'Resend rejected the producer refund notification.'
      );
    }

    providerAccepted = true;

    await recordDeliverySuccess({
      supabase,
      refundId:
        refund.id,
      producerId,
      providerMessageId:
        data?.id || null,
    });

    logInfo(
      'producer_refund_email_sent',
      {
        requestId,
        refundId:
          refund.id,
        orderId:
          refund.order_id,
        producerId,
        itemCount:
          items.length,
        providerMessageId:
          data?.id || null,
      }
    );

    return {
      producerId,
      sent: true,
      skipped: false,
      providerMessageId:
        data?.id || null,
    };
  } catch (error) {
    /*
      When Resend accepted the message but the database
      success update failed, leave the delivery in the
      "sending" state. Retrying automatically could send
      the producer a duplicate refund notification.
    */
    if (
      claimed &&
      !providerAccepted
    ) {
      await recordDeliveryFailure({
        supabase,
        refundId:
          refund.id,
        producerId,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Unknown producer refund email error.',
      });
    }

    logError(
      'producer_refund_email_failed',
      {
        requestId,
        refundId:
          refund.id,
        orderId:
          refund.order_id,
        producerId,
        providerAccepted,
      },
      error
    );

    return {
      producerId,
      sent: false,
      skipped: false,
    };
  }
}

export async function sendProducerRefundNotificationEmails({
  supabase,
  refund,
  baseUrl,
  requestId = null,
}) {
  const refundId =
    refund?.id;

  if (!supabase || !refundId) {
    logWarning(
      'producer_refund_emails_skipped',
      {
        requestId,
        reason:
          'Missing Supabase client or refund ID.',
      }
    );

    return {
      success: false,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  try {
    const completedRefund =
      await loadCompletedRefund({
        supabase,
        refundId,
      });

    const order =
      await loadOrder({
        supabase,
        orderId:
          completedRefund.order_id,
      });

    const refundItems =
      await loadRefundItems({
        supabase,
        refundId:
          completedRefund.id,
      });

    if (refundItems.length === 0) {
      logWarning(
        'producer_refund_emails_skipped',
        {
          requestId,
          refundId:
            completedRefund.id,
          orderId:
            completedRefund.order_id,
          reason:
            'The completed refund has no refunded items.',
        }
      );

      return {
        success: false,
        sentCount: 0,
        skippedCount: 0,
        failedCount: 0,
      };
    }

    const orderItemIds = [
      ...new Set(
        refundItems
          .map((refundItem) =>
            refundItem.order_item_id
              ? String(
                  refundItem
                    .order_item_id
                )
              : null
          )
          .filter(Boolean)
      ),
    ];

    if (
      orderItemIds.length !==
      refundItems.length
    ) {
      throw new Error(
        'One or more refunded items do not contain a unique original order item.'
      );
    }

    const orderItems =
      await loadOrderItems({
        supabase,
        orderItemIds,
      });

    if (
      orderItems.length !==
      orderItemIds.length
    ) {
      throw new Error(
        'One or more original producer sale items could not be loaded.'
      );
    }

    const beatIds = [
      ...new Set(
        orderItems
          .map((orderItem) =>
            orderItem.beat_id
              ? String(
                  orderItem.beat_id
                )
              : null
          )
          .filter(Boolean)
      ),
    ];

    const beatTitleMap =
      await loadBeatTitles({
        supabase,
        beatIds,
      });

    const refundedProducerItems =
      buildRefundedProducerItems({
        refundItems,
        orderItems,
        beatTitleMap,
      });

    const producerGroups =
      groupItemsByProducer(
        refundedProducerItems
      );

    if (producerGroups.length === 0) {
      logWarning(
        'producer_refund_emails_skipped',
        {
          requestId,
          refundId:
            completedRefund.id,
          orderId:
            completedRefund.order_id,
          reason:
            'The completed refund does not contain producer-owned items.',
        }
      );

      return {
        success: false,
        sentCount: 0,
        skippedCount: 0,
        failedCount: 0,
      };
    }

    const results = [];

    /*
      Send sequentially so one multi-producer refund does
      not generate an unnecessary burst of email requests.
    */
    for (
      const producerGroup
      of producerGroups
    ) {
      const result =
        await sendProducerGroupEmail({
          supabase,
          refund:
            completedRefund,
          order,
          producerGroup,
          baseUrl,
          requestId,
        });

      results.push(result);
    }

    const sentCount =
      results.filter(
        (result) => result.sent
      ).length;

    const skippedCount =
      results.filter(
        (result) => result.skipped
      ).length;

    const failedCount =
      results.length -
      sentCount -
      skippedCount;

    logInfo(
      'producer_refund_emails_completed',
      {
        requestId,
        refundId:
          completedRefund.id,
        orderId:
          completedRefund.order_id,
        producerCount:
          producerGroups.length,
        sentCount,
        skippedCount,
        failedCount,
      }
    );

    return {
      success:
        failedCount === 0,
      sentCount,
      skippedCount,
      failedCount,
    };
  } catch (error) {
    logError(
      'producer_refund_emails_failed',
      {
        requestId,
        refundId,
        orderId:
          refund?.order_id || null,
      },
      error
    );

    /*
      Notification failures must never change the completed
      refund result or restore reversed producer earnings.
    */
    return {
      success: false,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 1,
    };
  }
}