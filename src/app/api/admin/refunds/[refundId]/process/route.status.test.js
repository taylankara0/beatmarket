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

function createContext() {
  return {
    params: Promise.resolve({
      refundId: VALID_REFUND_ID
    })
  };
}

function createRefund(overrides = {}) {
  return {
    id: VALID_REFUND_ID,

    order_id:
      '22222222-2222-4222-8222-222222222222',

    provider: 'iyzico',

    requested_amount: '250.00',

    refunded_amount: '0.00',

    currency: 'TRY',

    status: 'requested',

    refund_reason:
      'Customer refund request.',

    restore_exclusive_beats: false,

    provider_payment_id_snapshot:
      'payment-1',

    provider_conversation_id_snapshot:
      'conversation-1',

    ...overrides
  };
}

function configureAuthorizedAdmin({
  refund,
  refundError = null
}) {
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

  const maybeSingle = vi
    .fn()
    .mockResolvedValue({
      data: refund,
      error: refundError
    });

  const eq = vi
    .fn()
    .mockReturnValue({
      maybeSingle
    });

  const select = vi
    .fn()
    .mockReturnValue({
      eq
    });

  const from = vi.fn(
    (tableName) => {
      if (
        tableName !==
        'order_refunds'
      ) {
        throw new Error(
          `Unexpected table access: ${tableName}`
        );
      }

      return {
        select
      };
    }
  );

  const adminRpc = vi.fn();

  const supabaseAdmin = {
    from,
    rpc: adminRpc
  };

  mocks.createServerClient
    .mockReturnValue(
      supabaseAuth
    );

  mocks.createSupabaseAdminClient
    .mockReturnValue(
      supabaseAdmin
    );

  return {
    user,
    getUser,
    authRpc,
    supabaseAdmin,
    maybeSingle,
    eq,
    select,
    from,
    adminRpc
  };
}

describe(
  'POST /api/admin/refunds/[refundId]/process refund status handling',
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
      'returns 404 when the refund does not exist',
      async () => {
        const {
          supabaseAdmin,
          eq,
          adminRpc
        } = configureAuthorizedAdmin({
          refund: null
        });

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(404);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,
          error:
            'The refund was not found.'
        });

        expect(eq)
          .toHaveBeenCalledWith(
            'id',
            VALID_REFUND_ID
          );

        expect(
          mocks.consumeApiRateLimit
        ).toHaveBeenCalledWith({
          supabaseAdmin,

          rateKey:
            'admin-refund-process:user:platform-admin-1',

          maxRequests: 5,

          windowSeconds: 60
        });

        expect(adminRpc)
          .not.toHaveBeenCalled();

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a refund that does not use Iyzico',
      async () => {
        const refund = createRefund({
          provider: 'manual'
        });

        const {
          adminRpc
        } = configureAuthorizedAdmin({
          refund
        });

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(409);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,
          error:
            'This refund does not use the Iyzico provider.'
        });

        expect(adminRpc)
          .not.toHaveBeenCalled();

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'returns the existing result for an already-refunded refund',
      async () => {
        const refund = createRefund({
          status: 'refunded',

          refunded_amount: '250.00'
        });

        const {
          supabaseAdmin,
          adminRpc
        } = configureAuthorizedAdmin({
          refund
        });

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(200);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: true,

          alreadyRefunded: true,

          refundId:
            VALID_REFUND_ID,

          orderId:
            '22222222-2222-4222-8222-222222222222',

          status: 'refunded',

          refundedAmount:
            '250.00',

          currency: 'TRY'
        });

        expect(
          mocks.sendRefundConfirmationEmail
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.sendRefundConfirmationEmail
        ).toHaveBeenCalledWith({
          supabase: supabaseAdmin,

          refund,

          baseUrl:
            'http://localhost:3000/'
        });

        expect(adminRpc)
          .not.toHaveBeenCalled();

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a refund that is already being processed',
      async () => {
        const refund = createRefund({
          status: 'processing'
        });

        const {
          adminRpc
        } = configureAuthorizedAdmin({
          refund
        });

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(409);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'This refund is already being processed.',

          refundId:
            VALID_REFUND_ID,

          status: 'processing'
        });

        expect(adminRpc)
          .not.toHaveBeenCalled();

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a refund that requires manual review',
      async () => {
        const refund = createRefund({
          status: 'manual_review'
        });

        const {
          adminRpc
        } = configureAuthorizedAdmin({
          refund
        });

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(409);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'This refund requires manual review.',

          refundId:
            VALID_REFUND_ID,

          status: 'manual_review'
        });

        expect(adminRpc)
          .not.toHaveBeenCalled();

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