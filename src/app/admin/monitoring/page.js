import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  logError,
} from '@/lib/serverLogger';

import {
  createClient,
} from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const COLORS = {
  text: '#101828',
  muted: '#667085',
  subtle: '#98a2b3',
  border: '#e5e7eb',
  white: '#ffffff',
  blue: '#175cd3',
  green: '#067647',
  amber: '#93370d',
  red: '#b42318',
};

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    throw new Error(
      'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is missing.'
    );
  }

  return createSupabaseAdminClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken:
          false,

        persistSession:
          false,
      },
    }
  );
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

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
      dateStyle:
        'medium',

      timeStyle:
        'short',
    }
  ).format(date);
}

function formatDuration(value) {
  const durationMs =
    Number(value);

  if (
    !Number.isFinite(
      durationMs
    ) ||
    durationMs < 0
  ) {
    return '-';
  }

  if (durationMs < 1000) {
    return `${Math.round(
      durationMs
    )} ms`;
  }

  if (durationMs < 60000) {
    return `${(
      durationMs /
      1000
    ).toFixed(2)} s`;
  }

  return `${(
    durationMs /
    60000
  ).toFixed(2)} min`;
}

function getStatusPresentation(
  status
) {
  switch (status) {
    case 'succeeded':
      return {
        label:
          'Succeeded',

        background:
          '#ecfdf3',

        color:
          '#067647',

        border:
          '#a6f4c5',
      };

    case 'partial_failure':
      return {
        label:
          'Partial Failure',

        background:
          '#fffaeb',

        color:
          '#93370d',

        border:
          '#fec84b',
      };

    case 'failed':
      return {
        label:
          'Failed',

        background:
          '#fef3f2',

        color:
          '#b42318',

        border:
          '#fecdca',
      };

    default:
      return {
        label:
          'Unknown',

        background:
          '#f2f4f7',

        color:
          '#475467',

        border:
          '#d0d5dd',
      };
  }
}

function getEmailTypePresentation(
  type
) {
  switch (type) {
    case 'buyer_purchase':
      return {
        label:
          'Buyer Purchase Confirmation',

        background:
          '#eff8ff',

        color:
          '#175cd3',

        border:
          '#b2ddff',
      };

    case 'buyer_refund':
      return {
        label:
          'Buyer Refund Confirmation',

        background:
          '#f4f3ff',

        color:
          '#5925dc',

        border:
          '#d9d6fe',
      };

    case 'producer_sale':
      return {
        label:
          'Producer Sale Notification',

        background:
          '#ecfdf3',

        color:
          '#067647',

        border:
          '#a6f4c5',
      };

    case 'payout_status':
      return {
        label:
          'Producer Payout Status',

        background:
          '#fffaeb',

        color:
          '#93370d',

        border:
          '#fec84b',
      };

    case 'producer_refund':
      return {
        label:
          'Producer Refund Notification',

        background:
          '#fff6ed',

        color:
          '#b93815',

        border:
          '#f9dbaf',
      };

    default:
      return {
        label:
          'Transactional Email',

        background:
          '#f2f4f7',

        color:
          '#475467',

        border:
          '#d0d5dd',
      };
  }
}

function getJobLabel(
  jobName
) {
  switch (jobName) {
    case 'release_matured_earnings':
      return 'Release Matured Earnings';

    case 'cleanup_uploads_and_state':
      return 'Uploads and State Cleanup';

    default:
      return jobName ||
        'Unknown Job';
  }
}

function getSummaryObject(value) {
  if (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(value)
  ) {
    return value;
  }

  return {};
}

function formatJobSummary(
  jobName,
  summaryValue
) {
  const summary =
    getSummaryObject(
      summaryValue
    );

  if (
    jobName ===
    'release_matured_earnings'
  ) {
    const releasedCount =
      Number(
        summary.releasedCount ||
        0
      );

    return `${Number.isFinite(
      releasedCount
    )
      ? releasedCount
      : 0} producer earning record(s) released.`;
  }

  if (
    jobName ===
    'cleanup_uploads_and_state'
  ) {
    const temporaryUploads =
      getSummaryObject(
        summary.temporaryUploads
      );

    const checkoutState =
      getSummaryObject(
        summary.checkoutState
      );

    const apiRateLimits =
      getSummaryObject(
        summary.apiRateLimits
      );

    return [
      `Uploads scanned: ${
        Number(
          temporaryUploads.scanned ||
          0
        )
      }`,

      `deleted: ${
        Number(
          temporaryUploads.deleted ||
          0
        )
      }`,

      `deletion failures: ${
        Number(
          temporaryUploads
            .deletionFailureCount ||
          0
        )
      }`,

      `expired checkout orders: ${
        Number(
          checkoutState
            .expiredInitializingOrders ||
          0
        )
      }`,

      `rate-limit rows deleted: ${
        Number(
          apiRateLimits.deletedRows ||
          0
        )
      }`,
    ].join(' · ');
  }

  if (
    Object.keys(
      summary
    ).length === 0
  ) {
    return 'No summary information.';
  }

  return JSON.stringify(
    summary
  );
}

function normalizeEmailError(value) {
  const normalizedValue =
    String(
      value ||
      'No delivery error message was recorded.'
    ).trim();

  return (
    normalizedValue ||
    'No delivery error message was recorded.'
  );
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }

  const timestamp =
    new Date(
      value
    ).getTime();

  return Number.isFinite(
    timestamp
  )
    ? timestamp
    : 0;
}

async function loadEmailFailures({
  supabaseAdmin,
  userId,
}) {
  const [
    purchaseResult,
    buyerRefundResult,
    producerSaleResult,
    payoutStatusResult,
    producerRefundResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select(`
        id,
        public_id,
        purchase_confirmation_email_error,
        purchase_confirmation_email_updated_at
      `)
      .eq(
        'purchase_confirmation_email_status',
        'failed'
      )
      .order(
        'purchase_confirmation_email_updated_at',
        {
          ascending:
            false,
        }
      )
      .limit(50),

    supabaseAdmin
      .from(
        'order_refunds'
      )
      .select(`
        id,
        order_id,
        refund_confirmation_email_error,
        refund_confirmation_email_updated_at
      `)
      .eq(
        'refund_confirmation_email_status',
        'failed'
      )
      .order(
        'refund_confirmation_email_updated_at',
        {
          ascending:
            false,
        }
      )
      .limit(50),

    supabaseAdmin
      .from(
        'producer_sale_email_deliveries'
      )
      .select(`
        id,
        order_id,
        producer_id,
        error_message,
        updated_at
      `)
      .eq(
        'status',
        'failed'
      )
      .order(
        'updated_at',
        {
          ascending:
            false,
        }
      )
      .limit(50),

    supabaseAdmin
      .from(
        'payout_status_email_deliveries'
      )
      .select(`
        id,
        payout_request_id,
        event_type,
        error_message,
        updated_at
      `)
      .eq(
        'status',
        'failed'
      )
      .order(
        'updated_at',
        {
          ascending:
            false,
        }
      )
      .limit(50),

    supabaseAdmin
      .from(
        'producer_refund_email_deliveries'
      )
      .select(`
        id,
        order_refund_id,
        producer_id,
        error_message,
        updated_at
      `)
      .eq(
        'status',
        'failed'
      )
      .order(
        'updated_at',
        {
          ascending:
            false,
        }
      )
      .limit(50),
  ]);

  const failures = [];
  const unavailableSources = [];

  const sources = [
    {
      name:
        'Buyer purchase confirmations',

      result:
        purchaseResult,

      mapRecord:
        (record) => ({
          id:
            `buyer-purchase:${record.id}`,

          type:
            'buyer_purchase',

          primaryLabel:
            'Order',

          primaryValue:
            record.public_id ||
            record.id,

          secondaryLabel:
            'Internal order ID',

          secondaryValue:
            record.id,

          errorMessage:
            normalizeEmailError(
              record
                .purchase_confirmation_email_error
            ),

          updatedAt:
            record
              .purchase_confirmation_email_updated_at,
        }),
    },

    {
      name:
        'Buyer refund confirmations',

      result:
        buyerRefundResult,

      mapRecord:
        (record) => ({
          id:
            `buyer-refund:${record.id}`,

          type:
            'buyer_refund',

          primaryLabel:
            'Refund ID',

          primaryValue:
            record.id,

          secondaryLabel:
            'Order ID',

          secondaryValue:
            record.order_id,

          errorMessage:
            normalizeEmailError(
              record
                .refund_confirmation_email_error
            ),

          updatedAt:
            record
              .refund_confirmation_email_updated_at,
        }),
    },

    {
      name:
        'Producer sale notifications',

      result:
        producerSaleResult,

      mapRecord:
        (record) => ({
          id:
            `producer-sale:${record.id}`,

          type:
            'producer_sale',

          primaryLabel:
            'Order ID',

          primaryValue:
            record.order_id,

          secondaryLabel:
            'Producer ID',

          secondaryValue:
            record.producer_id,

          errorMessage:
            normalizeEmailError(
              record.error_message
            ),

          updatedAt:
            record.updated_at,
        }),
    },

    {
      name:
        'Producer payout notifications',

      result:
        payoutStatusResult,

      mapRecord:
        (record) => ({
          id:
            `payout-status:${record.id}`,

          type:
            'payout_status',

          primaryLabel:
            'Payout request ID',

          primaryValue:
            record.payout_request_id,

          secondaryLabel:
            'Payout event',

          secondaryValue:
            record.event_type,

          errorMessage:
            normalizeEmailError(
              record.error_message
            ),

          updatedAt:
            record.updated_at,
        }),
    },

    {
      name:
        'Producer refund notifications',

      result:
        producerRefundResult,

      mapRecord:
        (record) => ({
          id:
            `producer-refund:${record.id}`,

          type:
            'producer_refund',

          primaryLabel:
            'Refund ID',

          primaryValue:
            record.order_refund_id,

          secondaryLabel:
            'Producer ID',

          secondaryValue:
            record.producer_id,

          errorMessage:
            normalizeEmailError(
              record.error_message
            ),

          updatedAt:
            record.updated_at,
        }),
    },
  ];

  for (
    const source of sources
  ) {
    if (
      source.result.error
    ) {
      unavailableSources.push(
        source.name
      );

      logError(
        'admin_monitoring_email_failure_source_load_failed',
        source.result.error,
        {
          userId,
          source:
            source.name,
        }
      );

      continue;
    }

    failures.push(
      ...(
        source.result.data ||
        []
      ).map(
        source.mapRecord
      )
    );
  }

  failures.sort(
    (
      firstFailure,
      secondFailure
    ) =>
      toTimestamp(
        secondFailure.updatedAt
      ) -
      toTimestamp(
        firstFailure.updatedAt
      )
  );

  return {
    failures:
      failures.slice(
        0,
        100
      ),

    unavailableSources,
  };
}

function NavigationLink({
  href,
  children,
}) {
  return (
    <Link
      href={href}
      style={{
        padding:
          '10px 16px',

        border:
          '1px solid #d0d5dd',

        borderRadius:
          '8px',

        background:
          COLORS.white,

        color:
          '#344054',

        textDecoration:
          'none',

        fontSize:
          '14px',

        fontWeight:
          'bold',
      }}
    >
      {children}
    </Link>
  );
}

function StatCard({
  label,
  value,
  color = COLORS.text,
}) {
  return (
    <div
      style={{
        padding:
          '20px',

        border:
          `1px solid ${COLORS.border}`,

        borderRadius:
          '10px',

        background:
          COLORS.white,
      }}
    >
      <p
        style={{
          margin:
            '0 0 8px 0',

          color:
            COLORS.muted,

          fontSize:
            '14px',
        }}
      >
        {label}
      </p>

      <p
        style={{
          margin:
            0,

          fontSize:
            '26px',

          fontWeight:
            'bold',

          color,

          wordBreak:
            'break-word',
        }}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  presentation,
}) {
  return (
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
      {presentation.label}
    </span>
  );
}

function EmptyState({
  children,
  positive = false,
}) {
  return (
    <div
      style={{
        padding:
          '32px',

        border:
          positive
            ? '1px dashed #a6f4c5'
            : '1px dashed #d0d5dd',

        borderRadius:
          '10px',

        color:
          positive
            ? COLORS.green
            : COLORS.muted,

        textAlign:
          'center',

        background:
          positive
            ? '#ecfdf3'
            : COLORS.white,
      }}
    >
      {children}
    </div>
  );
}

function EmailFailureCard({
  failure,
}) {
  const presentation =
    getEmailTypePresentation(
      failure.type
    );

  return (
    <article
      style={{
        padding:
          '20px',

        border:
          `1px solid ${presentation.border}`,

        borderRadius:
          '12px',

        background:
          COLORS.white,
      }}
    >
      <div
        style={{
          display:
            'flex',

          justifyContent:
            'space-between',

          alignItems:
            'flex-start',

          gap:
            '20px',

          flexWrap:
            'wrap',

          marginBottom:
            '14px',
        }}
      >
        <div>
          <StatusBadge
            presentation={
              presentation
            }
          />

          <div
            style={{
              marginTop:
                '12px',

              color:
                '#344054',

              fontSize:
                '14px',

              lineHeight:
                1.7,

              wordBreak:
                'break-all',
            }}
          >
            <div>
              <strong>
                {failure.primaryLabel}:{' '}
              </strong>

              {failure.primaryValue ||
                '-'}
            </div>

            <div>
              <strong>
                {failure.secondaryLabel}:{' '}
              </strong>

              {failure.secondaryValue ||
                '-'}
            </div>
          </div>
        </div>

        <div
          style={{
            color:
              COLORS.muted,

            fontSize:
              '13px',

            lineHeight:
              1.7,
          }}
        >
          Failed:{' '}
          {formatDate(
            failure.updatedAt
          )}
        </div>
      </div>

      <div
        style={{
          padding:
            '12px 14px',

          border:
            '1px solid #fecdca',

          borderRadius:
            '8px',

          background:
            '#fef3f2',

          color:
            COLORS.red,

          fontSize:
            '13px',

          lineHeight:
            1.6,

          whiteSpace:
            'pre-wrap',

          wordBreak:
            'break-word',
        }}
      >
        {failure.errorMessage}
      </div>
    </article>
  );
}

function ScheduledRunCard({
  run,
}) {
  const presentation =
    getStatusPresentation(
      run.status
    );

  return (
    <article
      style={{
        padding:
          '20px',

        border:
          `1px solid ${presentation.border}`,

        borderRadius:
          '12px',

        background:
          COLORS.white,
      }}
    >
      <div
        style={{
          display:
            'flex',

          justifyContent:
            'space-between',

          alignItems:
            'flex-start',

          gap:
            '20px',

          flexWrap:
            'wrap',

          marginBottom:
            '14px',
        }}
      >
        <div>
          <div
            style={{
              display:
                'flex',

              alignItems:
                'center',

              gap:
                '10px',

              flexWrap:
                'wrap',

              marginBottom:
                '8px',
            }}
          >
            <h3
              style={{
                margin:
                  0,
              }}
            >
              {getJobLabel(
                run.job_name
              )}
            </h3>

            <StatusBadge
              presentation={
                presentation
              }
            />
          </div>

          <p
            style={{
              margin:
                0,

              color:
                '#475467',

              fontSize:
                '14px',

              lineHeight:
                1.6,
            }}
          >
            {formatJobSummary(
              run.job_name,
              run.summary
            )}
          </p>
        </div>

        <div
          style={{
            minWidth:
              '220px',

            color:
              COLORS.muted,

            fontSize:
              '13px',

            lineHeight:
              1.7,
          }}
        >
          <div>
            Completed:{' '}
            {formatDate(
              run.completed_at
            )}
          </div>

          <div>
            Duration:{' '}
            {formatDuration(
              run.duration_ms
            )}
          </div>

          <div>
            Started:{' '}
            {formatDate(
              run.started_at
            )}
          </div>
        </div>
      </div>

      {run.error_message && (
        <div
          style={{
            marginBottom:
              '12px',

            padding:
              '12px 14px',

            border:
              '1px solid #fecdca',

            borderRadius:
              '8px',

            background:
              '#fef3f2',

            color:
              COLORS.red,

            fontSize:
              '13px',

            lineHeight:
              1.5,

            whiteSpace:
              'pre-wrap',

            wordBreak:
              'break-word',
          }}
        >
          {run.error_message}
        </div>
      )}

      <div
        style={{
          paddingTop:
            '12px',

          borderTop:
            `1px solid ${COLORS.border}`,

          color:
            COLORS.subtle,

          fontSize:
            '12px',

          lineHeight:
            1.6,

          wordBreak:
            'break-all',
        }}
      >
        <div>
          Request ID:{' '}
          {run.request_id}
        </div>

        <div>
          Job name:{' '}
          {run.job_name}
        </div>
      </div>
    </article>
  );
}

function PageLoadError({
  message,
}) {
  return (
    <div
      style={{
        maxWidth:
          '1100px',

        margin:
          '40px auto',

        padding:
          '0 20px',

        fontFamily:
          'sans-serif',
      }}
    >
      <div
        style={{
          padding:
            '18px',

          border:
            '1px solid #fecdca',

          borderRadius:
            '10px',

          background:
            '#fef3f2',

          color:
            COLORS.red,
        }}
      >
        {message}
      </div>
    </div>
  );
}

export default async function AdminMonitoringPage() {
  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error:
      authError,
  } = await supabase
    .auth
    .getUser();

  if (
    authError ||
    !user
  ) {
    redirect(
      '/login'
    );
  }

  const {
    data:
      isPlatformAdmin,
    error:
      adminCheckError,
  } = await supabase.rpc(
    'is_platform_admin'
  );

  if (
    adminCheckError ||
    isPlatformAdmin !== true
  ) {
    logError(
      'admin_monitoring_authorization_failed',
      adminCheckError ||
        new Error(
          'The current user is not a platform administrator.'
        ),
      {
        userId:
          user.id,
      }
    );

    redirect(
      '/dashboard'
    );
  }

  let supabaseAdmin;

  try {
    supabaseAdmin =
      getSupabaseAdmin();
  } catch (error) {
    logError(
      'admin_monitoring_service_role_client_creation_failed',
      error,
      {
        userId:
          user.id,
      }
    );

    return (
      <PageLoadError
        message="The secure monitoring client could not be created."
      />
    );
  }

  const {
    data:
      scheduledJobRuns,
    error:
      scheduledJobRunsError,
  } = await supabase
    .from(
      'scheduled_job_runs'
    )
    .select(`
      id,
      job_name,
      request_id,
      status,
      started_at,
      completed_at,
      duration_ms,
      summary,
      error_message,
      created_at
    `)
    .order(
      'completed_at',
      {
        ascending:
          false,
      }
    )
    .limit(100);

  if (
    scheduledJobRunsError
  ) {
    logError(
      'admin_monitoring_load_failed',
      scheduledJobRunsError,
      {
        userId:
          user.id,
      }
    );

    return (
      <PageLoadError
        message="Scheduled-job monitoring information could not be loaded."
      />
    );
  }

  const {
    failures:
      emailFailures,
    unavailableSources:
      unavailableEmailSources,
  } = await loadEmailFailures({
    supabaseAdmin,
    userId:
      user.id,
  });

  const runs =
    scheduledJobRuns ||
    [];

  const succeededCount =
    runs.filter(
      (run) =>
        run.status ===
        'succeeded'
    ).length;

  const partialFailureCount =
    runs.filter(
      (run) =>
        run.status ===
        'partial_failure'
    ).length;

  const failedCount =
    runs.filter(
      (run) =>
        run.status ===
        'failed'
    ).length;

  const latestRun =
    runs[0] ||
    null;

  const latestEmailFailure =
    emailFailures[0] ||
    null;

  return (
    <div
      style={{
        maxWidth:
          '1250px',

        margin:
          '40px auto',

        padding:
          '0 20px 60px',

        fontFamily:
          'sans-serif',
      }}
    >
      <header
        style={{
          display:
            'flex',

          justifyContent:
            'space-between',

          alignItems:
            'center',

          gap:
            '20px',

          marginBottom:
            '30px',

          paddingBottom:
            '20px',

          borderBottom:
            `1px solid ${COLORS.border}`,

          flexWrap:
            'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin:
                '0 0 6px 0',
            }}
          >
            Admin Monitoring
          </h1>

          <p
            style={{
              margin:
                0,

              color:
                COLORS.muted,

              lineHeight:
                1.5,
            }}
          >
            Review scheduled jobs and transactional email delivery failures.
          </p>
        </div>

        <div
          style={{
            display:
              'flex',

            gap:
              '10px',

            flexWrap:
              'wrap',
          }}
        >
          <NavigationLink
            href="/admin/payouts"
          >
            Payouts
          </NavigationLink>

          <NavigationLink
            href="/admin/refunds"
          >
            Refunds
          </NavigationLink>

          <NavigationLink
            href="/dashboard"
          >
            Dashboard
          </NavigationLink>
        </div>
      </header>

      <section
        style={{
          display:
            'grid',

          gridTemplateColumns:
            'repeat(auto-fit, minmax(180px, 1fr))',

          gap:
            '16px',

          marginBottom:
            '40px',
        }}
      >
        <StatCard
          label="Recent Runs"
          value={runs.length}
          color={
            COLORS.blue
          }
        />

        <StatCard
          label="Succeeded"
          value={
            succeededCount
          }
          color={
            COLORS.green
          }
        />

        <StatCard
          label="Partial Failures"
          value={
            partialFailureCount
          }
          color={
            COLORS.amber
          }
        />

        <StatCard
          label="Failed"
          value={
            failedCount
          }
          color={
            COLORS.red
          }
        />

        <StatCard
          label="Latest Run"
          value={
            latestRun
              ? formatDate(
                  latestRun
                    .completed_at
                )
              : '-'
          }
          color="#344054"
        />
      </section>

      <section
        style={{
          marginBottom:
            '40px',
        }}
      >
        <div
          style={{
            marginBottom:
              '18px',
          }}
        >
          <h2
            style={{
              margin:
                '0 0 6px 0',
            }}
          >
            Email Delivery Failures
          </h2>

          <p
            style={{
              margin:
                0,

              color:
                COLORS.muted,

              lineHeight:
                1.5,
            }}
          >
            Displays up to 100 of the latest failed buyer and producer transactional email deliveries.
          </p>
        </div>

        <div
          style={{
            display:
              'grid',

            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',

            gap:
              '16px',

            marginBottom:
              '18px',
          }}
        >
          <StatCard
            label="Recent Email Failures"
            value={
              emailFailures.length
            }
            color={
              emailFailures.length >
              0
                ? COLORS.red
                : COLORS.green
            }
          />

          <StatCard
            label="Unavailable Email Sources"
            value={
              unavailableEmailSources.length
            }
            color={
              unavailableEmailSources.length >
              0
                ? COLORS.amber
                : COLORS.green
            }
          />

          <StatCard
            label="Latest Email Failure"
            value={
              latestEmailFailure
                ? formatDate(
                    latestEmailFailure
                      .updatedAt
                  )
                : '-'
            }
            color="#344054"
          />
        </div>

        {unavailableEmailSources.length >
          0 && (
          <div
            style={{
              marginBottom:
                '18px',

              padding:
                '14px 16px',

              border:
                '1px solid #fec84b',

              borderRadius:
                '10px',

              background:
                '#fffaeb',

              color:
                COLORS.amber,

              fontSize:
                '14px',

              lineHeight:
                1.6,
            }}
          >
            Some email-delivery sources could not be loaded:{' '}
            {unavailableEmailSources.join(
              ', '
            )}
          </div>
        )}

        {emailFailures.length ===
        0 ? (
          <EmptyState positive>
            No failed transactional email deliveries are currently recorded.
          </EmptyState>
        ) : (
          <div
            style={{
              display:
                'grid',

              gap:
                '16px',
            }}
          >
            {emailFailures.map(
              (failure) => (
                <EmailFailureCard
                  key={
                    failure.id
                  }
                  failure={
                    failure
                  }
                />
              )
            )}
          </div>
        )}
      </section>

      <section>
        <div
          style={{
            marginBottom:
              '18px',
          }}
        >
          <h2
            style={{
              margin:
                '0 0 6px 0',
            }}
          >
            Scheduled Job History
          </h2>

          <p
            style={{
              margin:
                0,

              color:
                COLORS.muted,

              lineHeight:
                1.5,
            }}
          >
            Displays the latest 100 authorized scheduled-job runs.
          </p>
        </div>

        {runs.length === 0 ? (
          <EmptyState>
            No scheduled-job runs have been recorded yet. Records will appear after the deployed cron jobs run.
          </EmptyState>
        ) : (
          <div
            style={{
              display:
                'grid',

              gap:
                '16px',
            }}
          >
            {runs.map(
              (run) => (
                <ScheduledRunCard
                  key={
                    run.id
                  }
                  run={
                    run
                  }
                />
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}