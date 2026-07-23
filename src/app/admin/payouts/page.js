import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase-server';

import {
  approvePayoutRequest,
  completePayoutRequest,
  rejectPayoutRequest,
} from './actions';

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

function formatIban(value) {
  if (typeof value !== 'string') {
    return '-';
  }

  const normalizedIban = value
    .replace(/\s+/g, '')
    .toUpperCase();

  if (!/^TR[0-9]{24}$/.test(normalizedIban)) {
    return '-';
  }

  return normalizedIban
    .replace(/(.{4})/g, '$1 ')
    .trim();
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

function getStatusPresentation(status) {
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

export default async function AdminPayoutsPage({
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

  const {
    data: isPlatformAdmin,
    error: adminCheckError,
  } = await supabase.rpc('is_platform_admin');

  if (
    adminCheckError ||
    isPlatformAdmin !== true
  ) {
    console.error(
      'Platform admin authorization error:',
      adminCheckError
    );

    redirect('/dashboard');
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
    data: payoutRequestsData,
    error: payoutRequestsError,
  } = await supabase
    .from('payout_requests')
    .select(`
      id,
      producer_id,
      payout_account_id,
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
    .order('created_at', {
      ascending: false,
    })
    .limit(100);

  if (payoutRequestsError) {
    console.error(
      'Admin payout requests loading error:',
      payoutRequestsError
    );

    return (
      <div
        style={{
          maxWidth: '1000px',
          margin: '40px auto',
          padding: '0 20px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            padding: '18px',
            border: '1px solid #fecdca',
            borderRadius: '10px',
            background: '#fef3f2',
            color: '#b42318',
          }}
        >
          Payout requests could not be loaded.
        </div>
      </div>
    );
  }

  const payoutRequests = (
    payoutRequestsData ?? []
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

  const requestedCount = payoutRequests.filter(
    (request) => request.status === 'requested'
  ).length;

  const approvedCount = payoutRequests.filter(
    (request) => request.status === 'approved'
  ).length;

  const paidCount = payoutRequests.filter(
    (request) => request.status === 'paid'
  ).length;

  const rejectedCount = payoutRequests.filter(
    (request) => request.status === 'rejected'
  ).length;

  const activeRequestedTotal = payoutRequests
    .filter(
      (request) =>
        request.status === 'requested' ||
        request.status === 'approved'
    )
    .reduce(
      (total, request) =>
        total + request.requested_amount,
      0
    );

  return (
    <div
      style={{
        maxWidth: '1200px',
        margin: '40px auto',
        padding: '0 20px 60px',
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
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '20px',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 6px 0',
            }}
          >
            Admin Payouts
          </h1>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.5,
            }}
          >
            Review producer payout requests and record
            completed bank transfers.
          </p>
        </div>

        <Link
          href="/dashboard"
          style={{
            flexShrink: 0,
            padding: '10px 16px',
            border: '1px solid #d0d5dd',
            borderRadius: '8px',
            background: '#fff',
            color: '#344054',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          Back to Dashboard
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
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin: '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Requested
          </p>

          <p
            style={{
              margin: 0,
              color: '#c2410c',
              fontSize: '26px',
              fontWeight: 'bold',
            }}
          >
            {requestedCount}
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
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Approved
          </p>

          <p
            style={{
              margin: 0,
              color: '#1d4ed8',
              fontSize: '26px',
              fontWeight: 'bold',
            }}
          >
            {approvedCount}
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
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Active Amount
          </p>

          <p
            style={{
              margin: 0,
              color: '#7f56d9',
              fontSize: '26px',
              fontWeight: 'bold',
            }}
          >
            {formatCurrency(
              activeRequestedTotal,
              'TRY'
            )}
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
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Paid
          </p>

          <p
            style={{
              margin: 0,
              color: '#067647',
              fontSize: '26px',
              fontWeight: 'bold',
            }}
          >
            {paidCount}
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
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Rejected
          </p>

          <p
            style={{
              margin: 0,
              color: '#b42318',
              fontSize: '26px',
              fontWeight: 'bold',
            }}
          >
            {rejectedCount}
          </p>
        </div>
      </section>

      <section>
        <div
          style={{
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin: '0 0 6px 0',
              fontSize: '1.5rem',
            }}
          >
            Payout Requests
          </h2>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.5,
            }}
          >
            Showing the 100 most recent payout requests.
          </p>
        </div>

        {payoutRequests.length === 0 ? (
          <div
            style={{
              padding: '36px',
              border: '1px dashed #d0d5dd',
              borderRadius: '10px',
              background: '#fff',
              color: '#667085',
              textAlign: 'center',
            }}
          >
            No payout requests have been recorded yet.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: '18px',
            }}
          >
            {payoutRequests.map((request) => {
              const presentation =
                getStatusPresentation(request.status);

              return (
                <article
                  key={request.id}
                  style={{
                    padding: '22px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    background: '#fff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '20px',
                      flexWrap: 'wrap',
                      marginBottom: '18px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          flexWrap: 'wrap',
                          marginBottom: '8px',
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: '1.15rem',
                          }}
                        >
                          {formatCurrency(
                            request.requested_amount,
                            request.currency
                          )}
                        </h3>

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
                      </div>

                      <p
                        style={{
                          margin: '0 0 4px 0',
                          color: '#344054',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        }}
                      >
                        {
                          request.account_holder_name_snapshot
                        }
                      </p>

                      <p
                        style={{
                          margin: 0,
                          color: '#344054',
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          letterSpacing: '0.02em',
                          wordBreak: 'break-word',
                        }}
                      >
                        {formatIban(request.iban_snapshot)}
                      </p>
                    </div>

                    <div
                      style={{
                        minWidth: '230px',
                        color: '#667085',
                        fontSize: '13px',
                        lineHeight: 1.6,
                      }}
                    >
                      <div>
                        Requested:{' '}
                        {formatDate(request.created_at)}
                      </div>

                      <div
                        style={{
                          wordBreak: 'break-all',
                        }}
                      >
                        Producer ID: {request.producer_id}
                      </div>

                      <div
                        style={{
                          wordBreak: 'break-all',
                        }}
                      >
                        Request ID: {request.id}
                      </div>
                    </div>
                  </div>

                  {request.status === 'requested' && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '16px',
                      }}
                    >
                      <form action={approvePayoutRequest}>
                        <input
                          type="hidden"
                          name="payout_request_id"
                          value={request.id}
                        />

                        <button
                          type="submit"
                          style={{
                            width: '100%',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '11px 16px',
                            background: '#175cd3',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          Approve Request
                        </button>
                      </form>

                      <form action={rejectPayoutRequest}>
                        <input
                          type="hidden"
                          name="payout_request_id"
                          value={request.id}
                        />

                        <label
                          htmlFor={`rejection_reason_${request.id}`}
                          style={{
                            display: 'block',
                            marginBottom: '6px',
                            color: '#344054',
                            fontSize: '13px',
                            fontWeight: 'bold',
                          }}
                        >
                          Rejection Reason
                        </label>

                        <textarea
                          id={`rejection_reason_${request.id}`}
                          name="rejection_reason"
                          required
                          minLength={2}
                          maxLength={500}
                          rows={3}
                          placeholder="Explain why this payout is being rejected."
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            marginBottom: '8px',
                            padding: '10px 12px',
                            border: '1px solid #d0d5dd',
                            borderRadius: '8px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                          }}
                        />

                        <button
                          type="submit"
                          style={{
                            width: '100%',
                            border: '1px solid #f04438',
                            borderRadius: '8px',
                            padding: '10px 16px',
                            background: '#fff',
                            color: '#b42318',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          Reject Request
                        </button>
                      </form>
                    </div>
                  )}

                  {request.status === 'approved' && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '16px',
                      }}
                    >
                      <form action={completePayoutRequest}>
                        <input
                          type="hidden"
                          name="payout_request_id"
                          value={request.id}
                        />

                        <label
                          htmlFor={`bank_transfer_reference_${request.id}`}
                          style={{
                            display: 'block',
                            marginBottom: '6px',
                            color: '#344054',
                            fontSize: '13px',
                            fontWeight: 'bold',
                          }}
                        >
                          Bank Transfer Reference
                        </label>

                        <input
                          id={`bank_transfer_reference_${request.id}`}
                          name="bank_transfer_reference"
                          type="text"
                          required
                          minLength={2}
                          maxLength={250}
                          placeholder="Receipt or transfer reference"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            marginBottom: '8px',
                            padding: '10px 12px',
                            border: '1px solid #d0d5dd',
                            borderRadius: '8px',
                            fontSize: '14px',
                          }}
                        />

                        <button
                          type="submit"
                          style={{
                            width: '100%',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '11px 16px',
                            background: '#067647',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          Mark as Paid
                        </button>
                      </form>

                      <form action={rejectPayoutRequest}>
                        <input
                          type="hidden"
                          name="payout_request_id"
                          value={request.id}
                        />

                        <label
                          htmlFor={`approved_rejection_reason_${request.id}`}
                          style={{
                            display: 'block',
                            marginBottom: '6px',
                            color: '#344054',
                            fontSize: '13px',
                            fontWeight: 'bold',
                          }}
                        >
                          Rejection Reason
                        </label>

                        <textarea
                          id={`approved_rejection_reason_${request.id}`}
                          name="rejection_reason"
                          required
                          minLength={2}
                          maxLength={500}
                          rows={3}
                          placeholder="Explain why this approved payout is being rejected."
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            marginBottom: '8px',
                            padding: '10px 12px',
                            border: '1px solid #d0d5dd',
                            borderRadius: '8px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                          }}
                        />

                        <button
                          type="submit"
                          style={{
                            width: '100%',
                            border: '1px solid #f04438',
                            borderRadius: '8px',
                            padding: '10px 16px',
                            background: '#fff',
                            color: '#b42318',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          Reject Approved Request
                        </button>
                      </form>
                    </div>
                  )}

                  {request.status === 'paid' && (
                    <div
                      style={{
                        padding: '14px',
                        border: '1px solid #a6f4c5',
                        borderRadius: '8px',
                        background: '#ecfdf3',
                        color: '#067647',
                        fontSize: '14px',
                        lineHeight: 1.6,
                      }}
                    >
                      <div>
                        Paid at: {formatDate(request.paid_at)}
                      </div>

                      <div>
                        Transfer reference:{' '}
                        {request.bank_transfer_reference ||
                          '-'}
                      </div>
                    </div>
                  )}

                  {request.status === 'rejected' && (
                    <div
                      style={{
                        padding: '14px',
                        border: '1px solid #fecdca',
                        borderRadius: '8px',
                        background: '#fef3f2',
                        color: '#b42318',
                        fontSize: '14px',
                        lineHeight: 1.6,
                      }}
                    >
                      <div>
                        Rejected at:{' '}
                        {formatDate(request.rejected_at)}
                      </div>

                      <div>
                        Reason:{' '}
                        {request.rejection_reason || '-'}
                      </div>
                    </div>
                  )}

                  {request.status === 'cancelled' && (
                    <div
                      style={{
                        padding: '14px',
                        border: '1px solid #d0d5dd',
                        borderRadius: '8px',
                        background: '#f9fafb',
                        color: '#475467',
                        fontSize: '14px',
                        lineHeight: 1.6,
                      }}
                    >
                      Cancelled at:{' '}
                      {formatDate(request.cancelled_at)}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}