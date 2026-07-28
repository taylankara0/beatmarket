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
  'POST /api/checkout/iyzico/callback input handling',
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
      'rejects a callback that does not contain an Iyzico token',
      async () => {
        const from = vi.fn();
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
            body: JSON.stringify({})
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/explore?payment=failed'
        );

        expect(from).not.toHaveBeenCalled();

        expect(rpc).not.toHaveBeenCalled();

        expect(
          mocks.checkoutRetrieve
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a callback token that does not belong to an order',
      async () => {
        const maybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: null,
            error: null
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
              token: 'unknown-callback-token'
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
          'unknown-callback-token'
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
  }
);