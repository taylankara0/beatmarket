import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createServerClient: vi.fn(),
  cookies: vi.fn(),
  consumeApiRateLimit: vi.fn(),
  revalidatePath: vi.fn(),
  getUser: vi.fn(),
  profileFrom: vi.fn(),
  profileSelect: vi.fn(),
  profileEq: vi.fn(),
  profileMaybeSingle: vi.fn(),
  r2Send: vi.fn(),
}));

vi.mock(
  '@aws-sdk/client-s3',
  () => ({
    HeadObjectCommand:
      class HeadObjectCommandMock {
        constructor(input) {
          this.input = input;
        }
      },
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
    cookies: mocks.cookies,
  })
);

vi.mock(
  'next/cache',
  () => ({
    revalidatePath:
      mocks.revalidatePath,
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
  '@/lib/r2',
  () => ({
    r2Client: {
      send: mocks.r2Send,
    },
  })
);

import { POST } from './route';

const VALID_USER_ID =
  '22222222-2222-4222-8222-222222222222';

function createRequest() {
  return new Request(
    'http://localhost:3000/api/beats/publish-free',
    {
      method: 'POST',

      headers: {
        'content-type':
          'application/json',
      },

      body: JSON.stringify({
        title: 'Test Free Beat',
        bpm: 120,

        previewKey:
          `masters/${VALID_USER_ID}/2026/11/preview/test.mp3`,

        masterKey:
          `masters/${VALID_USER_ID}/2026/11/master/test.wav`,
      }),
    }
  );
}

async function sendRequest() {
  const response = await POST(
    createRequest()
  );

  const body = await response.json();

  expect(
    response.headers.get(
      'cache-control'
    )
  ).toBe('no-store');

  return {
    response,
    body,
  };
}

describe(
  'POST /api/beats/publish-free access control',
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

      mocks.cookies.mockResolvedValue({
        getAll: vi
          .fn()
          .mockReturnValue([]),

        set: vi.fn(),
      });

      mocks.getUser.mockResolvedValue({
        data: {
          user: {
            id: VALID_USER_ID,
          },
        },

        error: null,
      });

      mocks.profileMaybeSingle
        .mockResolvedValue({
          data: {
            is_producer: true,
            username: 'testproducer',
          },

          error: null,
        });

      mocks.profileEq.mockReturnValue({
        maybeSingle:
          mocks.profileMaybeSingle,
      });

      mocks.profileSelect.mockReturnValue({
        eq: mocks.profileEq,
      });

      mocks.profileFrom.mockImplementation(
        (table) => {
          if (table === 'profiles') {
            return {
              select:
                mocks.profileSelect,
            };
          }

          throw new Error(
            `Unexpected table: ${table}`
          );
        }
      );

      mocks.createServerClient
        .mockReturnValue({
          auth: {
            getUser: mocks.getUser,
          },

          from: mocks.profileFrom,
        });

      mocks.createSupabaseAdminClient
        .mockReturnValue({
          from: vi.fn(),
        });

      mocks.consumeApiRateLimit
        .mockResolvedValue({
          allowed: true,
          retryAfterSeconds: 0,
        });
    });

    it(
      'requires an authenticated user',
      async () => {
        mocks.getUser.mockResolvedValue({
          data: {
            user: null,
          },

          error: {
            message:
              'No active session.',
          },
        });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(401);

        expect(body).toEqual({
          success: false,

          error:
            'You must be signed in before publishing a beat.',
        });

        expect(
          mocks.profileFrom
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
      }
    );

    it(
      'rejects accounts without producer permissions',
      async () => {
        mocks.profileMaybeSingle
          .mockResolvedValue({
            data: {
              is_producer: false,
              username: 'testuser',
            },

            error: null,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'Only creator accounts can publish beats.',
        });

        expect(
          mocks.profileEq
        ).toHaveBeenCalledWith(
          'id',
          VALID_USER_ID
        );

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'returns an error when producer permissions cannot be verified',
      async () => {
        mocks.profileMaybeSingle
          .mockResolvedValue({
            data: null,

            error: {
              message:
                'Database lookup failed.',
            },
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(500);

        expect(body).toEqual({
          success: false,

          error:
            'Your creator permissions could not be verified.',
        });

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rate-limits repeated publishing requests',
      async () => {
        const supabaseAdmin = {
          from: vi.fn(),
        };

        mocks.createSupabaseAdminClient
          .mockReturnValue(
            supabaseAdmin
          );

        mocks.consumeApiRateLimit
          .mockResolvedValue({
            allowed: false,
            retryAfterSeconds: 37,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(429);

        expect(
          response.headers.get(
            'retry-after'
          )
        ).toBe('37');

        expect(body).toEqual({
          success: false,

          error:
            'Too many beat publishing requests. Please wait before trying again.',
        });

        expect(
          mocks.consumeApiRateLimit
        ).toHaveBeenCalledWith({
          supabaseAdmin,

          rateKey:
            `publish-free:user:${VALID_USER_ID}`,

          maxRequests: 10,

          windowSeconds: 60,
        });

        expect(
          supabaseAdmin.from
        ).not.toHaveBeenCalled();

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expect(
          mocks.revalidatePath
        ).not.toHaveBeenCalled();
      }
    );
  }
);