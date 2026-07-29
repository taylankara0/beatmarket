import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  GetObjectCommand:
    vi.fn(),

  getSignedUrl:
    vi.fn(),

  createSupabaseAdminClient:
    vi.fn(),

  createServerClient:
    vi.fn(),

  cookies:
    vi.fn(),

  consumeApiRateLimit:
    vi.fn(),

  r2Client: {
    name: 'mock-r2-client'
  }
}));

vi.mock(
  '@aws-sdk/client-s3',
  () => ({
    GetObjectCommand:
      mocks.GetObjectCommand
  })
);

vi.mock(
  '@aws-sdk/s3-request-presigner',
  () => ({
    getSignedUrl:
      mocks.getSignedUrl
  })
);

vi.mock(
  '@supabase/supabase-js',
  () => ({
    createClient:
      mocks.createSupabaseAdminClient
  })
);

vi.mock(
  '@supabase/ssr',
  () => ({
    createServerClient:
      mocks.createServerClient
  })
);

vi.mock(
  'next/headers',
  () => ({
    cookies:
      mocks.cookies
  })
);

vi.mock(
  '@/lib/apiRateLimit',
  () => ({
    consumeApiRateLimit:
      mocks.consumeApiRateLimit
  })
);

vi.mock(
  '@/lib/r2',
  () => ({
    r2Client:
      mocks.r2Client
  })
);

import { GET } from './route';

const VALID_ORDER_ITEM_ID =
  '11111111-1111-4111-8111-111111111111';

function createRequest() {
  return new Request(
    `http://localhost:3000/api/download/${VALID_ORDER_ITEM_ID}`,
    {
      method: 'GET'
    }
  );
}

function createContext(
  orderItemId =
    VALID_ORDER_ITEM_ID
) {
  return {
    params: Promise.resolve({
      orderItemId
    })
  };
}

describe(
  'GET /api/download/[orderItemId] access control',
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

        set: vi.fn()
      });

      mocks.consumeApiRateLimit
        .mockResolvedValue({
          allowed: true,
          retryAfterSeconds: 0
        });
    });

    it(
      'rejects an invalid order item ID before authentication',
      async () => {
        const response = await GET(
          createRequest(),
          createContext(
            'not-a-valid-uuid'
          )
        );

        const body =
          await response.json();

        expect(response.status).toBe(400);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'A valid order item ID is required.'
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
          mocks.GetObjectCommand
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
              user: null
            },

            error: {
              message:
                'No active session.'
            }
          });

        const supabaseAuth = {
          auth: {
            getUser
          }
        };

        mocks.createServerClient
          .mockReturnValue(
            supabaseAuth
          );

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(401);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'You must be signed in to download this purchase.'
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
          mocks.GetObjectCommand
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rate-limits repeated download requests before loading purchase data',
      async () => {
        const user = {
          id: 'buyer-user-1'
        };

        const getUser = vi
          .fn()
          .mockResolvedValue({
            data: {
              user
            },

            error: null
          });

        const supabaseAuth = {
          auth: {
            getUser
          }
        };

        const supabaseAdmin = {
          from: vi.fn()
        };

        mocks.createServerClient
          .mockReturnValue(
            supabaseAuth
          );

        mocks.createSupabaseAdminClient
          .mockReturnValue(
            supabaseAdmin
          );

        mocks.consumeApiRateLimit
          .mockResolvedValue({
            allowed: false,
            retryAfterSeconds: 23
          });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(429);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(
          response.headers.get(
            'retry-after'
          )
        ).toBe('23');

        expect(body).toEqual({
          success: false,

          error:
            'Too many download requests. Please wait before trying again.'
        });

        expect(
          mocks.consumeApiRateLimit
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.consumeApiRateLimit
        ).toHaveBeenCalledWith({
          supabaseAdmin,

          rateKey:
            'download:user:buyer-user-1',

          maxRequests: 20,

          windowSeconds: 60
        });

        expect(
          supabaseAdmin.from
        ).not.toHaveBeenCalled();

        expect(
          mocks.GetObjectCommand
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );
  }
);