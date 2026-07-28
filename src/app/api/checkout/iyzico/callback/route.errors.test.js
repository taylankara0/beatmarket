import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  checkoutRetrieve: vi.fn(),
  createClient: vi.fn(),
  getPaymentMode: vi.fn(),
  sendPurchaseConfirmationEmail: vi.fn(),
  sendProducerSaleNotificationEmails: vi.fn()
}));

vi.mock('postman-request', () => ({}));

vi.mock('iyzipay', () => {
  class IyzipayMock {
    static LOCALE = {
      TR: 'tr'
    };

    constructor() {
      this.checkoutForm = {
        retrieve: mocks.checkoutRetrieve
      };
    }
  }

  return {
    default: IyzipayMock
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient
}));

vi.mock(
  '../../../../../lib/purchaseConfirmationEmail',
  () => ({
    sendPurchaseConfirmationEmail:
      mocks.sendPurchaseConfirmationEmail
  })
);

vi.mock(
  '../../../../../lib/producerSaleNotificationEmail',
  () => ({
    sendProducerSaleNotificationEmails:
      mocks.sendProducerSaleNotificationEmails
  })
);

vi.mock(
  '../../../../../lib/paymentMode',
  () => ({
    PAYMENT_MODES: {
      DISABLED: 'disabled',
      SANDBOX: 'sandbox',
      PRODUCTION: 'production'
    },
    getPaymentMode: mocks.getPaymentMode
  })
);

import { POST } from './route';

describe(
  'POST /api/checkout/iyzico/callback error handling',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      process.env.NEXT_PUBLIC_SUPABASE_URL =
        'https://test.supabase.co';

      process.env.SUPABASE_SERVICE_ROLE_KEY =
        'test-service-role-key';

      process.env.NEXT_PUBLIC_SITE_URL =
        'http://localhost:3000';

      mocks.getPaymentMode.mockReturnValue(
        'sandbox'
      );

      mocks.sendPurchaseConfirmationEmail
        .mockResolvedValue(undefined);

      mocks.sendProducerSaleNotificationEmails
        .mockResolvedValue(undefined);
    });

    it(
      'returns an error redirect when the order lookup fails',
      async () => {
        const orderLookupError = {
          message:
            'Temporary database lookup failure.'
        };

        const maybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: null,
            error: orderLookupError
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
            if (tableName !== 'orders') {
              throw new Error(
                `Unexpected table access: ${tableName}`
              );
            }

            return {
              select
            };
          }
        );

        const rpc = vi.fn();

        const supabase = {
          from,
          rpc
        };

        mocks.createClient.mockReturnValue(
          supabase
        );

        const request = new Request(
          'http://localhost:3000/api/checkout/iyzico/callback',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              token:
                'database-error-token'
            })
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/explore?payment=error'
        );

        expect(from).toHaveBeenCalledTimes(1);

        expect(from).toHaveBeenCalledWith(
          'orders'
        );

        expect(eq).toHaveBeenCalledWith(
          'iyzico_token',
          'database-error-token'
        );

        expect(
          mocks.checkoutRetrieve
        ).not.toHaveBeenCalled();

        expect(rpc).not.toHaveBeenCalled();

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'marks the order callback_error when Iyzico retrieval fails',
      async () => {
        const pendingOrder = {
          id: 'order-retrieval-error',
          public_id:
            'public-order-retrieval-error',
          conversation_id:
            'conversation-retrieval-error',
          basket_id:
            'basket-retrieval-error',
          status: 'pending',
          price: '800.00',
          paid_price: '800.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email:
            'buyer@example.com',
          cart_snapshot: [
            {
              beatId:
                'exclusive-beat-retrieval-error',
              isExclusive: true
            }
          ]
        };

        const retrievalError =
          new Error(
            'Iyzico retrieval failed.'
          );

        const maybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: pendingOrder,
            error: null
          });

        const lookupEq = vi
          .fn()
          .mockReturnValue({
            maybeSingle
          });

        const select = vi
          .fn()
          .mockReturnValue({
            eq: lookupEq
          });

        const orderUpdateNot = vi
          .fn()
          .mockResolvedValue({
            error: null
          });

        const orderUpdateEq = vi
          .fn()
          .mockReturnValue({
            not: orderUpdateNot
          });

        const orderUpdate = vi
          .fn()
          .mockReturnValue({
            eq: orderUpdateEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName !== 'orders') {
              throw new Error(
                `Unexpected table access: ${tableName}`
              );
            }

            return {
              select,
              update: orderUpdate
            };
          }
        );

        const rpc = vi.fn();

        const supabase = {
          from,
          rpc
        };

        mocks.createClient.mockReturnValue(
          supabase
        );

        mocks.checkoutRetrieve
          .mockImplementation(
            (
              retrievalRequest,
              callback
            ) => {
              callback(
                retrievalError,
                null
              );
            }
          );

        const request = new Request(
          'http://localhost:3000/api/checkout/iyzico/callback',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              token:
                'retrieval-error-token'
            })
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/explore?payment=error'
        );

        expect(
          mocks.checkoutRetrieve
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.checkoutRetrieve
        ).toHaveBeenCalledWith(
          {
            locale: 'tr',
            token:
              'retrieval-error-token'
          },
          expect.any(Function)
        );

        expect(orderUpdate)
          .toHaveBeenCalledTimes(1);

        expect(orderUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'callback_error',

              failure_reason:
                'Iyzico retrieval failed.',

              updated_at:
                expect.any(String)
            })
          );

        expect(orderUpdateEq)
          .toHaveBeenCalledWith(
            'id',
            'order-retrieval-error'
          );

        expect(orderUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(from)
          .not.toHaveBeenCalledWith(
            'exclusive_beat_reservations'
          );

        expect(from)
          .not.toHaveBeenCalledWith(
            'beats'
          );

        expect(rpc).not.toHaveBeenCalled();

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).not.toHaveBeenCalled();
      }
    );
  }
);