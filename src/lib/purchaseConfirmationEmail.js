import 'server-only';

import { Resend } from 'resend';

import {
  logError,
  logInfo,
  logWarning,
} from './serverLogger';

const DEFAULT_FROM_EMAIL =
  'BeatMarket <onboarding@resend.dev>';

const PURCHASE_EMAIL_STATUS = {
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
  const numericValue = Number(value);

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
    return (
      process.env.NEXT_PUBLIC_SITE_URL
        ? new URL(
            '/library',
            process.env.NEXT_PUBLIC_SITE_URL
          ).toString()
        : null
    );
  }
}

function buildEmailContent({
  order,
  baseUrl,
}) {
  const items = normalizeCartSnapshot(
    order.cart_snapshot
  );

  const currency =
    String(
      order.currency || 'TRY'
    ).toUpperCase();

  const totalAmount = formatMoney(
    order.paid_price ?? order.price,
    currency
  );

  const orderPublicId =
    String(
      order.public_id || order.id
    );

  const libraryUrl =
    getLibraryUrl(baseUrl);

  const itemRowsHtml =
    items.length > 0
      ? items
          .map((item) => {
            const title = escapeHtml(
              item?.title || 'Beat'
            );

            const licenseName =
              escapeHtml(
                item?.licenseName ??
                  item?.license_name ??
                  'License'
              );

            const itemPrice =
              formatMoney(
                item?.price,
                currency
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
                <td style="padding: 12px 0 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; white-space: nowrap; color: #111827;">
                  ${escapeHtml(itemPrice)}
                </td>
              </tr>
            `;
          })
          .join('')
      : `
          <tr>
            <td style="padding: 12px 0; color: #6b7280;">
              Your purchased beat licenses are ready in your library.
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

          const itemPrice =
            formatMoney(
              item?.price,
              currency
            );

          return `- ${title} — ${licenseName} — ${itemPrice}`;
        })
      : [
          '- Your purchased beat licenses are ready in your library.',
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
        <title>BeatMarket purchase confirmation</title>
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
                Your purchase is complete
              </h1>

              <p style="margin: 16px 0 0; color: #4b5563; line-height: 1.6;">
                Your payment was confirmed successfully. Your purchased beat licenses are now available in your BeatMarket library.
              </p>

              <div style="margin-top: 24px; padding: 16px; border-radius: 8px; background: #f9fafb;">
                <div style="font-size: 13px; color: #6b7280;">
                  Order
                </div>
                <div style="margin-top: 4px; color: #111827; font-weight: 600; word-break: break-all;">
                  ${escapeHtml(orderPublicId)}
                </div>
              </div>

              <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
                <tbody>
                  ${itemRowsHtml}
                </tbody>
              </table>

              <div style="margin-top: 20px; text-align: right;">
                <span style="color: #6b7280;">
                  Total:
                </span>
                <strong style="margin-left: 8px; color: #111827; font-size: 18px;">
                  ${escapeHtml(totalAmount)}
                </strong>
              </div>

              ${libraryButtonHtml}

              <p style="margin: 28px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This is an automated purchase confirmation from BeatMarket.
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
    'Your purchase is complete.',
    '',
    'Your payment was confirmed successfully.',
    '',
    `Order: ${orderPublicId}`,
    '',
    ...itemLines,
    '',
    `Total: ${totalAmount}`,
    ...(libraryUrl
      ? [
          '',
          `Open your library: ${libraryUrl}`,
        ]
      : []),
  ].join('\n');

  return {
    subject:
      `BeatMarket purchase confirmed — ${orderPublicId}`,
    html,
    text,
  };
}

async function claimEmailDelivery({
  supabase,
  orderId,
}) {
  const updatedAt =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from('orders')
    .update({
      purchase_confirmation_email_status:
        PURCHASE_EMAIL_STATUS.SENDING,

      purchase_confirmation_email_error:
        null,

      purchase_confirmation_email_updated_at:
        updatedAt,
    })
    .eq('id', orderId)
    .or(
      [
        'purchase_confirmation_email_status.is.null',
        `purchase_confirmation_email_status.eq.${PURCHASE_EMAIL_STATUS.FAILED}`,
      ].join(',')
    )
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(
      `Purchase email delivery could not be claimed: ${error.message}`
    );
  }

  return Boolean(data);
}

async function recordEmailFailure({
  supabase,
  orderId,
  errorMessage,
}) {
  const normalizedError =
    String(
      errorMessage ||
        'Unknown email delivery error.'
    ).slice(0, 2000);

  const {
    error,
  } = await supabase
    .from('orders')
    .update({
      purchase_confirmation_email_status:
        PURCHASE_EMAIL_STATUS.FAILED,

      purchase_confirmation_email_error:
        normalizedError,

      purchase_confirmation_email_updated_at:
        new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq(
      'purchase_confirmation_email_status',
      PURCHASE_EMAIL_STATUS.SENDING
    );

  if (error) {
    logError(
      'purchase_confirmation_email_failure_recording_failed',
      {
        orderId,
      },
      error
    );
  }
}

async function recordEmailSuccess({
  supabase,
  orderId,
  providerMessageId,
}) {
  const sentAt =
    new Date().toISOString();

  const {
    error,
  } = await supabase
    .from('orders')
    .update({
      purchase_confirmation_email_status:
        PURCHASE_EMAIL_STATUS.SENT,

      purchase_confirmation_email_sent_at:
        sentAt,

      purchase_confirmation_email_provider_id:
        providerMessageId || null,

      purchase_confirmation_email_error:
        null,

      purchase_confirmation_email_updated_at:
        sentAt,
    })
    .eq('id', orderId)
    .eq(
      'purchase_confirmation_email_status',
      PURCHASE_EMAIL_STATUS.SENDING
    );

  if (error) {
    throw new Error(
      `Purchase email success could not be recorded: ${error.message}`
    );
  }
}

export async function sendPurchaseConfirmationEmail({
  supabase,
  order,
  baseUrl,
  requestId = null,
}) {
  const orderId =
    order?.id;

  if (!supabase || !orderId) {
    logWarning(
      'purchase_confirmation_email_skipped',
      {
        requestId,
        reason:
          'Missing Supabase client or order ID.',
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
    claimed = await claimEmailDelivery({
      supabase,
      orderId,
    });

    if (!claimed) {
      logInfo(
        'purchase_confirmation_email_not_claimed',
        {
          requestId,
          orderId,
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

    const buyerEmail =
      String(
        order.buyer_email || ''
      ).trim();

    if (!buyerEmail) {
      throw new Error(
        'The order does not contain a buyer email address.'
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
          'Resend rejected the purchase confirmation email.'
      );
    }

    await recordEmailSuccess({
      supabase,
      orderId,
      providerMessageId:
        data?.id || null,
    });

    logInfo(
      'purchase_confirmation_email_sent',
      {
        requestId,
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
        orderId,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Unknown purchase confirmation email error.',
      });
    }

    logError(
      'purchase_confirmation_email_failed',
      {
        requestId,
        orderId,
      },
      error
    );

    /*
      Email delivery must never turn a successfully paid order
      into a failed payment or prevent access to purchased files.
    */
    return {
      success: false,
      sent: false,
      skipped: false,
    };
  }
}