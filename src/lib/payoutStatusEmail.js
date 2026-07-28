import 'server-only';

import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';
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

const PAYOUT_EVENT = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PAID: 'paid',
};

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

function isSupportedEvent(eventType) {
  return Object.values(
    PAYOUT_EVENT
  ).includes(eventType);
}

async function loadPayoutRequest({
  supabase,
  payoutRequestId,
}) {
  const {
    data: payoutRequest,
    error,
  } = await supabase
    .from('payout_requests')
    .select(`
      id,
      producer_id,
      requested_amount,
      currency,
      status,
      approved_at,
      paid_at,
      rejected_at,
      rejection_reason,
      bank_transfer_reference,
      created_at,
      updated_at
    `)
    .eq('id', payoutRequestId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `The payout request could not be loaded: ${error.message}`
    );
  }

  if (!payoutRequest) {
    throw new Error(
      'The payout request no longer exists.'
    );
  }

  return payoutRequest;
}

function verifyPayoutEvent({
  payoutRequest,
  eventType,
}) {
  if (
    eventType ===
    PAYOUT_EVENT.APPROVED
  ) {
    return (
      payoutRequest.status ===
        'approved' ||
      payoutRequest.status ===
        'paid'
    );
  }

  if (
    eventType ===
    PAYOUT_EVENT.REJECTED
  ) {
    return (
      payoutRequest.status ===
      'rejected'
    );
  }

  if (
    eventType ===
    PAYOUT_EVENT.PAID
  ) {
    return (
      payoutRequest.status ===
      'paid'
    );
  }

  return false;
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
  payoutRequestId,
  eventType,
}) {
  const {
    data: existingDelivery,
    error: existingError,
  } = await supabase
    .from(
      'payout_status_email_deliveries'
    )
    .select(`
      id,
      status
    `)
    .eq(
      'payout_request_id',
      payoutRequestId
    )
    .eq(
      'event_type',
      eventType
    )
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `The payout email delivery state could not be loaded: ${existingError.message}`
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
          'The email was already sent or is currently being processed.',
      };
    }

    const {
      data: reclaimedDelivery,
      error: reclaimError,
    } = await supabase
      .from(
        'payout_status_email_deliveries'
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
        `The failed payout email could not be retried: ${reclaimError.message}`
      );
    }

    return {
      claimed:
        Boolean(reclaimedDelivery),
      reason:
        reclaimedDelivery
          ? null
          : 'Another request claimed the email first.',
    };
  }

  const {
    data: insertedDelivery,
    error: insertError,
  } = await supabase
    .from(
      'payout_status_email_deliveries'
    )
    .insert({
      payout_request_id:
        payoutRequestId,
      event_type:
        eventType,
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
        'Another request created the email delivery first.',
    };
  }

  if (insertError) {
    throw new Error(
      `The payout email delivery could not be claimed: ${insertError.message}`
    );
  }

  return {
    claimed:
      Boolean(insertedDelivery),
    reason:
      insertedDelivery
        ? null
        : 'The payout email could not be claimed.',
  };
}

async function recordDeliveryFailure({
  supabase,
  payoutRequestId,
  eventType,
  errorMessage,
}) {
  const normalizedError =
    String(
      errorMessage ||
        'Unknown payout status email error.'
    ).slice(0, 2000);

  const {
    error,
  } = await supabase
    .from(
      'payout_status_email_deliveries'
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
      'payout_request_id',
      payoutRequestId
    )
    .eq(
      'event_type',
      eventType
    )
    .eq(
      'status',
      DELIVERY_STATUS.SENDING
    );

  if (error) {
    logError(
      'payout_status_email_failure_recording_failed',
      {
        payoutRequestId,
        eventType,
      },
      error
    );
  }
}

async function recordDeliverySuccess({
  supabase,
  payoutRequestId,
  eventType,
  providerMessageId,
}) {
  const sentAt =
    new Date().toISOString();

  const {
    error,
  } = await supabase
    .from(
      'payout_status_email_deliveries'
    )
    .update({
      status:
        DELIVERY_STATUS.SENT,
      sent_at:
        sentAt,
      provider_message_id:
        providerMessageId || null,
      error_message:
        null,
      updated_at:
        sentAt,
    })
    .eq(
      'payout_request_id',
      payoutRequestId
    )
    .eq(
      'event_type',
      eventType
    )
    .eq(
      'status',
      DELIVERY_STATUS.SENDING
    );

  if (error) {
    throw new Error(
      `The payout email success could not be recorded: ${error.message}`
    );
  }
}

function getEventContent({
  payoutRequest,
  eventType,
}) {
  const amount =
    formatMoney(
      payoutRequest.requested_amount,
      payoutRequest.currency
    );

  if (
    eventType ===
    PAYOUT_EVENT.APPROVED
  ) {
    return {
      heading:
        'Your payout was approved',
      subject:
        `BeatMarket payout approved — ${amount}`,
      message:
        'Your payout request has been approved. BeatMarket will complete the bank transfer after the payment is processed.',
      detailLabel:
        'Approved amount',
      detailValue:
        amount,
    };
  }

  if (
    eventType ===
    PAYOUT_EVENT.REJECTED
  ) {
    return {
      heading:
        'Your payout was rejected',
      subject:
        `BeatMarket payout rejected — ${amount}`,
      message:
        'Your payout request was rejected. The reserved earnings have been released according to the payout process.',
      detailLabel:
        'Rejection reason',
      detailValue:
        payoutRequest.rejection_reason ||
        'No rejection reason was provided.',
    };
  }

  return {
    heading:
      'Your payout was paid',
    subject:
      `BeatMarket payout paid — ${amount}`,
    message:
      'BeatMarket has marked your payout as paid. The time required for the funds to appear may depend on your bank.',
    detailLabel:
      'Bank transfer reference',
    detailValue:
      payoutRequest.bank_transfer_reference ||
      'No bank transfer reference was provided.',
  };
}

function buildEmailContent({
  payoutRequest,
  eventType,
  baseUrl,
}) {
  const amount =
    formatMoney(
      payoutRequest.requested_amount,
      payoutRequest.currency
    );

  const eventContent =
    getEventContent({
      payoutRequest,
      eventType,
    });

  const dashboardUrl =
    getDashboardUrl(baseUrl);

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
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <title>BeatMarket payout update</title>
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
                ${escapeHtml(eventContent.heading)}
              </h1>

              <p style="margin: 16px 0 0; color: #4b5563; line-height: 1.6;">
                ${escapeHtml(eventContent.message)}
              </p>

              <div style="margin-top: 24px; padding: 16px; border-radius: 8px; background: #f9fafb;">
                <div style="font-size: 13px; color: #6b7280;">
                  Payout request
                </div>

                <div style="margin-top: 4px; color: #111827; font-weight: 600; word-break: break-all;">
                  ${escapeHtml(payoutRequest.id)}
                </div>

                <div style="margin-top: 16px; font-size: 13px; color: #6b7280;">
                  Amount
                </div>

                <div style="margin-top: 4px; color: #111827; font-size: 18px; font-weight: 700;">
                  ${escapeHtml(amount)}
                </div>

                <div style="margin-top: 16px; font-size: 13px; color: #6b7280;">
                  ${escapeHtml(eventContent.detailLabel)}
                </div>

                <div style="margin-top: 4px; color: #111827;">
                  ${escapeHtml(eventContent.detailValue)}
                </div>
              </div>

              ${dashboardButtonHtml}

              <p style="margin: 28px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This is an automated payout-status notification from BeatMarket.
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
    eventContent.heading,
    '',
    eventContent.message,
    '',
    `Payout request: ${payoutRequest.id}`,
    `Amount: ${amount}`,
    `${eventContent.detailLabel}: ${eventContent.detailValue}`,
    ...(dashboardUrl
      ? [
          '',
          `Open producer dashboard: ${dashboardUrl}`,
        ]
      : []),
  ].join('\n');

  return {
    subject:
      eventContent.subject,
    html,
    text,
  };
}

export async function sendPayoutStatusEmail({
  payoutRequestId,
  eventType,
  baseUrl,
  requestId = null,
}) {
  if (
    !payoutRequestId ||
    !isSupportedEvent(eventType)
  ) {
    logWarning(
      'payout_status_email_skipped',
      {
        requestId,
        payoutRequestId:
          payoutRequestId || null,
        eventType:
          eventType || null,
        reason:
          'Missing payout request ID or unsupported payout event.',
      }
    );

    return {
      success: false,
      sent: false,
      skipped: true,
    };
  }

  let claimed = false;
  let providerAccepted = false;

  try {
    const supabase =
      getSupabaseAdmin();

    const payoutRequest =
      await loadPayoutRequest({
        supabase,
        payoutRequestId,
      });

    if (
      !verifyPayoutEvent({
        payoutRequest,
        eventType,
      })
    ) {
      logWarning(
        'payout_status_email_skipped',
        {
          requestId,
          payoutRequestId,
          eventType,
          storedStatus:
            payoutRequest.status,
          reason:
            'The payout status does not match the requested email event.',
        }
      );

      return {
        success: false,
        sent: false,
        skipped: true,
      };
    }

    const claimResult =
      await claimDelivery({
        supabase,
        payoutRequestId,
        eventType,
      });

    claimed =
      claimResult.claimed;

    if (!claimed) {
      logInfo(
        'payout_status_email_not_claimed',
        {
          requestId,
          payoutRequestId,
          eventType,
          reason:
            claimResult.reason,
        }
      );

      return {
        success: true,
        sent: false,
        skipped: true,
      };
    }

    const producerEmail =
      await getProducerEmail({
        supabase,
        producerId:
          payoutRequest.producer_id,
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
        payoutRequest,
        eventType,
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
          'Resend rejected the payout-status email.'
      );
    }

    providerAccepted = true;

    await recordDeliverySuccess({
      supabase,
      payoutRequestId,
      eventType,
      providerMessageId:
        data?.id || null,
    });

    logInfo(
      'payout_status_email_sent',
      {
        requestId,
        payoutRequestId,
        producerId:
          payoutRequest.producer_id,
        eventType,
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
    /*
      When Resend accepted the message but the database update
      failed, keep the delivery in "sending". This prevents an
      automatic retry from sending the same email twice.
    */
    if (
      claimed &&
      !providerAccepted
    ) {
      try {
        const supabase =
          getSupabaseAdmin();

        await recordDeliveryFailure({
          supabase,
          payoutRequestId,
          eventType,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Unknown payout status email error.',
        });
      } catch (recordingError) {
        logError(
          'payout_status_email_failure_recording_failed',
          {
            requestId,
            payoutRequestId,
            eventType,
          },
          recordingError
        );
      }
    }

    logError(
      'payout_status_email_failed',
      {
        requestId,
        payoutRequestId,
        eventType,
        providerAccepted,
      },
      error
    );

    /*
      Email failure must never reverse or invalidate a payout
      status change that already succeeded in the database.
    */
    return {
      success: false,
      sent: false,
      skipped: false,
    };
  }
}

export {
  PAYOUT_EVENT,
};