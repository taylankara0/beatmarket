import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient:
    vi.fn(),

  createRequestId:
    vi.fn(),

  logError:
    vi.fn(),

  logInfo:
    vi.fn(),

  logWarning:
    vi.fn()
}));

vi.mock(
  '@supabase/supabase-js',
  () => ({
    createClient:
      mocks.createSupabaseAdminClient
  })
);

vi.mock(
  '@/lib/serverLogger',
  () => ({
    createRequestId:
      mocks.createRequestId,

    logError:
      mocks.logError,

    logInfo:
      mocks.logInfo,

    logWarning:
      mocks.logWarning
  })
);

import { GET } from './route';

const REQUEST_ID =
  'request-release-earnings-1';

const FIXED_TIME =
  '2026-07-29T05:40:00.000Z';

function createAuthorizedRequest() {
  return new Request(
    'http://localhost:3000/api/internal/release-earnings',
    {
      method: 'GET',

      headers: {
        authorization:
          'Bearer test-cron-secret'
      }
    }
  );
}

function configureSuccessfulRelease({
  releasedCount,
  historyError = null
}) {
  const releaseRpc = vi
    .fn()
    .mockResolvedValue({
      data: releasedCount,
      error: null
    });

  const releaseClient = {
    rpc: releaseRpc
  };

  const historyInsert = vi
    .fn()
    .mockResolvedValue({
      error: historyError
    });

  const historyFrom = vi
    .fn()
    .mockReturnValue({
      insert: historyInsert
    });

  const historyClient = {
    from: historyFrom
  };

  mocks.createSupabaseAdminClient
    .mockReturnValueOnce(
      releaseClient
    )
    .mockReturnValueOnce(
      historyClient
    );

  return {
    releaseClient,
    releaseRpc,
    historyClient,
    historyFrom,
    historyInsert
  };
}

describe(
  'GET /api/internal/release-earnings successful execution',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

      vi.useFakeTimers();

      vi.setSystemTime(
        new Date(FIXED_TIME)
      );

      process.env.CRON_SECRET =
        'test-cron-secret';

      process.env.NEXT_PUBLIC_SUPABASE_URL =
        'https://test.supabase.co';

      process.env.SUPABASE_SERVICE_ROLE_KEY =
        'test-service-role-key';

      mocks.createRequestId
        .mockReturnValue(
          REQUEST_ID
        );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it(
      'releases matured earnings and records a successful scheduled-job run',
      async () => {
        const {
          releaseRpc,
          historyFrom,
          historyInsert
        } = configureSuccessfulRelease({
          releasedCount: 12
        });

        const request =
          createAuthorizedRequest();

        const response =
          await GET(request);

        const body =
          await response.json();

        expect(response.status).toBe(200);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(
          response.headers.get(
            'x-request-id'
          )
        ).toBe(REQUEST_ID);

        expect(body).toEqual({
          success: true,

          earnings: {
            released: 12
          },

          completedAt:
            FIXED_TIME,

          requestId:
            REQUEST_ID
        });

        expect(releaseRpc)
          .toHaveBeenCalledTimes(1);

        expect(releaseRpc)
          .toHaveBeenCalledWith(
            'release_matured_producer_earnings'
          );

        expect(historyFrom)
          .toHaveBeenCalledTimes(1);

        expect(historyFrom)
          .toHaveBeenCalledWith(
            'scheduled_job_runs'
          );

        expect(historyInsert)
          .toHaveBeenCalledTimes(1);

        expect(historyInsert)
          .toHaveBeenCalledWith({
            job_name:
              'release_matured_earnings',

            request_id:
              REQUEST_ID,

            status:
              'succeeded',

            started_at:
              FIXED_TIME,

            completed_at:
              FIXED_TIME,

            duration_ms: 0,

            summary: {
              releasedCount: 12
            },

            error_message:
              null
          });

        expect(
          mocks.logInfo
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.logInfo
        ).toHaveBeenCalledWith(
          'earnings_release_completed',
          {
            requestId:
              REQUEST_ID,

            releasedCount: 12,

            completedAt:
              FIXED_TIME,

            durationMs: 0,

            historyRecorded:
              true
          }
        );

        expect(
          mocks.logWarning
        ).not.toHaveBeenCalled();

        expect(
          mocks.logError
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'treats an empty RPC result as zero released earnings',
      async () => {
        const {
          releaseRpc,
          historyInsert
        } = configureSuccessfulRelease({
          releasedCount: null
        });

        const response =
          await GET(
            createAuthorizedRequest()
          );

        const body =
          await response.json();

        expect(response.status).toBe(200);

        expect(body).toEqual({
          success: true,

          earnings: {
            released: 0
          },

          completedAt:
            FIXED_TIME,

          requestId:
            REQUEST_ID
        });

        expect(releaseRpc)
          .toHaveBeenCalledWith(
            'release_matured_producer_earnings'
          );

        expect(historyInsert)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'succeeded',

              summary: {
                releasedCount: 0
              }
            })
          );

        expect(
          mocks.logInfo
        ).toHaveBeenCalledWith(
          'earnings_release_completed',
          expect.objectContaining({
            releasedCount: 0,

            historyRecorded:
              true
          })
        );

        expect(
          mocks.logError
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'keeps the earnings release successful when job-history persistence fails',
      async () => {
        const historyError = {
          message:
            'History insert failed.'
        };

        const {
          historyInsert
        } = configureSuccessfulRelease({
          releasedCount: 5,
          historyError
        });

        const response =
          await GET(
            createAuthorizedRequest()
          );

        const body =
          await response.json();

        expect(response.status).toBe(200);

        expect(body).toEqual({
          success: true,

          earnings: {
            released: 5
          },

          completedAt:
            FIXED_TIME,

          requestId:
            REQUEST_ID
        });

        expect(historyInsert)
          .toHaveBeenCalledTimes(1);

        expect(
          mocks.logError
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.logError
        ).toHaveBeenCalledWith(
          'scheduled_job_run_record_failed',
          expect.objectContaining({
            message:
              'The scheduled job run could not be recorded.'
          }),
          {
            requestId:
              REQUEST_ID,

            jobName:
              'release_matured_earnings',

            status:
              'succeeded'
          }
        );

        expect(
          mocks.logInfo
        ).toHaveBeenCalledWith(
          'earnings_release_completed',
          {
            requestId:
              REQUEST_ID,

            releasedCount: 5,

            completedAt:
              FIXED_TIME,

            durationMs: 0,

            historyRecorded:
              false
          }
        );

        expect(
          mocks.logWarning
        ).not.toHaveBeenCalled();
      }
    );
  }
);