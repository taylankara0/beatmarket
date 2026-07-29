import {
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

function createRequest({
  authorization
} = {}) {
  const headers = new Headers();

  if (authorization) {
    headers.set(
      'authorization',
      authorization
    );
  }

  return new Request(
    'http://localhost:3000/api/internal/release-earnings',
    {
      method: 'GET',
      headers
    }
  );
}

describe(
  'GET /api/internal/release-earnings access control',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

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

    it(
      'rejects a request without a bearer token',
      async () => {
        const request =
          createRequest();

        const response =
          await GET(request);

        const body =
          await response.json();

        expect(response.status).toBe(401);

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
            'Unauthorized earnings release request.',

          requestId:
            REQUEST_ID
        });

        expect(
          mocks.createRequestId
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.createRequestId
        ).toHaveBeenCalledWith(
          request
        );

        expect(
          mocks.logWarning
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.logWarning
        ).toHaveBeenCalledWith(
          'earnings_release_unauthorized',
          {
            requestId:
              REQUEST_ID,

            method: 'GET'
          }
        );

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.logInfo
        ).not.toHaveBeenCalled();

        expect(
          mocks.logError
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a request with an incorrect bearer token',
      async () => {
        const request =
          createRequest({
            authorization:
              'Bearer incorrect-secret'
          });

        const response =
          await GET(request);

        const body =
          await response.json();

        expect(response.status).toBe(401);

        expect(body).toEqual({
          success: false,

          error:
            'Unauthorized earnings release request.',

          requestId:
            REQUEST_ID
        });

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

        expect(
          mocks.logWarning
        ).toHaveBeenCalledWith(
          'earnings_release_unauthorized',
          {
            requestId:
              REQUEST_ID,

            method: 'GET'
          }
        );

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.logInfo
        ).not.toHaveBeenCalled();

        expect(
          mocks.logError
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'returns a server error when CRON_SECRET is missing',
      async () => {
        delete process.env.CRON_SECRET;

        const request =
          createRequest({
            authorization:
              'Bearer any-secret'
          });

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
            'CRON_SECRET is missing.',

          requestId:
            REQUEST_ID
        });

        expect(
          mocks.logWarning
        ).not.toHaveBeenCalled();

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.logInfo
        ).not.toHaveBeenCalled();

        expect(
          mocks.logError
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.logError
        ).toHaveBeenCalledWith(
          'earnings_release_failed',
          expect.any(Error),
          {
            requestId:
              REQUEST_ID,

            method: 'GET',

            completedAt:
              expect.any(String),

            durationMs:
              expect.any(Number),

            historyRecorded:
              false
          }
        );
      }
    );
  }
);