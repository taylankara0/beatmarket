import 'server-only';

import { Resend } from 'resend';

import {
  logError,
  logInfo,
  logWarning,
} from './serverLogger';

const DEFAULT_FROM_EMAIL =
  'BeatMarket <onboarding@resend.dev>';

const REFUND_EMAIL_STATUS = {
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

function normalizeCartSnapshot(snapshot) {
  if (Array.isArray(snapshot)) {
    return snapshot;
  }

  if (typeof snapshot === 'string') {
    try {
      const parsedSnapshot =
        JSON.parse(snapshot);

      return Array.isArray(parsedSnapshot)
        ? parsedSnapshot
        : [];
    } catch {
      return [];
    }
  }

  return [];
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

function getLibraryUrl(baseUrl) {
  try {
    return new URL(
      '/library',
      baseUrl
    ).toString();
  } catch {
    if (
      !process.env.NEXT_PUBLIC_SITE_URL
    ) {
      return null;
    }

    try {
      return new URL(
        '/library',
        process.env.NEXT_PUBLIC_SITE_URL
      ).toString();
    } catch {
      return null;
    }
  }
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
      buyer_email,
      cart_snapshot
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

function buildEmailContent({
  refund,
  order,
  baseUrl,
}) {
  const items =
    normalizeCartSnapshot(
      order.cart_snapshot
    );

  const currency =
    String(
      refund.currency || 'TRY'
    ).toUpperCase();

  const refundedAmount =
    formatMoney(
      refund.refunded_amount ??
        refund.requested_amount,
      currency
    );

  const orderPublicId =
    String(
      order.public_id || order.id
    );

  const refundReason =
    String(
      refund.refund_reason ||
        'Refund processed'
    );

  const libraryUrl =
    getLibraryUrl(baseUrl);

  const itemRowsHtml =
    items.length > 0
      ? items
          .map((item) => {
            const title =
              escapeHtml(
                item?.title || 'Beat'
              );

            const licenseName =
              escapeHtml(
                item?.licenseName ??
                  item?.license_name ??
                  'License'
              );

            return `
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                  <div style="font-weight: 600; color: #111827;">
                    ${title}
                  </div>
                  <div style="margin-top: 4px; color: #6b7280; font-size: 14px;">
                    ${licenseName}
                  </div>
                </td>
              </tr>
            `;
          })
          .join('')
      : `
          <tr>
            <td style="padding: 12px 0; color: #6b7280;">
              The refunded purchase is no longer available in your library.
            </td>
          </tr>
        `;

  const itemLines =
    items.length > 0
      ? items.map((item) => {
          const title =
            item?.title || 'Beat';

          const licenseName =
            item?.licenseName ??
            item?.license_name ??
            'License';

          return `- ${title} — ${licenseName}`;
        })
      : [
          '- The refunded purchase is no longer available in your library.',
        ];

  const libraryButtonHtml =
    libraryUrl
      ? `
          <div style="margin-top: 28px;">
            <a
              href="${escapeHtml(libraryUrl)}"
              style="display: inline-block; padding: 12px 20px; border-radius: 8px; background: #111827; color: #ffffff; text-decoration: none; font-weight: 600;"
            >
              Open your library
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
        <title>BeatMarket refund confirmation</title>
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
                Your refund is complete
              </h1>

              <p style="margin: 16px 0 0; color: #4b5563; line-height: 1.6;">
                Your BeatMarket purchase has been refunded successfully. The time required for the funds to appear may depend on your bank or card provider.
              </p>

              <div style="margin-top: 24px; padding: 16px; border-radius: 8px; background: #f9fafb;">
                <div style="font-size: 13px; color: #6b7280;">
                  Order
                </div>

                <div style="margin-top: 4px; color: #111827; font-weight: 600; word-break: break-all;">
                  ${escapeHtml(orderPublicId)}
                </div>

                <div style="margin-top: 16px; font-size: 13px; color: #6b7280;">
                  Refund reason
                </div>

                <div style="margin-top: 4px; color: #111827;">
                  ${escapeHtml(refundReason)}
                </div>
              </div>

              <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
                <tbody>
                  ${itemRowsHtml}
                </tbody>
              </table>

              <div style="margin-top: 20px; text-align: right;">
                <span style="color: #6b7280;">
                  Refunded:
                </span>

                <strong style="margin-left: 8px; color: #111827; font-size: 18px;">
                  ${escapeHtml(refundedAmount)}
                </strong>
              </div>

              ${libraryButtonHtml}

              <p style="margin: 28px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This is an automated refund confirmation from BeatMarket.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = [
    'BeatMarket',
    '',
    'Your refund is complete.',
    '',
    'Your BeatMarket purchase has been refunded successfully.',
    '',
    `Order: ${orderPublicId}`,
    `Refunded amount: ${refundedAmount}`,
    `Refund reason: ${refundReason}`,
    '',
    ...itemLines,
    '',
    'The time required for the funds to appear may depend on your bank or card provider.',
    ...(libraryUrl
      ? [
          '',
          `Open your library: ${libraryUrl}`,
        ]
      : []),
  ].join('\n');

  return {
    subject:
      `BeatMarket refund completed — ${orderPublicId}`,
    html,
    text,
  };
}

async function claimEmailDelivery({
  supabase,
  refundId,
}) {
  const updatedAt =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from('order_refunds')
    .update({
      refund_confirmation_email_status:
        REFUND_EMAIL_STATUS.SENDING,

      refund_confirmation_email_error:
        null,

      refund_confirmation_email_updated_at:
        updatedAt,
    })
    .eq('id', refundId)
    .eq('status', 'refunded')
    .or(
      [
        'refund_confirmation_email_status.is.null',
        `refund_confirmation_email_status.eq.${REFUND_EMAIL_STATUS.FAILED}`,
      ].join(',')
    )
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(
      `Refund email delivery could not be claimed: ${error.message}`
    );
  }

  return Boolean(data);
}

async function recordEmailFailure({
  supabase,
  refundId,
  errorMessage,
}) {
  const normalizedError =
    String(
      errorMessage ||
        'Unknown refund email delivery error.'
    ).slice(0, 2000);

  const {
    error,
  } = await supabase
    .from('order_refunds')
    .update({
      refund_confirmation_email_status:
        REFUND_EMAIL_STATUS.FAILED,

      refund_confirmation_email_error:
        normalizedError,

      refund_confirmation_email_updated_at:
        new Date().toISOString(),
    })
    .eq('id', refundId)
    .eq(
      'refund_confirmation_email_status',
      REFUND_EMAIL_STATUS.SENDING
    );

  if (error) {
    logError(
      'refund_confirmation_email_failure_recording_failed',
      {
        refundId,
      },
      error
    );
  }
}

async function recordEmailSuccess({
  supabase,
  refundId,
  providerMessageId,
}) {
  const sentAt =
    new Date().toISOString();

  const {
    error,
  } = await supabase
    .from('order_refunds')
    .update({
      refund_confirmation_email_status:
        REFUND_EMAIL_STATUS.SENT,

      refund_confirmation_email_sent_at:
        sentAt,

      refund_confirmation_email_provider_id:
        providerMessageId || null,

      refund_confirmation_email_error:
        null,

      refund_confirmation_email_updated_at:
        sentAt,
    })
    .eq('id', refundId)
    .eq(
      'refund_confirmation_email_status',
      REFUND_EMAIL_STATUS.SENDING
    );

  if (error) {
    throw new Error(
      `Refund email success could not be recorded: ${error.message}`
    );
  }
}

export async function sendRefundConfirmationEmail({
  supabase,
  refund,
  baseUrl,
  requestId = null,
}) {
  const refundId =
    refund?.id;

  const orderId =
    refund?.order_id;

  if (
    !supabase ||
    !refundId ||
    !orderId
  ) {
    logWarning(
      'refund_confirmation_email_skipped',
      {
        requestId,
        reason:
          'Missing Supabase client, refund ID, or order ID.',
      }
    );

    return {
      success: false,
      sent: false,
      skipped: true,
    };
  }

  if (refund.status !== 'refunded') {
    logWarning(
      'refund_confirmation_email_skipped',
      {
        requestId,
        refundId,
        reason:
          'The refund is not finalized.',
      }
    );

    return {
      success: false,
      sent: false,
      skipped: true,
    };
  }

  let claimed = false;

  try {
    claimed =
      await claimEmailDelivery({
        supabase,
        refundId,
      });

    if (!claimed) {
      logInfo(
        'refund_confirmation_email_not_claimed',
        {
          requestId,
          refundId,
          reason:
            'The email was already sent, skipped, or is currently being processed.',
        }
      );

      return {
        success: true,
        sent: false,
        skipped: true,
      };
    }

    const order =
      await loadOrder({
        supabase,
        orderId,
      });

    const buyerEmail =
      String(
        order.buyer_email || ''
      ).trim();

    if (!buyerEmail) {
      throw new Error(
        'The refunded order does not contain a buyer email address.'
      );
    }

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
        baseUrl,
      });

    const {
      data,
      error,
    } = await resend.emails.send({
      from: getFromEmail(),
      to: [buyerEmail],
      subject:
        emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (error) {
      throw new Error(
        error.message ||
          'Resend rejected the refund confirmation email.'
      );
    }

    await recordEmailSuccess({
      supabase,
      refundId,
      providerMessageId:
        data?.id || null,
    });

    logInfo(
      'refund_confirmation_email_sent',
      {
        requestId,
        refundId,
        orderId,
        providerMessageId:
          data?.id || null,
      }
    );

    return {
      success: true,
      sent: true,
      skipped: false,
      providerMessageId:
        data?.id || null,
    };
  } catch (error) {
    if (claimed) {
      await recordEmailFailure({
        supabase,
        refundId,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Unknown refund confirmation email error.',
      });
    }

    logError(
      'refund_confirmation_email_failed',
      {
        requestId,
        refundId,
        orderId,
      },
      error
    );

    /*
      Email delivery must never turn a successfully completed
      refund into a failed or manual-review refund.
    */
    return {
      success: false,
      sent: false,
      skipped: false,
    };
  }
}