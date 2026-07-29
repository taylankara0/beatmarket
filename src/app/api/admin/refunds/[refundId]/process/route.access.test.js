import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  refundCreate: vi.fn(),

  createSupabaseAdminClient:
    vi.fn(),

  createServerClient:
    vi.fn(),

  cookies:
    vi.fn(),

  consumeApiRateLimit:
    vi.fn(),

  sendRefundConfirmationEmail:
    vi.fn()
}));

vi.mock('postman-request', () => ({}));

vi.mock('iyzipay', () => {
  class IyzipayMock {
    static LOCALE = {
      TR: 'tr'
    };

    static CURRENCY = {
      TRY: 'TRY'
    };

    static REFUND_REASON = {
      OTHER: 'other'
    };

    constructor() {
      this.refund = {
        create: mocks.refundCreate
      };
    }
  }

  return {
    default: IyzipayMock
  };
});

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
    cookies: mocks.cookies
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
  '@/lib/refundConfirmationEmail',
  () => ({
    sendRefundConfirmationEmail:
      mocks.sendRefundConfirmationEmail
  })
);

import { POST } from './route';

const VALID_REFUND_ID =
  '11111111-1111-4111-8111-111111111111';

function createRequest() {
  return new Request(
    `http://localhost:3000/api/admin/refunds/${VALID_REFUND_ID}/process`,
    {
      method: 'POST',
      headers: {
        'content-type':
          'application/json',

        'x-forwarded-for':
          '203.0.113.10'
      }
    }
  );
}

function createContext(refundId) {
  return {
    params: Promise.resolve({
      refundId
    })
  };
}

describe(
  'POST /api/admin/refunds/[refundId]/process access control',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

      process.env.NEXT_PUBLIC_SUPABASE_URL =
        'https://test.supabase.co';

      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
        'test-anon-key';

      process.env.SUPABASE_SERVICE_ROLE_KEY =
        'test-service-role-key';

      process.env.NEXT_PUBLIC_SITE_URL =
        'http://localhost:3000';

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

      mocks.sendRefundConfirmationEmail
        .mockResolvedValue(undefined);
    });

    it(
      'rejects an invalid refund ID before authentication',
      async () => {
        const response = await POST(
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
            'A valid refund ID is required.'
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
          mocks.refundCreate
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendRefundConfirmationEmail
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

        const authRpc = vi.fn();

        const supabaseAuth = {
          auth: {
            getUser
          },

          rpc: authRpc
        };

        mocks.createServerClient
          .mockReturnValue(
            supabaseAuth
          );

        const response = await POST(
          createRequest(),
          createContext(
            VALID_REFUND_ID
          )
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
            'Authentication is required.'
        });

        expect(getUser)
          .toHaveBeenCalledTimes(1);

        expect(authRpc)
          .not.toHaveBeenCalled();

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.consumeApiRateLimit
        ).not.toHaveBeenCalled();

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'requires platform administrator access',
      async () => {
        const user = {
          id:
            'authenticated-non-admin'
        };

        const getUser = vi
          .fn()
          .mockResolvedValue({
            data: {
              user
            },

            error: null
          });

        const authRpc = vi
          .fn()
          .mockResolvedValue({
            data: false,
            error: null
          });

        const supabaseAuth = {
          auth: {
            getUser
          },

          rpc: authRpc
        };

        mocks.createServerClient
          .mockReturnValue(
            supabaseAuth
          );

        const response = await POST(
          createRequest(),
          createContext(
            VALID_REFUND_ID
          )
        );

        const body =
          await response.json();

        expect(response.status).toBe(403);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,
          error:
            'Administrator access is required.'
        });

        expect(authRpc)
          .toHaveBeenCalledTimes(1);

        expect(authRpc)
          .toHaveBeenCalledWith(
            'is_platform_admin'
          );

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.consumeApiRateLimit
        ).not.toHaveBeenCalled();

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rate-limits repeated refund-processing requests',
      async () => {
        const user = {
          id: 'platform-admin-1'
        };

        const getUser = vi
          .fn()
          .mockResolvedValue({
            data: {
              user
            },

            error: null
          });

        const authRpc = vi
          .fn()
          .mockResolvedValue({
            data: true,
            error: null
          });

        const supabaseAuth = {
          auth: {
            getUser
          },

          rpc: authRpc
        };

        const supabaseAdmin = {
          from: vi.fn(),
          rpc: vi.fn()
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
            retryAfterSeconds: 37
          });

        const response = await POST(
          createRequest(),
          createContext(
            VALID_REFUND_ID
          )
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
        ).toBe('37');

        expect(body).toEqual({
          success: false,
          error:
            'Too many refund-processing requests. Please wait before trying again.'
        });

        expect(
          mocks.consumeApiRateLimit
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.consumeApiRateLimit
        ).toHaveBeenCalledWith({
          supabaseAdmin,

          rateKey:
            'admin-refund-process:user:platform-admin-1',

          maxRequests: 5,

          windowSeconds: 60
        });

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );
  }
);