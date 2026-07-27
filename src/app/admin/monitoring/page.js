import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  logError,
} from '@/lib/serverLogger';

import {
  createClient,
} from '@/lib/supabase-server';

export const dynamic =
  'force-dynamic';

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

  const summaryKeys =
    Object.keys(summary);

  if (
    summaryKeys.length === 0
  ) {
    return 'No summary information.';
  }

  return JSON.stringify(
    summary
  );
}

function StatCard({
  label,
  value,
  color = '#101828',
}) {
  return (
    <div
      style={{
        padding:
          '20px',

        border:
          '1px solid #e5e7eb',

        borderRadius:
          '10px',

        background:
          '#fff',
      }}
    >
      <p
        style={{
          margin:
            '0 0 8px 0',

          color:
            '#667085',

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
        }}
      >
        {value}
      </p>
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
              '#b42318',
          }}
        >
          Scheduled-job monitoring information could not be loaded.
        </div>
      </div>
    );
  }

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
            '1px solid #e5e7eb',

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
                '#667085',

              lineHeight:
                1.5,
            }}
          >
            Review recent cleanup and producer-earnings scheduled jobs.
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
          <Link
            href="/admin/payouts"
            style={{
              padding:
                '10px 16px',

              border:
                '1px solid #d0d5dd',

              borderRadius:
                '8px',

              background:
                '#fff',

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
            Payouts
          </Link>

          <Link
            href="/admin/refunds"
            style={{
              padding:
                '10px 16px',

              border:
                '1px solid #d0d5dd',

              borderRadius:
                '8px',

              background:
                '#fff',

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
            Refunds
          </Link>

          <Link
            href="/dashboard"
            style={{
              padding:
                '10px 16px',

              border:
                '1px solid #d0d5dd',

              borderRadius:
                '8px',

              background:
                '#fff',

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
            Dashboard
          </Link>
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
            '32px',
        }}
      >
        <StatCard
          label="Recent Runs"
          value={runs.length}
          color="#175cd3"
        />

        <StatCard
          label="Succeeded"
          value={succeededCount}
          color="#067647"
        />

        <StatCard
          label="Partial Failures"
          value={partialFailureCount}
          color="#93370d"
        />

        <StatCard
          label="Failed"
          value={failedCount}
          color="#b42318"
        />

        <StatCard
          label="Latest Run"
          value={
            latestRun
              ? formatDate(
                  latestRun.completed_at
                )
              : '-'
          }
          color="#344054"
        />
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
                '#667085',

              lineHeight:
                1.5,
            }}
          >
            Displays the latest 100 authorized scheduled-job runs.
          </p>
        </div>

        {runs.length === 0 ? (
          <div
            style={{
              padding:
                '32px',

              border:
                '1px dashed #d0d5dd',

              borderRadius:
                '10px',

              color:
                '#667085',

              textAlign:
                'center',

              background:
                '#fff',
            }}
          >
            No scheduled-job runs have been recorded yet. Records will appear after the deployed cron jobs run.
          </div>
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
              (run) => {
                const presentation =
                  getStatusPresentation(
                    run.status
                  );

                return (
                  <article
                    key={run.id}
                    style={{
                      padding:
                        '20px',

                      border:
                        `1px solid ${presentation.border}`,

                      borderRadius:
                        '12px',

                      background:
                        '#fff',
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
                            '#667085',

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
                            '#b42318',

                          fontSize:
                            '13px',

                          lineHeight:
                            1.5,
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
                          '1px solid #e5e7eb',

                        color:
                          '#98a2b3',

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
            )}
          </div>
        )}
      </section>
    </div>
  );
}