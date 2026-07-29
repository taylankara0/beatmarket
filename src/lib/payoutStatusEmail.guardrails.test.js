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

  resendConstructor:
    vi.fn(),

  resendSend:
    vi.fn(),

  logError:
    vi.fn(),

  logInfo:
    vi.fn(),

  logWarning:
    vi.fn()
}));

vi.mock(
  'server-only',
  () => ({})
);

vi.mock(
  '@supabase/supabase-js',
  () => ({
    createClient:
      mocks.createSupabaseAdminClient
  })
);

vi.mock(
  'resend',
  () => {
    class ResendMock {
      constructor(apiKey) {
        mocks.resendConstructor(
          apiKey
        );

        this.emails = {
          send:
            mocks.resendSend
        };
      }
    }

    return {
      Resend:
        ResendMock
    };
  }
);

vi.mock(
  './serverLogger',
  () => ({
    logError:
      mocks.logError,

    logInfo:
      mocks.logInfo,

    logWarning:
      mocks.logWarning
  })
);

import {
  PAYOUT_EVENT,
  sendPayoutStatusEmail
} from './payoutStatusEmail';

const PAYOUT_REQUEST_ID =
  '11111111-1111-4111-8111-111111111111';

const PRODUCER_ID =
  '22222222-2222-4222-8222-222222222222';

function createPayoutRequest(
  overrides = {}
) {
  return {
    id:
      PAYOUT_REQUEST_ID,

    producer_id:
      PRODUCER_ID,

    requested_amount:
      '1250.00',

    currency:
      'TRY',

    status:
      'approved',

    approved_at:
      '2026-07-29T06:00:00.000Z',

    paid_at:
      null,

    rejected_at:
      null,

    rejection_reason:
      null,

    bank_transfer_reference:
      null,

    created_at:
      '2026-07-28T06:00:00.000Z',

    updated_at:
      '2026-07-29T06:00:00.000Z',

    ...overrides
  };
}

function createOneEqMaybeSingleQuery({
  data,
  error = null
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({
      data,
      error
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

  return {
    select,
    eq,
    maybeSingle
  };
}

function createTwoEqMaybeSingleQuery({
  data,
  error = null
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({
      data,
      error
    });

  const secondEq = vi
    .fn()
    .mockReturnValue({
      maybeSingle
    });

  const firstEq = vi
    .fn()
    .mockReturnValue({
      eq:
        secondEq
    });

  const select = vi
    .fn()
    .mockReturnValue({
      eq:
        firstEq
    });

  return {
    select,
    firstEq,
    secondEq,
    maybeSingle
  };
}

function configureGuardrailFlow({
  payoutRequest =
    createPayoutRequest(),

  existingDelivery =
    null,

  existingDeliveryError =
    null
} = {}) {
  const payoutQuery =
    createOneEqMaybeSingleQuery({
      data:
        payoutRequest
    });

  const deliveryQuery =
    createTwoEqMaybeSingleQuery({
      data:
        existingDelivery,

      error:
        existingDeliveryError
    });

  const from = vi.fn(
    (tableName) => {
      if (
        tableName ===
        'payout_requests'
      ) {
        return {
          select:
            payoutQuery.select
        };
      }

      if (
        tableName ===
        'payout_status_email_deliveries'
      ) {
        return {
          select:
            deliveryQuery.select
        };
      }

      throw new Error(
        `Unexpected table access: ${tableName}`
      );
    }
  );

  const getUserById = vi.fn();

  const supabase = {
    from,

    auth: {
      admin: {
        getUserById
      }
    }
  };

  mocks.createSupabaseAdminClient
    .mockReturnValue(
      supabase
    );

  return {
    supabase,
    from,
    getUserById,
    payoutQuery,
    deliveryQuery
  };
}

describe(
  'sendPayoutStatusEmail guardrails',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

      process.env.NEXT_PUBLIC_SUPABASE_URL =
        'https://test.supabase.co';

      process.env.SUPABASE_SERVICE_ROLE_KEY =
        'test-service-role-key';

      process.env.RESEND_API_KEY =
        'test-resend-key';

      process.env.RESEND_FROM_EMAIL =
        'BeatMarket <payments@example.com>';

      process.env.NEXT_PUBLIC_SITE_URL =
        'https://beatmarket.example';
    });

    it(
      'skips a request without a payout request ID',
      async () => {
        const result =
          await sendPayoutStatusEmail({
            payoutRequestId:
              '',

            eventType:
              PAYOUT_EVENT.APPROVED,

            baseUrl:
              'https://beatmarket.example',

            requestId:
              'request-1'
          });

        expect(result).toEqual({
          success: false,
          sent: false,
          skipped: true
        });

        expect(
          mocks.logWarning
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.logWarning
        ).toHaveBeenCalledWith(
          'payout_status_email_skipped',
          {
            requestId:
              'request-1',

            payoutRequestId:
              null,

            eventType:
              PAYOUT_EVENT.APPROVED,

            reason:
              'Missing payout request ID or unsupported payout event.'
          }
        );

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.resendConstructor
        ).not.toHaveBeenCalled();

        expect(
          mocks.resendSend
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'skips an unsupported payout event',
      async () => {
        const result =
          await sendPayoutStatusEmail({
            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              'cancelled',

            baseUrl:
              'https://beatmarket.example',

            requestId:
              'request-2'
          });

        expect(result).toEqual({
          success: false,
          sent: false,
          skipped: true
        });

        expect(
          mocks.logWarning
        ).toHaveBeenCalledWith(
          'payout_status_email_skipped',
          {
            requestId:
              'request-2',

            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              'cancelled',

            reason:
              'Missing payout request ID or unsupported payout event.'
          }
        );

        expect(
          mocks.createSupabaseAdminClient
        ).not.toHaveBeenCalled();

        expect(
          mocks.resendSend
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'skips an email when the stored payout status does not match the requested event',
      async () => {
        const {
          from,
          getUserById
        } = configureGuardrailFlow({
          payoutRequest:
            createPayoutRequest({
              status:
                'pending',

              approved_at:
                null
            })
        });

        const result =
          await sendPayoutStatusEmail({
            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              PAYOUT_EVENT.APPROVED,

            baseUrl:
              'https://beatmarket.example',

            requestId:
              'request-3'
          });

        expect(result).toEqual({
          success: false,
          sent: false,
          skipped: true
        });

        expect(from)
          .toHaveBeenCalledTimes(1);

        expect(from)
          .toHaveBeenCalledWith(
            'payout_requests'
          );

        expect(
          mocks.logWarning
        ).toHaveBeenCalledWith(
          'payout_status_email_skipped',
          {
            requestId:
              'request-3',

            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              PAYOUT_EVENT.APPROVED,

            storedStatus:
              'pending',

            reason:
              'The payout status does not match the requested email event.'
          }
        );

        expect(getUserById)
          .not.toHaveBeenCalled();

        expect(
          mocks.resendConstructor
        ).not.toHaveBeenCalled();

        expect(
          mocks.resendSend
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'does not resend an email whose delivery is already marked sent',
      async () => {
        const {
          from,
          getUserById,
          deliveryQuery
        } = configureGuardrailFlow({
          payoutRequest:
            createPayoutRequest({
              status:
                'approved'
            }),

          existingDelivery: {
            id:
              'delivery-1',

            status:
              'sent'
          }
        });

        const result =
          await sendPayoutStatusEmail({
            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              PAYOUT_EVENT.APPROVED,

            baseUrl:
              'https://beatmarket.example',

            requestId:
              'request-4'
          });

        expect(result).toEqual({
          success: true,
          sent: false,
          skipped: true
        });

        expect(from)
          .toHaveBeenCalledTimes(2);

        expect(
          deliveryQuery.firstEq
        ).toHaveBeenCalledWith(
          'payout_request_id',
          PAYOUT_REQUEST_ID
        );

        expect(
          deliveryQuery.secondEq
        ).toHaveBeenCalledWith(
          'event_type',
          PAYOUT_EVENT.APPROVED
        );

        expect(
          mocks.logInfo
        ).toHaveBeenCalledWith(
          'payout_status_email_not_claimed',
          {
            requestId:
              'request-4',

            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              PAYOUT_EVENT.APPROVED,

            reason:
              'The email was already sent or is currently being processed.'
          }
        );

        expect(getUserById)
          .not.toHaveBeenCalled();

        expect(
          mocks.resendConstructor
        ).not.toHaveBeenCalled();

        expect(
          mocks.resendSend
        ).not.toHaveBeenCalled();

        expect(
          mocks.logError
        ).not.toHaveBeenCalled();
      }
    );
  }
);