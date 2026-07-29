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

const ORDER_ID =
  '22222222-2222-4222-8222-222222222222';

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

    order_id: ORDER_ID,

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
  refundResults,
  adminRpcImplementation,
  includeUpdate = false
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

  const maybeSingle = vi.fn();

  refundResults.forEach(
    (result) => {
      maybeSingle.mockResolvedValueOnce(
        result
      );
    }
  );

  const selectEq = vi
    .fn()
    .mockReturnValue({
      maybeSingle
    });

  const select = vi
    .fn()
    .mockReturnValue({
      eq: selectEq
    });

  const updateNeq = vi
    .fn()
    .mockResolvedValue({
      error: null
    });

  const updateEq = vi
    .fn()
    .mockReturnValue({
      neq: updateNeq
    });

  const update = vi
    .fn()
    .mockReturnValue({
      eq: updateEq
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

      if (includeUpdate) {
        return {
          select,
          update
        };
      }

      return {
        select
      };
    }
  );

  const adminRpc = vi.fn(
    adminRpcImplementation
  );

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
    selectEq,
    select,
    update,
    updateEq,
    updateNeq,
    from,
    adminRpc
  };
}

describe(
  'POST /api/admin/refunds/[refundId]/process start handling',
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
      'returns a conflict response when the refund cannot be started',
      async () => {
        const refund = createRefund();

        const startError = {
          message:
            'The refund cannot be started from its current state.'
        };

        const {
          adminRpc
        } = configureAuthorizedAdmin({
          refundResults: [
            {
              data: refund,
              error: null
            }
          ],

          adminRpcImplementation:
            async (
              functionName,
              parameters
            ) => {
              if (
                functionName ===
                'start_order_refund'
              ) {
                return {
                  data: null,
                  error: startError
                };
              }

              throw new Error(
                `Unexpected RPC call: ${functionName}`
              );
            }
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
            'The refund cannot be started from its current state.'
        });

        expect(adminRpc)
          .toHaveBeenCalledTimes(1);

        expect(adminRpc)
          .toHaveBeenCalledWith(
            'start_order_refund',
            {
              target_order_refund_id:
                VALID_REFUND_ID
            }
          );

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'returns the completed refund when starting finds no pending items because it was already refunded',
      async () => {
        const initialRefund =
          createRefund();

        const completedRefund =
          createRefund({
            status: 'refunded',

            refunded_amount:
              '250.00'
          });

        const {
          supabaseAdmin,
          adminRpc,
          maybeSingle
        } = configureAuthorizedAdmin({
          refundResults: [
            {
              data: initialRefund,
              error: null
            },

            {
              data: completedRefund,
              error: null
            }
          ],

          adminRpcImplementation:
            async (
              functionName,
              parameters
            ) => {
              if (
                functionName ===
                'start_order_refund'
              ) {
                return {
                  data: 0,
                  error: null
                };
              }

              throw new Error(
                `Unexpected RPC call: ${functionName}`
              );
            }
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
            ORDER_ID,

          status: 'refunded',

          refundedAmount:
            '250.00',

          currency: 'TRY'
        });

        expect(maybeSingle)
          .toHaveBeenCalledTimes(2);

        expect(adminRpc)
          .toHaveBeenCalledTimes(1);

        expect(adminRpc)
          .toHaveBeenCalledWith(
            'start_order_refund',
            {
              target_order_refund_id:
                VALID_REFUND_ID
            }
          );

        expect(
          mocks.sendRefundConfirmationEmail
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.sendRefundConfirmationEmail
        ).toHaveBeenCalledWith({
          supabase:
            supabaseAdmin,

          refund:
            completedRefund,

          baseUrl:
            'http://localhost:3000/'
        });

        expect(
          mocks.refundCreate
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'marks the refund for manual review when starting returns zero pending items in an inconsistent state',
      async () => {
        const initialRefund =
          createRefund();

        const inconsistentRefund =
          createRefund({
            status: 'processing'
          });

        const {
          adminRpc,
          update,
          updateEq,
          updateNeq
        } = configureAuthorizedAdmin({
          refundResults: [
            {
              data: initialRefund,
              error: null
            },

            {
              data:
                inconsistentRefund,
              error: null
            }
          ],

          adminRpcImplementation:
            async (
              functionName,
              parameters
            ) => {
              if (
                functionName ===
                'start_order_refund'
              ) {
                return {
                  data: 0,
                  error: null
                };
              }

              throw new Error(
                `Unexpected RPC call: ${functionName}`
              );
            },

          includeUpdate: true
        });

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(500);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'The refund could not be processed safely.'
        });

        expect(adminRpc)
          .toHaveBeenCalledTimes(1);

        expect(adminRpc)
          .toHaveBeenCalledWith(
            'start_order_refund',
            {
              target_order_refund_id:
                VALID_REFUND_ID
            }
          );

        expect(update)
          .toHaveBeenCalledTimes(1);

        expect(update)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'manual_review',

              failed_at:
                expect.any(String),

              last_error:
                'The refund has no pending items to process.',

              updated_at:
                expect.any(String)
            })
          );

        expect(updateEq)
          .toHaveBeenCalledWith(
            'id',
            VALID_REFUND_ID
          );

        expect(updateNeq)
          .toHaveBeenCalledWith(
            'status',
            'refunded'
          );

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