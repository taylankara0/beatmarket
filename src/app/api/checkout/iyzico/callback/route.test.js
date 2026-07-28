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
  'POST /api/checkout/iyzico/callback',
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
      'handles a repeated callback for an already-paid order without retrieving or updating the payment again',
      async () => {
        const paidOrder = {
          id: 'order-1',
          public_id: 'public-order-1',
          conversation_id: 'conversation-1',
          basket_id: 'basket-1',
          status: 'paid',
          price: '100.00',
          paid_price: '100.00',
          currency: 'TRY',
          payment_id: 'payment-1',
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const maybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: paidOrder,
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

        const rpc = vi
          .fn()
          .mockResolvedValue({
            data: 0,
            error: null
          });

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
              token: 'callback-token'
            })
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/payment/success?order=public-order-1'
        );

        expect(from).toHaveBeenCalledTimes(1);

        expect(from).toHaveBeenCalledWith(
          'orders'
        );

        expect(eq).toHaveBeenCalledWith(
          'iyzico_token',
          'callback-token'
        );

        expect(
          mocks.checkoutRetrieve
        ).not.toHaveBeenCalled();

        expect(rpc).toHaveBeenCalledTimes(1);

        expect(rpc).toHaveBeenCalledWith(
          'create_producer_earnings_for_order',
          {
            target_order_id: 'order-1'
          }
        );

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).toHaveBeenCalledWith({
          supabase,
          order: paidOrder,
          baseUrl:
            'http://localhost:3000/'
        });

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).toHaveBeenCalledWith({
          supabase,
          order: paidOrder,
          baseUrl:
            'http://localhost:3000/'
        });
      }
    );

    it(
      'keeps a refunded order terminal when a delayed or repeated callback arrives',
      async () => {
        const refundedOrder = {
          id: 'order-2',
          public_id: 'public-order-2',
          conversation_id: 'conversation-2',
          basket_id: 'basket-2',
          status: 'refunded',
          price: '150.00',
          paid_price: '150.00',
          currency: 'TRY',
          payment_id: 'payment-2',
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const maybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: refundedOrder,
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
              token: 'refunded-callback-token'
            })
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/explore?payment=refunded'
        );

        expect(from).toHaveBeenCalledTimes(1);

        expect(from).toHaveBeenCalledWith(
          'orders'
        );

        expect(eq).toHaveBeenCalledWith(
          'iyzico_token',
          'refunded-callback-token'
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
      'rejects a successful Iyzico response when its basket ID does not match the order',
      async () => {
        const pendingOrder = {
          id: 'order-3',
          public_id: 'public-order-3',
          conversation_id: 'conversation-3',
          basket_id: 'expected-basket-3',
          status: 'pending',
          price: '200.00',
          paid_price: '200.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const paymentResult = {
          status: 'success',
          paymentStatus: 'SUCCESS',
          paymentId: 'payment-3',
          token: 'pending-token',
          conversationId:
            'conversation-3',
          basketId:
            'different-basket-id',
          price: '200.00',
          paidPrice: '200.00',
          currency: 'TRY',
          itemTransactions: []
        };

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

        const reservationStatusEq = vi
          .fn()
          .mockResolvedValue({
            error: null
          });

        const reservationOrderEq = vi
          .fn()
          .mockReturnValue({
            eq: reservationStatusEq
          });

        const reservationUpdate = vi
          .fn()
          .mockReturnValue({
            eq: reservationOrderEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select,
                update: orderUpdate
              };
            }

            if (
              tableName ===
              'exclusive_beat_reservations'
            ) {
              return {
                update: reservationUpdate
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
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
                null,
                paymentResult
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
              token: 'pending-token'
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
            token: 'pending-token'
          },
          expect.any(Function)
        );

        expect(orderUpdate)
          .toHaveBeenCalledTimes(1);

        expect(orderUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'verification_failed',

              payment_status:
                'SUCCESS',

              failure_reason:
                expect.stringContaining(
                  'basket ID'
                ),

              iyzico_response:
                paymentResult
            })
          );

        expect(orderUpdateEq)
          .toHaveBeenCalledWith(
            'id',
            'order-3'
          );

        expect(orderUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(reservationUpdate)
          .toHaveBeenCalledTimes(1);

        expect(reservationUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              expires_at: null,
              updated_at:
                expect.any(String)
            })
          );

        expect(reservationOrderEq)
          .toHaveBeenCalledWith(
            'order_id',
            'order-3'
          );

        expect(reservationStatusEq)
          .toHaveBeenCalledWith(
            'status',
            'reserved'
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

    it(
      'rejects a successful Iyzico response when its basket price does not match the order',
      async () => {
        const pendingOrder = {
          id: 'order-4',
          public_id: 'public-order-4',
          conversation_id: 'conversation-4',
          basket_id: 'basket-4',
          status: 'pending',
          price: '250.00',
          paid_price: '250.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const paymentResult = {
          status: 'success',
          paymentStatus: 'SUCCESS',
          paymentId: 'payment-4',
          token: 'price-mismatch-token',
          conversationId:
            'conversation-4',
          basketId:
            'basket-4',
          price: '249.99',
          paidPrice: '250.00',
          currency: 'TRY',
          itemTransactions: []
        };

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

        const reservationStatusEq = vi
          .fn()
          .mockResolvedValue({
            error: null
          });

        const reservationOrderEq = vi
          .fn()
          .mockReturnValue({
            eq: reservationStatusEq
          });

        const reservationUpdate = vi
          .fn()
          .mockReturnValue({
            eq: reservationOrderEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select,
                update: orderUpdate
              };
            }

            if (
              tableName ===
              'exclusive_beat_reservations'
            ) {
              return {
                update: reservationUpdate
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
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
                null,
                paymentResult
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
                'price-mismatch-token'
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
              'price-mismatch-token'
          },
          expect.any(Function)
        );

        expect(orderUpdate)
          .toHaveBeenCalledTimes(1);

        expect(orderUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'verification_failed',

              payment_status:
                'SUCCESS',

              failure_reason:
                expect.stringContaining(
                  'basket price'
                ),

              iyzico_response:
                paymentResult
            })
          );

        expect(orderUpdateEq)
          .toHaveBeenCalledWith(
            'id',
            'order-4'
          );

        expect(orderUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(reservationUpdate)
          .toHaveBeenCalledTimes(1);

        expect(reservationUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              expires_at: null,
              updated_at:
                expect.any(String)
            })
          );

        expect(reservationOrderEq)
          .toHaveBeenCalledWith(
            'order_id',
            'order-4'
          );

        expect(reservationStatusEq)
          .toHaveBeenCalledWith(
            'status',
            'reserved'
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

    it(
      'rejects a successful Iyzico response when its currency does not match the order',
      async () => {
        const pendingOrder = {
          id: 'order-5',
          public_id: 'public-order-5',
          conversation_id: 'conversation-5',
          basket_id: 'basket-5',
          status: 'pending',
          price: '300.00',
          paid_price: '300.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const paymentResult = {
          status: 'success',
          paymentStatus: 'SUCCESS',
          paymentId: 'payment-5',
          token: 'currency-mismatch-token',
          conversationId:
            'conversation-5',
          basketId:
            'basket-5',
          price: '300.00',
          paidPrice: '300.00',
          currency: 'USD',
          itemTransactions: []
        };

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

        const reservationStatusEq = vi
          .fn()
          .mockResolvedValue({
            error: null
          });

        const reservationOrderEq = vi
          .fn()
          .mockReturnValue({
            eq: reservationStatusEq
          });

        const reservationUpdate = vi
          .fn()
          .mockReturnValue({
            eq: reservationOrderEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select,
                update: orderUpdate
              };
            }

            if (
              tableName ===
              'exclusive_beat_reservations'
            ) {
              return {
                update: reservationUpdate
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
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
                null,
                paymentResult
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
                'currency-mismatch-token'
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
              'currency-mismatch-token'
          },
          expect.any(Function)
        );

        expect(orderUpdate)
          .toHaveBeenCalledTimes(1);

        expect(orderUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'verification_failed',

              payment_status:
                'SUCCESS',

              failure_reason:
                expect.stringContaining(
                  'currency'
                ),

              iyzico_response:
                paymentResult
            })
          );

        expect(orderUpdateEq)
          .toHaveBeenCalledWith(
            'id',
            'order-5'
          );

        expect(orderUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(reservationUpdate)
          .toHaveBeenCalledTimes(1);

        expect(reservationUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              expires_at: null,
              updated_at:
                expect.any(String)
            })
          );

        expect(reservationOrderEq)
          .toHaveBeenCalledWith(
            'order_id',
            'order-5'
          );

        expect(reservationStatusEq)
          .toHaveBeenCalledWith(
            'status',
            'reserved'
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

    it(
      'rejects a successful Iyzico response when its paid price does not match the order',
      async () => {
        const pendingOrder = {
          id: 'order-paid-price',
          public_id: 'public-order-paid-price',
          conversation_id:
            'conversation-paid-price',
          basket_id: 'basket-paid-price',
          status: 'pending',
          price: '275.00',
          paid_price: '275.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const paymentResult = {
          status: 'success',
          paymentStatus: 'SUCCESS',
          paymentId: 'payment-paid-price',
          token: 'paid-price-mismatch-token',
          conversationId:
            'conversation-paid-price',
          basketId:
            'basket-paid-price',
          price: '275.00',
          paidPrice: '274.99',
          currency: 'TRY',
          itemTransactions: []
        };

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

        const reservationStatusEq = vi
          .fn()
          .mockResolvedValue({
            error: null
          });

        const reservationOrderEq = vi
          .fn()
          .mockReturnValue({
            eq: reservationStatusEq
          });

        const reservationUpdate = vi
          .fn()
          .mockReturnValue({
            eq: reservationOrderEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select,
                update: orderUpdate
              };
            }

            if (
              tableName ===
              'exclusive_beat_reservations'
            ) {
              return {
                update: reservationUpdate
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
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
                null,
                paymentResult
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
                'paid-price-mismatch-token'
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
              'paid-price-mismatch-token'
          },
          expect.any(Function)
        );

        expect(orderUpdate)
          .toHaveBeenCalledTimes(1);

        expect(orderUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'verification_failed',

              payment_status:
                'SUCCESS',

              failure_reason:
                expect.stringContaining(
                  'paid price'
                ),

              iyzico_response:
                paymentResult
            })
          );

        expect(orderUpdateEq)
          .toHaveBeenCalledWith(
            'id',
            'order-paid-price'
          );

        expect(orderUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(reservationUpdate)
          .toHaveBeenCalledTimes(1);

        expect(reservationUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              expires_at: null,
              updated_at:
                expect.any(String)
            })
          );

        expect(reservationOrderEq)
          .toHaveBeenCalledWith(
            'order_id',
            'order-paid-price'
          );

        expect(reservationStatusEq)
          .toHaveBeenCalledWith(
            'status',
            'reserved'
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

    it(
      'marks the order failed and releases its Exclusive reservation when Iyzico confirms payment failure',
      async () => {
        const pendingOrder = {
          id: 'order-6',
          public_id: 'public-order-6',
          conversation_id: 'conversation-6',
          basket_id: 'basket-6',
          status: 'pending',
          price: '350.00',
          paid_price: '350.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const paymentResult = {
          status: 'failure',
          paymentStatus: 'FAILURE',
          errorMessage: 'Insufficient funds.'
        };

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

        const reservationStatusEq = vi
          .fn()
          .mockResolvedValue({
            error: null
          });

        const reservationOrderEq = vi
          .fn()
          .mockReturnValue({
            eq: reservationStatusEq
          });

        const reservationDelete = vi
          .fn()
          .mockReturnValue({
            eq: reservationOrderEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select,
                update: orderUpdate
              };
            }

            if (
              tableName ===
              'exclusive_beat_reservations'
            ) {
              return {
                delete: reservationDelete
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
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
                null,
                paymentResult
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
                'confirmed-failure-token'
            })
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/explore?payment=failed'
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
              'confirmed-failure-token'
          },
          expect.any(Function)
        );

        expect(orderUpdate)
          .toHaveBeenCalledTimes(1);

        expect(orderUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                'payment_failed',

              payment_status:
                'FAILURE',

              failure_reason:
                'Insufficient funds.',

              iyzico_response:
                paymentResult,

              updated_at:
                expect.any(String)
            })
          );

        expect(orderUpdateEq)
          .toHaveBeenCalledWith(
            'id',
            'order-6'
          );

        expect(orderUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(reservationDelete)
          .toHaveBeenCalledTimes(1);

        expect(reservationOrderEq)
          .toHaveBeenCalledWith(
            'order_id',
            'order-6'
          );

        expect(reservationStatusEq)
          .toHaveBeenCalledWith(
            'status',
            'reserved'
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

    it(
      'finalizes a successful normal-license payment and triggers its post-payment side effects',
      async () => {
        const pendingOrder = {
          id: 'order-7',
          public_id: 'public-order-7',
          conversation_id: 'conversation-7',
          basket_id: 'basket-7',
          status: 'pending',
          price: '400.00',
          paid_price: '400.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: [
            {
              beatId: 'beat-normal-1',
              isExclusive: false
            }
          ]
        };

        const paidOrder = {
          id: 'order-7',
          public_id: 'public-order-7',
          price: '400.00',
          paid_price: '400.00',
          currency: 'TRY',
          buyer_email: 'buyer@example.com',
          cart_snapshot:
            pendingOrder.cart_snapshot
        };

        const paymentResult = {
          status: 'success',
          paymentStatus: 'SUCCESS',
          paymentId: 'payment-7',
          token: 'successful-normal-token',
          conversationId: 'conversation-7',
          basketId: 'basket-7',
          price: '400.00',
          paidPrice: '400.00',
          currency: 'TRY',
          itemTransactions: [
            {
              itemId: 'order-item-7',
              paymentTransactionId:
                'transaction-7',
              paidPrice: '400.00',
              transactionStatus: 2
            }
          ]
        };

        const lookupMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: pendingOrder,
            error: null
          });

        const lookupEq = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              lookupMaybeSingle
          });

        const orderSelect = vi
          .fn()
          .mockReturnValue({
            eq: lookupEq
          });

        const paidMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: paidOrder,
            error: null
          });

        const paidSelect = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              paidMaybeSingle
          });

        const paidUpdateNot = vi
          .fn()
          .mockReturnValue({
            select: paidSelect
          });

        const paidUpdateEq = vi
          .fn()
          .mockReturnValue({
            not: paidUpdateNot
          });

        const paidUpdate = vi
          .fn()
          .mockReturnValue({
            eq: paidUpdateEq
          });

        const orderItemIdEq = vi
          .fn()
          .mockResolvedValue({
            error: null
          });

        const orderItemOrderEq = vi
          .fn()
          .mockReturnValue({
            eq: orderItemIdEq
          });

        const orderItemUpdate = vi
          .fn()
          .mockReturnValue({
            eq: orderItemOrderEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select: orderSelect,
                update: paidUpdate
              };
            }

            if (tableName === 'order_items') {
              return {
                update: orderItemUpdate
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
          }
        );

        const rpc = vi
          .fn()
          .mockResolvedValue({
            data: 1,
            error: null
          });

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
                null,
                paymentResult
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
                'successful-normal-token'
            })
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/payment/success?order=public-order-7'
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
              'successful-normal-token'
          },
          expect.any(Function)
        );

        expect(paidUpdate)
          .toHaveBeenCalledTimes(1);

        expect(paidUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status: 'paid',
              payment_id: 'payment-7',
              payment_status: 'SUCCESS',
              paid_price: '400.00',
              iyzico_response:
                paymentResult,
              failure_reason: null,
              paid_at: expect.any(String),
              updated_at:
                expect.any(String)
            })
          );

        expect(paidUpdateEq)
          .toHaveBeenCalledWith(
            'id',
            'order-7'
          );

        expect(paidUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(orderItemUpdate)
          .toHaveBeenCalledTimes(1);

        expect(orderItemUpdate)
          .toHaveBeenCalledWith({
            payment_transaction_id:
              'transaction-7',
            iyzico_paid_price:
              '400.00',
            iyzico_transaction_status:
              '2'
          });

        expect(orderItemOrderEq)
          .toHaveBeenCalledWith(
            'order_id',
            'order-7'
          );

        expect(orderItemIdEq)
          .toHaveBeenCalledWith(
            'iyzico_item_id',
            'order-item-7'
          );

        expect(from)
          .not.toHaveBeenCalledWith(
            'exclusive_beat_reservations'
          );

        expect(from)
          .not.toHaveBeenCalledWith(
            'beats'
          );

        expect(rpc).toHaveBeenCalledTimes(1);

        expect(rpc).toHaveBeenCalledWith(
          'create_producer_earnings_for_order',
          {
            target_order_id: 'order-7'
          }
        );

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).toHaveBeenCalledWith({
          supabase,
          order: paidOrder,
          baseUrl:
            'http://localhost:3000/'
        });

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).toHaveBeenCalledWith({
          supabase,
          order: paidOrder,
          baseUrl:
            'http://localhost:3000/'
        });
      }
    );

    it(
      'finalizes a successful Exclusive payment before completing the order',
      async () => {
        const pendingOrder = {
          id: 'order-8',
          public_id: 'public-order-8',
          conversation_id: 'conversation-8',
          basket_id: 'basket-8',
          status: 'pending',
          price: '500.00',
          paid_price: '500.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: [
            {
              beatId: 'beat-exclusive-8',
              isExclusive: true
            }
          ]
        };

        const paidOrder = {
          id: 'order-8',
          public_id: 'public-order-8',
          price: '500.00',
          paid_price: '500.00',
          currency: 'TRY',
          buyer_email: 'buyer@example.com',
          cart_snapshot:
            pendingOrder.cart_snapshot
        };

        const paymentResult = {
          status: 'success',
          paymentStatus: 'SUCCESS',
          paymentId: 'payment-8',
          token: 'successful-exclusive-token',
          conversationId: 'conversation-8',
          basketId: 'basket-8',
          price: '500.00',
          paidPrice: '500.00',
          currency: 'TRY',
          itemTransactions: []
        };

        const lookupMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: pendingOrder,
            error: null
          });

        const lookupEq = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              lookupMaybeSingle
          });

        const orderSelect = vi
          .fn()
          .mockReturnValue({
            eq: lookupEq
          });

        const reservationSelect = vi
          .fn()
          .mockResolvedValue({
            data: [
              {
                beat_id:
                  'beat-exclusive-8'
              }
            ],
            error: null
          });

        const reservationStatusIn = vi
          .fn()
          .mockReturnValue({
            select:
              reservationSelect
          });

        const reservationBeatIn = vi
          .fn()
          .mockReturnValue({
            in: reservationStatusIn
          });

        const reservationOrderEq = vi
          .fn()
          .mockReturnValue({
            in: reservationBeatIn
          });

        const reservationUpdate = vi
          .fn()
          .mockReturnValue({
            eq: reservationOrderEq
          });

        const beatSelect = vi
          .fn()
          .mockResolvedValue({
            data: [
              {
                id: 'beat-exclusive-8'
              }
            ],
            error: null
          });

        const beatIdIn = vi
          .fn()
          .mockReturnValue({
            select: beatSelect
          });

        const beatUpdate = vi
          .fn()
          .mockReturnValue({
            in: beatIdIn
          });

        const paidMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: paidOrder,
            error: null
          });

        const paidSelect = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              paidMaybeSingle
          });

        const paidUpdateNot = vi
          .fn()
          .mockReturnValue({
            select: paidSelect
          });

        const paidUpdateEq = vi
          .fn()
          .mockReturnValue({
            not: paidUpdateNot
          });

        const paidUpdate = vi
          .fn()
          .mockReturnValue({
            eq: paidUpdateEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select: orderSelect,
                update: paidUpdate
              };
            }

            if (
              tableName ===
              'exclusive_beat_reservations'
            ) {
              return {
                update:
                  reservationUpdate
              };
            }

            if (tableName === 'beats') {
              return {
                update: beatUpdate
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
          }
        );

        const rpc = vi
          .fn()
          .mockResolvedValue({
            data: 1,
            error: null
          });

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
                null,
                paymentResult
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
                'successful-exclusive-token'
            })
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/payment/success?order=public-order-8'
        );

        expect(reservationUpdate)
          .toHaveBeenCalledTimes(1);

        expect(reservationUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status: 'paid',
              expires_at: null,
              updated_at:
                expect.any(String)
            })
          );

        expect(reservationOrderEq)
          .toHaveBeenCalledWith(
            'order_id',
            'order-8'
          );

        expect(reservationBeatIn)
          .toHaveBeenCalledWith(
            'beat_id',
            ['beat-exclusive-8']
          );

        expect(reservationStatusIn)
          .toHaveBeenCalledWith(
            'status',
            ['reserved', 'paid']
          );

        expect(beatUpdate)
          .toHaveBeenCalledTimes(1);

        expect(beatUpdate)
          .toHaveBeenCalledWith({
            is_sold_exclusive: true
          });

        expect(beatIdIn)
          .toHaveBeenCalledWith(
            'id',
            ['beat-exclusive-8']
          );

        expect(paidUpdate)
          .toHaveBeenCalledTimes(1);

        expect(paidUpdate)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status: 'paid',
              payment_id: 'payment-8',
              payment_status: 'SUCCESS',
              paid_price: '500.00',
              iyzico_response:
                paymentResult,
              failure_reason: null,
              paid_at: expect.any(String),
              updated_at:
                expect.any(String)
            })
          );

        expect(paidUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(rpc).toHaveBeenCalledWith(
          'create_producer_earnings_for_order',
          {
            target_order_id: 'order-8'
          }
        );

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).toHaveBeenCalledWith({
          supabase,
          order: paidOrder,
          baseUrl:
            'http://localhost:3000/'
        });

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).toHaveBeenCalledWith({
          supabase,
          order: paidOrder,
          baseUrl:
            'http://localhost:3000/'
        });
      }
    );

    it(
      'accepts a concurrent callback when the stored paid order has the same payment ID',
      async () => {
        const pendingOrder = {
          id: 'order-9',
          public_id: 'public-order-9',
          conversation_id: 'conversation-9',
          basket_id: 'basket-9',
          status: 'pending',
          price: '600.00',
          paid_price: '600.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const concurrentlyPaidOrder = {
          id: 'order-9',
          public_id: 'public-order-9',
          status: 'paid',
          payment_id: 'payment-9',
          price: '600.00',
          paid_price: '600.00',
          currency: 'TRY',
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const paymentResult = {
          status: 'success',
          paymentStatus: 'SUCCESS',
          paymentId: 'payment-9',
          token: 'concurrent-same-token',
          conversationId: 'conversation-9',
          basketId: 'basket-9',
          price: '600.00',
          paidPrice: '600.00',
          currency: 'TRY',
          itemTransactions: []
        };

        const lookupMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: pendingOrder,
            error: null
          });

        const lookupEq = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              lookupMaybeSingle
          });

        const concurrentMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data:
              concurrentlyPaidOrder,
            error: null
          });

        const concurrentEq = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              concurrentMaybeSingle
          });

        const orderSelect = vi
          .fn()
          .mockReturnValueOnce({
            eq: lookupEq
          })
          .mockReturnValueOnce({
            eq: concurrentEq
          });

        const paidMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: null,
            error: null
          });

        const paidSelect = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              paidMaybeSingle
          });

        const paidUpdateNot = vi
          .fn()
          .mockReturnValue({
            select: paidSelect
          });

        const paidUpdateEq = vi
          .fn()
          .mockReturnValue({
            not: paidUpdateNot
          });

        const paidUpdate = vi
          .fn()
          .mockReturnValue({
            eq: paidUpdateEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select: orderSelect,
                update: paidUpdate
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
          }
        );

        const rpc = vi
          .fn()
          .mockResolvedValue({
            data: 0,
            error: null
          });

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
                null,
                paymentResult
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
                'concurrent-same-token'
            })
          }
        );

        const response = await POST(request);

        expect(response.status).toBe(303);

        expect(
          response.headers.get('location')
        ).toBe(
          'http://localhost:3000/payment/success?order=public-order-9'
        );

        expect(orderSelect)
          .toHaveBeenCalledTimes(2);

        expect(lookupEq)
          .toHaveBeenCalledWith(
            'iyzico_token',
            'concurrent-same-token'
          );

        expect(concurrentEq)
          .toHaveBeenCalledWith(
            'id',
            'order-9'
          );

        expect(paidUpdate)
          .toHaveBeenCalledTimes(1);

        expect(paidUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(rpc).toHaveBeenCalledWith(
          'create_producer_earnings_for_order',
          {
            target_order_id: 'order-9'
          }
        );

        expect(
          mocks.sendPurchaseConfirmationEmail
        ).toHaveBeenCalledWith({
          supabase,
          order:
            concurrentlyPaidOrder,
          baseUrl:
            'http://localhost:3000/'
        });

        expect(
          mocks.sendProducerSaleNotificationEmails
        ).toHaveBeenCalledWith({
          supabase,
          order:
            concurrentlyPaidOrder,
          baseUrl:
            'http://localhost:3000/'
        });
      }
    );

    it(
      'rejects a concurrent callback when the stored paid order has a different payment ID',
      async () => {
        const pendingOrder = {
          id: 'order-10',
          public_id: 'public-order-10',
          conversation_id: 'conversation-10',
          basket_id: 'basket-10',
          status: 'pending',
          price: '700.00',
          paid_price: '700.00',
          currency: 'TRY',
          payment_id: null,
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const conflictingPaidOrder = {
          id: 'order-10',
          public_id: 'public-order-10',
          status: 'paid',
          payment_id:
            'different-payment-id',
          price: '700.00',
          paid_price: '700.00',
          currency: 'TRY',
          buyer_email: 'buyer@example.com',
          cart_snapshot: []
        };

        const paymentResult = {
          status: 'success',
          paymentStatus: 'SUCCESS',
          paymentId: 'payment-10',
          token:
            'concurrent-different-token',
          conversationId:
            'conversation-10',
          basketId: 'basket-10',
          price: '700.00',
          paidPrice: '700.00',
          currency: 'TRY',
          itemTransactions: []
        };

        const lookupMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: pendingOrder,
            error: null
          });

        const lookupEq = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              lookupMaybeSingle
          });

        const concurrentMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data:
              conflictingPaidOrder,
            error: null
          });

        const concurrentEq = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              concurrentMaybeSingle
          });

        const orderSelect = vi
          .fn()
          .mockReturnValueOnce({
            eq: lookupEq
          })
          .mockReturnValueOnce({
            eq: concurrentEq
          });

        const paidMaybeSingle = vi
          .fn()
          .mockResolvedValue({
            data: null,
            error: null
          });

        const paidSelect = vi
          .fn()
          .mockReturnValue({
            maybeSingle:
              paidMaybeSingle
          });

        const paidUpdateNot = vi
          .fn()
          .mockReturnValue({
            select: paidSelect
          });

        const paidUpdateEq = vi
          .fn()
          .mockReturnValue({
            not: paidUpdateNot
          });

        const callbackUpdateNot = vi
          .fn()
          .mockResolvedValue({
            error: null
          });

        const callbackUpdateEq = vi
          .fn()
          .mockReturnValue({
            not: callbackUpdateNot
          });

        const ordersUpdate = vi
          .fn()
          .mockReturnValueOnce({
            eq: paidUpdateEq
          })
          .mockReturnValueOnce({
            eq: callbackUpdateEq
          });

        const from = vi.fn(
          (tableName) => {
            if (tableName === 'orders') {
              return {
                select: orderSelect,
                update: ordersUpdate
              };
            }

            throw new Error(
              `Unexpected table access: ${tableName}`
            );
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
                null,
                paymentResult
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
                'concurrent-different-token'
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

        expect(orderSelect)
          .toHaveBeenCalledTimes(2);

        expect(concurrentEq)
          .toHaveBeenCalledWith(
            'id',
            'order-10'
          );

        expect(ordersUpdate)
          .toHaveBeenCalledTimes(2);

        expect(ordersUpdate)
          .toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              status: 'paid',
              payment_id: 'payment-10'
            })
          );

        expect(ordersUpdate)
          .toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
              status: 'callback_error',
              failure_reason:
                'The payment was verified, but the order could not be finalized safely.'
            })
          );

        expect(paidUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
          );

        expect(callbackUpdateNot)
          .toHaveBeenCalledWith(
            'status',
            'in',
            '("paid","refunded")'
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