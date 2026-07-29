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
  '2026-07-29T05:45:00.000Z';

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

function configureFailureFlow({
  rpcData = null,
  rpcError = null,
  historyError = null
}) {
  const releaseRpc = vi
    .fn()
    .mockResolvedValue({
      data: rpcData,
      error: rpcError
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
    releaseRpc,
    historyFrom,
    historyInsert
  };
}

describe(
  'GET /api/internal/release-earnings error handling',
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
      'records a failed scheduled-job run when the earnings-release RPC fails',
      async () => {
        const rpcError = {
          message:
            'Database RPC failed.'
        };

        const {
          releaseRpc,
          historyFrom,
          historyInsert
        } = configureFailureFlow({
          rpcError
        });

        const request =
          createAuthorizedRequest();

        const response =
          await GET(request);

        const body =
          await response.json();

        expect(response.status).toBe(500);

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
          success: false,

          error:
            'Matured producer earnings could not be released.',

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
              'failed',

            started_at:
              FIXED_TIME,

            completed_at:
              FIXED_TIME,

            duration_ms: 0,

            summary: {},

            error_message:
              'Matured producer earnings could not be released.'
          });

        expect(
          mocks.logError
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.logError
        ).toHaveBeenCalledWith(
          'earnings_release_failed',
          expect.objectContaining({
            message:
              'Matured producer earnings could not be released.'
          }),
          {
            requestId:
              REQUEST_ID,

            method: 'GET',

            completedAt:
              FIXED_TIME,

            durationMs: 0,

            historyRecorded:
              true
          }
        );

        expect(
          mocks.logInfo
        ).not.toHaveBeenCalled();

        expect(
          mocks.logWarning
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a negative released-earnings count',
      async () => {
        const {
          historyInsert
        } = configureFailureFlow({
          rpcData: -1
        });

        const response =
          await GET(
            createAuthorizedRequest()
          );

        const body =
          await response.json();

        expect(response.status).toBe(500);

        expect(body).toEqual({
          success: false,

          error:
            'The producer earnings release result is invalid.',

          requestId:
            REQUEST_ID
        });

        expect(historyInsert)
          .toHaveBeenCalledWith({
            job_name:
              'release_matured_earnings',

            request_id:
              REQUEST_ID,

            status:
              'failed',

            started_at:
              FIXED_TIME,

            completed_at:
              FIXED_TIME,

            duration_ms: 0,

            summary: {},

            error_message:
              'The producer earnings release result is invalid.'
          });

        expect(
          mocks.logError
        ).toHaveBeenCalledWith(
          'earnings_release_failed',
          expect.objectContaining({
            message:
              'The producer earnings release result is invalid.'
          }),
          expect.objectContaining({
            requestId:
              REQUEST_ID,

            historyRecorded:
              true
          })
        );

        expect(
          mocks.logInfo
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a fractional released-earnings count',
      async () => {
        const {
          historyInsert
        } = configureFailureFlow({
          rpcData: 1.5
        });

        const response =
          await GET(
            createAuthorizedRequest()
          );

        const body =
          await response.json();

        expect(response.status).toBe(500);

        expect(body).toEqual({
          success: false,

          error:
            'The producer earnings release result is invalid.',

          requestId:
            REQUEST_ID
        });

        expect(historyInsert)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'failed',

              summary: {},

              error_message:
                'The producer earnings release result is invalid.'
            })
          );

        expect(
          mocks.logInfo
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'preserves the original release error when failed-run history persistence also fails',
      async () => {
        const rpcError = {
          message:
            'Database RPC failed.'
        };

        const historyError = {
          message:
            'History insert failed.'
        };

        const {
          historyInsert
        } = configureFailureFlow({
          rpcError,
          historyError
        });

        const response =
          await GET(
            createAuthorizedRequest()
          );

        const body =
          await response.json();

        expect(response.status).toBe(500);

        expect(body).toEqual({
          success: false,

          error:
            'Matured producer earnings could not be released.',

          requestId:
            REQUEST_ID
        });

        expect(historyInsert)
          .toHaveBeenCalledTimes(1);

        expect(
          mocks.logError
        ).toHaveBeenCalledTimes(2);

        expect(
          mocks.logError
        ).toHaveBeenNthCalledWith(
          1,
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
              'failed'
          }
        );

        expect(
          mocks.logError
        ).toHaveBeenNthCalledWith(
          2,
          'earnings_release_failed',
          expect.objectContaining({
            message:
              'Matured producer earnings could not be released.'
          }),
          {
            requestId:
              REQUEST_ID,

            method: 'GET',

            completedAt:
              FIXED_TIME,

            durationMs: 0,

            historyRecorded:
              false
          }
        );

        expect(
          mocks.logInfo
        ).not.toHaveBeenCalled();

        expect(
          mocks.logWarning
        ).not.toHaveBeenCalled();
      }
    );
  }
);