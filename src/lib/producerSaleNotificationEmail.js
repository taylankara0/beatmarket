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

async function loadPaidOrder({
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
      `The paid order could not be loaded: ${error.message}`
    );
  }

  if (!order) {
    throw new Error(
      'The paid order no longer exists.'
    );
  }

  if (order.status !== 'paid') {
    throw new Error(
      'Producer sale notifications require a paid order.'
    );
  }

  return order;
}

async function loadOrderItems({
  supabase,
  orderId,
}) {
  const {
    data: orderItems,
    error,
  } = await supabase
    .from('order_items')
    .select(`
      id,
      producer_id,
      beat_id,
      gross_amount,
      platform_fee_amount,
      producer_earning_amount,
      currency
    `)
    .eq('order_id', orderId)
    .order('created_at', {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `The producer sale items could not be loaded: ${error.message}`
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
      `The sold beat titles could not be loaded: ${error.message}`
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

function groupItemsByProducer(
  orderItems,
  beatTitleMap
) {
  const producerGroups =
    new Map();

  orderItems.forEach((orderItem) => {
    const producerId =
      orderItem.producer_id;

    if (!producerId) {
      return;
    }

    const normalizedProducerId =
      String(producerId);

    const existingGroup =
      producerGroups.get(
        normalizedProducerId
      ) || {
        producerId:
          normalizedProducerId,
        items: [],
      };

    existingGroup.items.push({
      ...orderItem,
      beatTitle:
        beatTitleMap.get(
          String(orderItem.beat_id)
        ) || 'Untitled beat',
    });

    producerGroups.set(
      normalizedProducerId,
      existingGroup
    );
  });

  return [
    ...producerGroups.values(),
  ];
}

async function getProducerContact({
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

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(`
      display_name,
      username
    `)
    .eq('id', producerId)
    .maybeSingle();

  if (profileError) {
    logWarning(
      'producer_sale_profile_name_load_failed',
      {
        producerId,
        errorMessage:
          profileError.message,
      }
    );
  }

  const displayName =
    String(
      profile?.display_name || ''
    )
      .trim()
      .replace(/\s+/g, ' ');

  const username =
    String(
      profile?.username || ''
    ).trim();

  const producerName =
    displayName ||
    (username
      ? `@${username}`
      : 'BeatMarket Producer');

  return {
    producerEmail,
    producerName,
  };
}

async function claimDelivery({
  supabase,
  orderId,
  producerId,
}) {
  const {
    data: existingDelivery,
    error: existingError,
  } = await supabase
    .from(
      'producer_sale_email_deliveries'
    )
    .select(`
      id,
      status
    `)
    .eq('order_id', orderId)
    .eq('producer_id', producerId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `The producer email delivery state could not be loaded: ${existingError.message}`
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
        'producer_sale_email_deliveries'
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
        `The failed producer email delivery could not be retried: ${reclaimError.message}`
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
      'producer_sale_email_deliveries'
    )
    .insert({
      order_id: orderId,
      producer_id: producerId,
      status:
        DELIVERY_STATUS.SENDING,
      updated_at: updatedAt,
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
      `The producer email delivery could not be claimed: ${insertError.message}`
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
  orderId,
  producerId,
  errorMessage,
}) {
  const normalizedError =
    String(
      errorMessage ||
        'Unknown producer sale email error.'
    ).slice(0, 2000);

  const {
    error,
  } = await supabase
    .from(
      'producer_sale_email_deliveries'
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
    .eq('order_id', orderId)
    .eq('producer_id', producerId)
    .eq(
      'status',
      DELIVERY_STATUS.SENDING
    );

  if (error) {
    logError(
      'producer_sale_email_failure_recording_failed',
      {
        orderId,
        producerId,
      },
      error
    );
  }
}

async function recordDeliverySuccess({
  supabase,
  orderId,
  producerId,
  providerMessageId,
}) {
  const sentAt =
    new Date().toISOString();

  const {
    error,
  } = await supabase
    .from(
      'producer_sale_email_deliveries'
    )
    .update({
      status:
        DELIVERY_STATUS.SENT,
      sent_at: sentAt,
      provider_message_id:
        providerMessageId || null,
      error_message: null,
      updated_at: sentAt,
    })
    .eq('order_id', orderId)
    .eq('producer_id', producerId)
    .eq(
      'status',
      DELIVERY_STATUS.SENDING
    );

  if (error) {
    throw new Error(
      `The producer email success could not be recorded: ${error.message}`
    );
  }
}

function buildEmailContent({
  order,
  producerItems,
  producerName,
  baseUrl,
}) {
  const currency =
    String(
      producerItems[0]?.currency ||
        order.currency ||
        'TRY'
    ).toUpperCase();

  const grossTotal =
    producerItems.reduce(
      (total, item) =>
        total +
        Number(
          item.gross_amount || 0
        ),
      0
    );

  const platformFeeTotal =
    producerItems.reduce(
      (total, item) =>
        total +
        Number(
          item.platform_fee_amount ||
            0
        ),
      0
    );

  const producerEarningTotal =
    producerItems.reduce(
      (total, item) =>
        total +
        Number(
          item.producer_earning_amount ||
            0
        ),
      0
    );

  const publicOrderId =
    String(
      order.public_id || order.id
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

            <div style="margin-top: 4px; color: #6b7280; font-size: 14px;">
              Your earning:
              ${escapeHtml(
                formatMoney(
                  item.producer_earning_amount,
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
        <title>BeatMarket sale notification</title>
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
                You made a sale
              </h1>

              <p style="margin: 16px 0 0; color: #4b5563; line-height: 1.6;">
                Hello ${escapeHtml(producerName)},
              </p>

              <p style="margin: 12px 0 0; color: #4b5563; line-height: 1.6;">
                A buyer completed a purchase containing your beat${producerItems.length === 1 ? '' : 's'}.
              </p>

              <div style="margin-top: 24px; padding: 16px; border-radius: 8px; background: #f9fafb;">
                <div style="font-size: 13px; color: #6b7280;">
                  Order
                </div>

                <div style="margin-top: 4px; color: #111827; font-weight: 600; word-break: break-all;">
                  ${escapeHtml(publicOrderId)}
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
                    Gross sales
                  </span>

                  <strong style="color: #111827;">
                    ${escapeHtml(
                      formatMoney(
                        grossTotal,
                        currency
                      )
                    )}
                  </strong>
                </div>

                <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 10px;">
                  <span style="color: #6b7280;">
                    Platform fee
                  </span>

                  <strong style="color: #111827;">
                    ${escapeHtml(
                      formatMoney(
                        platformFeeTotal,
                        currency
                      )
                    )}
                  </strong>
                </div>

                <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                  <span style="color: #111827; font-weight: 600;">
                    Your earnings
                  </span>

                  <strong style="color: #111827; font-size: 18px;">
                    ${escapeHtml(
                      formatMoney(
                        producerEarningTotal,
                        currency
                      )
                    )}
                  </strong>
                </div>
              </div>

              <p style="margin: 20px 0 0; color: #4b5563; line-height: 1.6;">
                The sale has been recorded in your producer dashboard. Earnings become available according to BeatMarket’s payout holding period.
              </p>

              ${dashboardButtonHtml}

              <p style="margin: 28px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This is an automated producer sale notification from BeatMarket.
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
        `- ${item.beatTitle}: ${formatMoney(
          item.producer_earning_amount,
          currency
        )}`
    );

  const text = [
    'BeatMarket',
    '',
    `Hello ${producerName},`,
    '',
    'You made a sale.',
    '',
    `Order: ${publicOrderId}`,
    '',
    ...itemLines,
    '',
    `Gross sales: ${formatMoney(
      grossTotal,
      currency
    )}`,
    `Platform fee: ${formatMoney(
      platformFeeTotal,
      currency
    )}`,
    `Your earnings: ${formatMoney(
      producerEarningTotal,
      currency
    )}`,
    '',
    'The sale has been recorded in your producer dashboard.',
    'Earnings become available according to BeatMarket’s payout holding period.',
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
        ? `You sold a beat — ${publicOrderId}`
        : `You sold ${producerItems.length} beats — ${publicOrderId}`,
    html,
    text,
  };
}

async function sendProducerGroupEmail({
  supabase,
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
        orderId: order.id,
        producerId,
      });

    claimed =
      claimResult.claimed;

    if (!claimed) {
      logInfo(
        'producer_sale_email_not_claimed',
        {
          requestId,
          orderId: order.id,
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

    const {
      producerEmail,
      producerName,
    } = await getProducerContact({
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
        order,
        producerItems: items,
        producerName,
        baseUrl,
      });

    const {
      data,
      error,
    } = await resend.emails.send({
      from: getFromEmail(),
      to: [producerEmail],
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
          'Resend rejected the producer sale notification.'
      );
    }

    providerAccepted = true;

    await recordDeliverySuccess({
      supabase,
      orderId: order.id,
      producerId,
      providerMessageId:
        data?.id || null,
    });

    logInfo(
      'producer_sale_email_sent',
      {
        requestId,
        orderId: order.id,
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
      When the email provider accepted the message but the
      database success update failed, keep the delivery in
      "sending" instead of marking it failed. This prevents
      an automatic retry from sending a duplicate email.
    */
    if (
      claimed &&
      !providerAccepted
    ) {
      await recordDeliveryFailure({
        supabase,
        orderId: order.id,
        producerId,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Unknown producer sale email error.',
      });
    }

    logError(
      'producer_sale_email_failed',
      {
        requestId,
        orderId: order.id,
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

export async function sendProducerSaleNotificationEmails({
  supabase,
  order,
  baseUrl,
  requestId = null,
}) {
  const orderId =
    order?.id;

  if (!supabase || !orderId) {
    logWarning(
      'producer_sale_emails_skipped',
      {
        requestId,
        reason:
          'Missing Supabase client or order ID.',
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
    const paidOrder =
      await loadPaidOrder({
        supabase,
        orderId,
      });

    const orderItems =
      await loadOrderItems({
        supabase,
        orderId,
      });

    if (orderItems.length === 0) {
      logWarning(
        'producer_sale_emails_skipped',
        {
          requestId,
          orderId,
          reason:
            'The paid order has no order items.',
        }
      );

      return {
        success: false,
        sentCount: 0,
        skippedCount: 0,
        failedCount: 0,
      };
    }

    const beatIds = [
      ...new Set(
        orderItems
          .map((item) =>
            item.beat_id
              ? String(item.beat_id)
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

    const producerGroups =
      groupItemsByProducer(
        orderItems,
        beatTitleMap
      );

    const results = [];

    /*
      Send sequentially so a single order containing several
      producers does not create an unnecessary email burst.
    */
    for (
      const producerGroup
      of producerGroups
    ) {
      const result =
        await sendProducerGroupEmail({
          supabase,
          order: paidOrder,
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
      'producer_sale_emails_completed',
      {
        requestId,
        orderId,
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
      'producer_sale_emails_failed',
      {
        requestId,
        orderId,
      },
      error
    );

    /*
      Notification failures must never change the successful
      payment result or remove buyer access.
    */
    return {
      success: false,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 1,
    };
  }
}