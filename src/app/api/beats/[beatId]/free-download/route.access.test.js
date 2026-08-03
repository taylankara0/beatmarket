import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient:
    vi.fn(),

  createServerClient:
    vi.fn(),

  cookies:
    vi.fn(),

  consumeApiRateLimit:
    vi.fn(),

  r2Send:
    vi.fn(),

  getSignedUrl:
    vi.fn(),
}));

vi.mock(
  '@aws-sdk/client-s3',
  () => ({
    GetObjectCommand:
      class GetObjectCommandMock {
        constructor(input) {
          this.input = input;
        }
      },

    HeadObjectCommand:
      class HeadObjectCommandMock {
        constructor(input) {
          this.input = input;
        }
      },
  })
);

vi.mock(
  '@aws-sdk/s3-request-presigner',
  () => ({
    getSignedUrl:
      mocks.getSignedUrl,
  })
);

vi.mock(
  '@supabase/supabase-js',
  () => ({
    createClient:
      mocks.createSupabaseAdminClient,
  })
);

vi.mock(
  '@supabase/ssr',
  () => ({
    createServerClient:
      mocks.createServerClient,
  })
);

vi.mock(
  'next/headers',
  () => ({
    cookies:
      mocks.cookies,
  })
);

vi.mock(
  '@/lib/apiRateLimit',
  () => ({
    consumeApiRateLimit:
      mocks.consumeApiRateLimit,
  })
);

vi.mock(
  '@/lib/freeBeatLicense',
  () => ({
    FREE_BEAT_LICENSE_VERSION:
      'free-noncommercial-v1',

    isAcceptedFreeBeatLicenseVersion:
      (value) =>
        value ===
        'free-noncommercial-v1',
  })
);

vi.mock(
  '@/lib/r2',
  () => ({
    r2Client: {
      send:
        mocks.r2Send,
    },
  })
);

import { POST } from './route';

const VALID_BEAT_ID =
  '11111111-1111-4111-8111-111111111111';

function createRequest(
  body = {
    accepted: true,

    licenseVersion:
      'free-noncommercial-v1',
  }
) {
  return new Request(
    `http://localhost:3000/api/beats/${VALID_BEAT_ID}/free-download`,
    {
      method: 'POST',

      headers: {
        'content-type':
          'application/json',
      },

      body: JSON.stringify(
        body
      ),
    }
  );
}

function createContext(beatId) {
  return {
    params: Promise.resolve({
      beatId,
    }),
  };
}

describe(
  'POST /api/beats/[beatId]/free-download access control',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

      process.env.NEXT_PUBLIC_SUPABASE_URL =
        'https://test.supabase.co';

      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
        'test-anon-key';

      process.env.SUPABASE_SERVICE_ROLE_KEY =
        'test-service-role-key';

      process.env.R2_BUCKET_NAME =
        'test-private-bucket';

      mocks.cookies
        .mockResolvedValue({
          getAll: vi
            .fn()
            .mockReturnValue([]),

          set: vi.fn(),
        });

      mocks.consumeApiRateLimit
        .mockResolvedValue({
          allowed: true,

          retryAfterSeconds: 0,
        });
    });

    it(
      'rejects an invalid beat ID before authentication',
      async () => {
        const response =
          await POST(
            createRequest(),

            createContext(
              'not-a-valid-uuid'
            )
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(400);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'A valid beat ID is required.',
        });

        expect(
          mocks.cookies
        ).not.toHaveBeenCalled();

        expect(
          mocks.createServerClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.consumeApiRateLimit
        ).not.toHaveBeenCalled();

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'requires an authenticated user',
      async () => {
        const getUser = vi
          .fn()
          .mockResolvedValue({
            data: {
              user: null,
            },

            error: {
              message:
                'No active session.',
            },
          });

        mocks.createServerClient
          .mockReturnValue({
            auth: {
              getUser,
            },
          });

        const response =
          await POST(
            createRequest(),

            createContext(
              VALID_BEAT_ID
            )
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(401);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'You must be signed in to download this free beat.',
        });

        expect(getUser)
          .toHaveBeenCalledTimes(1);

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.consumeApiRateLimit
        ).not.toHaveBeenCalled();

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rate-limits repeated free-download requests',
      async () => {
        const user = {
          id:
            'authenticated-user-1',
        };

        const getUser = vi
          .fn()
          .mockResolvedValue({
            data: {
              user,
            },

            error: null,
          });

        const supabaseAdmin = {
          from: vi.fn(),

          rpc: vi.fn(),
        };

        mocks.createServerClient
          .mockReturnValue({
            auth: {
              getUser,
            },
          });

        mocks.createSupabaseAdminClient
          .mockReturnValue(
            supabaseAdmin
          );

        mocks.consumeApiRateLimit
          .mockResolvedValue({
            allowed: false,

            retryAfterSeconds: 29,
          });

        const response =
          await POST(
            createRequest(),

            createContext(
              VALID_BEAT_ID
            )
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(429);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(
          response.headers.get(
            'retry-after'
          )
        ).toBe('29');

        expect(body).toEqual({
          success: false,

          error:
            'Too many download requests. Please wait before trying again.',
        });

        expect(
          mocks.consumeApiRateLimit
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.consumeApiRateLimit
        ).toHaveBeenCalledWith({
          supabaseAdmin,

          rateKey:
            'free-download:user:authenticated-user-1',

          maxRequests: 20,

          windowSeconds: 60,
        });

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );
  }
);