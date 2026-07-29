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

const REFUND_ITEM_ID =
  '33333333-3333-4333-8333-333333333333';

const ORDER_ITEM_ID =
  '44444444-4444-4444-8444-444444444444';

const CONVERSATION_ID =
  `refund_${VALID_REFUND_ID}_${REFUND_ITEM_ID}`;

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

function createRefundItem(
  overrides = {}
) {
  return {
    id: REFUND_ITEM_ID,

    order_refund_id:
      VALID_REFUND_ID,

    order_item_id:
      ORDER_ITEM_ID,

    provider_item_id:
      'provider-item-1',

    payment_transaction_id:
      'payment-transaction-1',

    amount: '250.00',

    currency: 'TRY',

    status: 'pending',

    ...overrides
  };
}

function configureProcessingFlow({
  refund = createRefund(),
  refundItems = [
    createRefundItem()
  ],
  rpcImplementation
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

  const refundMaybeSingle = vi
    .fn()
    .mockResolvedValue({
      data: refund,
      error: null
    });

  const refundEq = vi
    .fn()
    .mockReturnValue({
      maybeSingle:
        refundMaybeSingle
    });

  const refundSelect = vi
    .fn()
    .mockReturnValue({
      eq: refundEq
    });

  const secondItemOrder = vi
    .fn()
    .mockResolvedValue({
      data: refundItems,
      error: null
    });

  const firstItemOrder = vi
    .fn()
    .mockReturnValue({
      order:
        secondItemOrder
    });

  const refundItemsEq = vi
    .fn()
    .mockReturnValue({
      order:
        firstItemOrder
    });

  const refundItemsSelect = vi
    .fn()
    .mockReturnValue({
      eq: refundItemsEq
    });

  const from = vi.fn(
    (tableName) => {
      if (
        tableName ===
        'order_refunds'
      ) {
        return {
          select:
            refundSelect
        };
      }

      if (
        tableName ===
        'order_refund_items'
      ) {
        return {
          select:
            refundItemsSelect
        };
      }

      throw new Error(
        `Unexpected table access: ${tableName}`
      );
    }
  );

  const adminRpc = vi.fn(
    rpcImplementation
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
    supabaseAdmin,
    adminRpc,
    from,
    refundMaybeSingle,
    refundEq,
    refundSelect,
    refundItemsSelect,
    refundItemsEq,
    firstItemOrder,
    secondItemOrder
  };
}

describe(
  'POST /api/admin/refunds/[refundId]/process provider handling',
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
      'marks an invalid refund-item amount for manual review without calling Iyzico',
      async () => {
        const refundItem =
          createRefundItem({
            amount: '0.00'
          });

        const reason =
          'The refund item amount is invalid.';

        const {
          adminRpc
        } = configureProcessingFlow({
          refundItems: [
            refundItem
          ],

          rpcImplementation:
            async (
              functionName
            ) => {
              if (
                functionName ===
                'start_order_refund'
              ) {
                return {
                  data: 1,
                  error: null
                };
              }

              if (
                functionName ===
                'mark_order_refund_item_manual_review'
              ) {
                return {
                  data: null,
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

        expect(response.status).toBe(409);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error: reason,

          refundId:
            VALID_REFUND_ID,

          refundItemId:
            REFUND_ITEM_ID,

          status:
            'manual_review'
        });

        expect(adminRpc)
          .toHaveBeenCalledTimes(2);

        expect(adminRpc)
          .toHaveBeenNthCalledWith(
            1,
            'start_order_refund',
            {
              target_order_refund_id:
                VALID_REFUND_ID
            }
          );

        expect(adminRpc)
          .toHaveBeenNthCalledWith(
            2,
            'mark_order_refund_item_manual_review',
            {
              target_order_refund_item_id:
                REFUND_ITEM_ID,

              provider_response_value: {
                validationError:
                  reason
              },

              failure_reason_value:
                reason
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
      'marks the item for manual review when the Iyzico request has an uncertain transport result',
      async () => {
        const reason =
          'The Iyzico refund request had an uncertain transport result. Verify the transaction manually before retrying.';

        const {
          adminRpc
        } = configureProcessingFlow({
          rpcImplementation:
            async (
              functionName
            ) => {
              if (
                functionName ===
                'start_order_refund'
              ) {
                return {
                  data: 1,
                  error: null
                };
              }

              if (
                functionName ===
                'mark_order_refund_item_manual_review'
              ) {
                return {
                  data: null,
                  error: null
                };
              }

              throw new Error(
                `Unexpected RPC call: ${functionName}`
              );
            }
        });

        mocks.refundCreate
          .mockImplementation(
            (
              requestData,
              callback
            ) => {
              callback(
                new Error(
                  'Network timeout.'
                ),
                null
              );
            }
          );

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(502);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error: reason,

          refundId:
            VALID_REFUND_ID,

          refundItemId:
            REFUND_ITEM_ID,

          status:
            'manual_review'
        });

        expect(
          mocks.refundCreate
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.refundCreate
        ).toHaveBeenCalledWith(
          {
            locale: 'tr',

            conversationId:
              CONVERSATION_ID,

            paymentTransactionId:
              'payment-transaction-1',

            price: '250.00',

            currency: 'TRY',

            ip: '203.0.113.10',

            reason: 'other',

            description:
              'Customer refund request.'
          },

          expect.any(Function)
        );

        expect(adminRpc)
          .toHaveBeenCalledTimes(2);

        expect(adminRpc)
          .toHaveBeenNthCalledWith(
            2,
            'mark_order_refund_item_manual_review',
            {
              target_order_refund_item_id:
                REFUND_ITEM_ID,

              provider_response_value: {
                request: {
                  conversationId:
                    CONVERSATION_ID,

                  paymentTransactionId:
                    'payment-transaction-1',

                  price:
                    '250.00',

                  currency:
                    'TRY'
                },

                transportError: {
                  name: 'Error',

                  message:
                    'Network timeout.'
                }
              },

              failure_reason_value:
                reason
            }
          );

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'records a known Iyzico rejection as a failed refund item',
      async () => {
        const refundResult = {
          status: 'failure',

          errorCode:
            'REFUND_REJECTED',

          errorMessage:
            'The refund was rejected.'
        };

        const {
          adminRpc
        } = configureProcessingFlow({
          rpcImplementation:
            async (
              functionName
            ) => {
              if (
                functionName ===
                'start_order_refund'
              ) {
                return {
                  data: 1,
                  error: null
                };
              }

              if (
                functionName ===
                'record_order_refund_item_result'
              ) {
                return {
                  data: 'failed',
                  error: null
                };
              }

              throw new Error(
                `Unexpected RPC call: ${functionName}`
              );
            }
        });

        mocks.refundCreate
          .mockImplementation(
            (
              requestData,
              callback
            ) => {
              callback(
                null,
                refundResult
              );
            }
          );

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(502);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'The refund was rejected.',

          refundId:
            VALID_REFUND_ID,

          refundItemId:
            REFUND_ITEM_ID,

          status: 'failed',

          providerErrorCode:
            'REFUND_REJECTED'
        });

        expect(adminRpc)
          .toHaveBeenCalledTimes(2);

        expect(adminRpc)
          .toHaveBeenNthCalledWith(
            2,
            'record_order_refund_item_result',
            {
              target_order_refund_item_id:
                REFUND_ITEM_ID,

              succeeded: false,

              provider_response_value:
                refundResult,

              failure_reason_value:
                'The refund was rejected.'
            }
          );

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'requires manual review when an Iyzico success response does not match the requested transaction',
      async () => {
        const refundResult = {
          status: 'success',

          conversationId:
            'different-conversation-id',

          paymentTransactionId:
            'payment-transaction-1',

          price: '250.00',

          currency: 'TRY'
        };

        const verificationError =
          'The refund conversation ID does not match.';

        const {
          adminRpc
        } = configureProcessingFlow({
          rpcImplementation:
            async (
              functionName
            ) => {
              if (
                functionName ===
                'start_order_refund'
              ) {
                return {
                  data: 1,
                  error: null
                };
              }

              if (
                functionName ===
                'mark_order_refund_item_manual_review'
              ) {
                return {
                  data: null,
                  error: null
                };
              }

              throw new Error(
                `Unexpected RPC call: ${functionName}`
              );
            }
        });

        mocks.refundCreate
          .mockImplementation(
            (
              requestData,
              callback
            ) => {
              callback(
                null,
                refundResult
              );
            }
          );

        const response = await POST(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(502);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'Iyzico reported success, but the refund response did not match the requested transaction. Manual review is required.',

          details: [
            verificationError
          ],

          refundId:
            VALID_REFUND_ID,

          refundItemId:
            REFUND_ITEM_ID,

          status:
            'manual_review'
        });

        expect(adminRpc)
          .toHaveBeenCalledTimes(2);

        expect(adminRpc)
          .toHaveBeenNthCalledWith(
            2,
            'mark_order_refund_item_manual_review',
            {
              target_order_refund_item_id:
                REFUND_ITEM_ID,

              provider_response_value:
                refundResult,

              failure_reason_value:
                verificationError
            }
          );

        expect(
          mocks.sendRefundConfirmationEmail
        ).not.toHaveBeenCalled();
      }
    );
  }
);