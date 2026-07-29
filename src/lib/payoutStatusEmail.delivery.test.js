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

const PRODUCER_EMAIL =
  'producer@example.com';

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

function createPayoutLoadQuery({
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

function createDeliveryLoadQuery({
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

function createInsertClaimQuery({
  data,
  error = null
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({
      data,
      error
    });

  const select = vi
    .fn()
    .mockReturnValue({
      maybeSingle
    });

  const insert = vi
    .fn()
    .mockReturnValue({
      select
    });

  return {
    insert,
    select,
    maybeSingle
  };
}

function createReclaimQuery({
  data,
  error = null
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({
      data,
      error
    });

  const select = vi
    .fn()
    .mockReturnValue({
      maybeSingle
    });

  const secondEq = vi
    .fn()
    .mockReturnValue({
      select
    });

  const firstEq = vi
    .fn()
    .mockReturnValue({
      eq:
        secondEq
    });

  const update = vi
    .fn()
    .mockReturnValue({
      eq:
        firstEq
    });

  return {
    update,
    firstEq,
    secondEq,
    select,
    maybeSingle
  };
}

function createStatusUpdateQuery({
  error = null
} = {}) {
  const thirdEq = vi
    .fn()
    .mockResolvedValue({
      error
    });

  const secondEq = vi
    .fn()
    .mockReturnValue({
      eq:
        thirdEq
    });

  const firstEq = vi
    .fn()
    .mockReturnValue({
      eq:
        secondEq
    });

  const update = vi
    .fn()
    .mockReturnValue({
      eq:
        firstEq
    });

  return {
    update,
    firstEq,
    secondEq,
    thirdEq
  };
}

function configureDeliveryFlow({
  payoutRequest =
    createPayoutRequest(),

  payoutLoadError =
    null,

  existingDelivery =
    null,

  deliveryLoadError =
    null,

  claimData = {
    id:
      'delivery-1'
  },

  claimError =
    null,

  producerEmail =
    PRODUCER_EMAIL,

  producerLoadError =
    null,

  resendData = {
    id:
      'resend-message-1'
  },

  resendError =
    null,

  statusUpdateError =
    null
} = {}) {
  const payoutLoad =
    createPayoutLoadQuery({
      data:
        payoutRequest,

      error:
        payoutLoadError
    });

  const deliveryLoad =
    createDeliveryLoadQuery({
      data:
        existingDelivery,

      error:
        deliveryLoadError
    });

  const insertClaim =
    createInsertClaimQuery({
      data:
        claimData,

      error:
        claimError
    });

  const reclaimClaim =
    createReclaimQuery({
      data:
        claimData,

      error:
        claimError
    });

  const statusUpdate =
    createStatusUpdateQuery({
      error:
        statusUpdateError
    });

  const deliveryOperations = [
    {
      select:
        deliveryLoad.select
    },

    existingDelivery?.status ===
      'failed'
      ? {
          update:
            reclaimClaim.update
        }
      : {
          insert:
            insertClaim.insert
        },

    {
      update:
        statusUpdate.update
    }
  ];

  const from = vi.fn(
    (tableName) => {
      if (
        tableName ===
        'payout_requests'
      ) {
        return {
          select:
            payoutLoad.select
        };
      }

      if (
        tableName ===
        'payout_status_email_deliveries'
      ) {
        const operation =
          deliveryOperations.shift();

        if (!operation) {
          throw new Error(
            'Unexpected payout email delivery table operation.'
          );
        }

        return operation;
      }

      throw new Error(
        `Unexpected table access: ${tableName}`
      );
    }
  );

  const getUserById = vi
    .fn()
    .mockResolvedValue({
      data: {
        user: {
          email:
            producerEmail
        }
      },

      error:
        producerLoadError
    });

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

  mocks.resendSend
    .mockResolvedValue({
      data:
        resendData,

      error:
        resendError
    });

  return {
    supabase,
    from,
    getUserById,
    payoutLoad,
    deliveryLoad,
    insertClaim,
    reclaimClaim,
    statusUpdate
  };
}

describe(
  'sendPayoutStatusEmail delivery handling',
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
      'sends an approved payout email and records the delivery as sent',
      async () => {
        const {
          getUserById,
          insertClaim,
          statusUpdate
        } = configureDeliveryFlow({
          payoutRequest:
            createPayoutRequest({
              status:
                'approved'
            }),

          resendData: {
            id:
              'resend-approved-1'
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
              'request-approved'
          });

        expect(result).toEqual({
          success: true,
          sent: true,
          skipped: false,
          providerMessageId:
            'resend-approved-1'
        });

        expect(
          mocks.createSupabaseAdminClient
        ).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-service-role-key',
          {
            auth: {
              autoRefreshToken:
                false,

              persistSession:
                false
            }
          }
        );

        expect(
          insertClaim.insert
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            payout_request_id:
              PAYOUT_REQUEST_ID,

            event_type:
              PAYOUT_EVENT.APPROVED,

            status:
              'sending',

            updated_at:
              expect.any(String)
          })
        );

        expect(getUserById)
          .toHaveBeenCalledWith(
            PRODUCER_ID
          );

        expect(
          mocks.resendConstructor
        ).toHaveBeenCalledWith(
          'test-resend-key'
        );

        expect(
          mocks.resendSend
        ).toHaveBeenCalledTimes(1);

        const emailPayload =
          mocks.resendSend.mock
            .calls[0][0];

        expect(emailPayload.from)
          .toBe(
            'BeatMarket <payments@example.com>'
          );

        expect(emailPayload.to)
          .toEqual([
            PRODUCER_EMAIL
          ]);

        expect(emailPayload.subject)
          .toContain(
            'BeatMarket payout approved'
          );

        expect(emailPayload.html)
          .toContain(
            'Your payout was approved'
          );

        expect(emailPayload.html)
          .toContain(
            PAYOUT_REQUEST_ID
          );

        expect(emailPayload.html)
          .toContain(
            'https://beatmarket.example/dashboard'
          );

        expect(emailPayload.text)
          .toContain(
            'Your payout was approved'
          );

        expect(emailPayload.text)
          .toContain(
            `Payout request: ${PAYOUT_REQUEST_ID}`
          );

        expect(
          statusUpdate.update
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'sent',

            sent_at:
              expect.any(String),

            provider_message_id:
              'resend-approved-1',

            error_message:
              null,

            updated_at:
              expect.any(String)
          })
        );

        expect(
          statusUpdate.firstEq
        ).toHaveBeenCalledWith(
          'payout_request_id',
          PAYOUT_REQUEST_ID
        );

        expect(
          statusUpdate.secondEq
        ).toHaveBeenCalledWith(
          'event_type',
          PAYOUT_EVENT.APPROVED
        );

        expect(
          statusUpdate.thirdEq
        ).toHaveBeenCalledWith(
          'status',
          'sending'
        );

        expect(
          mocks.logInfo
        ).toHaveBeenCalledWith(
          'payout_status_email_sent',
          {
            requestId:
              'request-approved',

            payoutRequestId:
              PAYOUT_REQUEST_ID,

            producerId:
              PRODUCER_ID,

            eventType:
              PAYOUT_EVENT.APPROVED,

            providerMessageId:
              'resend-approved-1'
          }
        );

        expect(
          mocks.logError
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'sends a rejected payout email and escapes the rejection reason in HTML',
      async () => {
        configureDeliveryFlow({
          payoutRequest:
            createPayoutRequest({
              status:
                'rejected',

              approved_at:
                null,

              rejected_at:
                '2026-07-29T06:30:00.000Z',

              rejection_reason:
                '<Transfer & "details">'
            }),

          resendData: {
            id:
              'resend-rejected-1'
          }
        });

        const result =
          await sendPayoutStatusEmail({
            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              PAYOUT_EVENT.REJECTED,

            baseUrl:
              'https://beatmarket.example',

            requestId:
              'request-rejected'
          });

        expect(result).toEqual({
          success: true,
          sent: true,
          skipped: false,
          providerMessageId:
            'resend-rejected-1'
        });

        const emailPayload =
          mocks.resendSend.mock
            .calls[0][0];

        expect(emailPayload.subject)
          .toContain(
            'BeatMarket payout rejected'
          );

        expect(emailPayload.html)
          .toContain(
            'Your payout was rejected'
          );

        expect(emailPayload.html)
          .toContain(
            '&lt;Transfer &amp; &quot;details&quot;&gt;'
          );

        expect(emailPayload.html)
          .not.toContain(
            '<Transfer & "details">'
          );

        expect(emailPayload.text)
          .toContain(
            'Rejection reason: <Transfer & "details">'
          );
      }
    );

    it(
      'sends a paid payout email with its transfer reference',
      async () => {
        configureDeliveryFlow({
          payoutRequest:
            createPayoutRequest({
              status:
                'paid',

              paid_at:
                '2026-07-29T07:00:00.000Z',

              bank_transfer_reference:
                'BANK-TRANSFER-2026-001'
            }),

          resendData: {
            id:
              'resend-paid-1'
          }
        });

        const result =
          await sendPayoutStatusEmail({
            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              PAYOUT_EVENT.PAID,

            baseUrl:
              'not-a-valid-url',

            requestId:
              'request-paid'
          });

        expect(result).toEqual({
          success: true,
          sent: true,
          skipped: false,
          providerMessageId:
            'resend-paid-1'
        });

        const emailPayload =
          mocks.resendSend.mock
            .calls[0][0];

        expect(emailPayload.subject)
          .toContain(
            'BeatMarket payout paid'
          );

        expect(emailPayload.html)
          .toContain(
            'Your payout was paid'
          );

        expect(emailPayload.html)
          .toContain(
            'BANK-TRANSFER-2026-001'
          );

        expect(emailPayload.text)
          .toContain(
            'Bank transfer reference: BANK-TRANSFER-2026-001'
          );

        expect(emailPayload.text)
          .toContain(
            'https://beatmarket.example/dashboard'
          );
      }
    );

    it(
      'reclaims a previously failed delivery before retrying the email',
      async () => {
        const {
          insertClaim,
          reclaimClaim
        } = configureDeliveryFlow({
          existingDelivery: {
            id:
              'failed-delivery-1',

            status:
              'failed'
          },

          claimData: {
            id:
              'failed-delivery-1'
          },

          resendData: {
            id:
              'resend-retry-1'
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
              'request-retry'
          });

        expect(result).toEqual({
          success: true,
          sent: true,
          skipped: false,
          providerMessageId:
            'resend-retry-1'
        });

        expect(
          insertClaim.insert
        ).not.toHaveBeenCalled();

        expect(
          reclaimClaim.update
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'sending',

            sent_at:
              null,

            provider_message_id:
              null,

            error_message:
              null,

            updated_at:
              expect.any(String)
          })
        );

        expect(
          reclaimClaim.firstEq
        ).toHaveBeenCalledWith(
          'id',
          'failed-delivery-1'
        );

        expect(
          reclaimClaim.secondEq
        ).toHaveBeenCalledWith(
          'status',
          'failed'
        );

        expect(
          reclaimClaim.select
        ).toHaveBeenCalledWith(
          'id'
        );

        expect(
          mocks.resendSend
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      'records a failed delivery when Resend rejects the email',
      async () => {
        const {
          statusUpdate
        } = configureDeliveryFlow({
          resendData:
            null,

          resendError: {
            message:
              'Resend service unavailable.'
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
              'request-provider-failure'
          });

        expect(result).toEqual({
          success: false,
          sent: false,
          skipped: false
        });

        expect(
          mocks.resendSend
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.createSupabaseAdminClient
        ).toHaveBeenCalledTimes(2);

        expect(
          statusUpdate.update
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'failed',

            sent_at:
              null,

            provider_message_id:
              null,

            error_message:
              'Resend service unavailable.',

            updated_at:
              expect.any(String)
          })
        );

        expect(
          statusUpdate.firstEq
        ).toHaveBeenCalledWith(
          'payout_request_id',
          PAYOUT_REQUEST_ID
        );

        expect(
          statusUpdate.secondEq
        ).toHaveBeenCalledWith(
          'event_type',
          PAYOUT_EVENT.APPROVED
        );

        expect(
          statusUpdate.thirdEq
        ).toHaveBeenCalledWith(
          'status',
          'sending'
        );

        expect(
          mocks.logError
        ).toHaveBeenCalledWith(
          'payout_status_email_failed',
          {
            requestId:
              'request-provider-failure',

            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              PAYOUT_EVENT.APPROVED,

            providerAccepted:
              false
          },
          expect.any(Error)
        );
      }
    );

    it(
      'does not mark the delivery failed when Resend accepted it but recording success fails',
      async () => {
        const {
          statusUpdate
        } = configureDeliveryFlow({
          resendData: {
            id:
              'resend-accepted-1'
          },

          statusUpdateError: {
            message:
              'Database update failed.'
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
              'request-recording-failure'
          });

        expect(result).toEqual({
          success: false,
          sent: false,
          skipped: false
        });

        expect(
          mocks.resendSend
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.createSupabaseAdminClient
        ).toHaveBeenCalledTimes(1);

        expect(
          statusUpdate.update
        ).toHaveBeenCalledTimes(1);

        expect(
          statusUpdate.update
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'sent',

            provider_message_id:
              'resend-accepted-1'
          })
        );

        expect(
          mocks.logError
        ).toHaveBeenCalledWith(
          'payout_status_email_failed',
          {
            requestId:
              'request-recording-failure',

            payoutRequestId:
              PAYOUT_REQUEST_ID,

            eventType:
              PAYOUT_EVENT.APPROVED,

            providerAccepted:
              true
          },
          expect.any(Error)
        );
      }
    );
  }
);