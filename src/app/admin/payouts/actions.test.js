import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  sendPayoutStatusEmail: vi.fn(),

  PAYOUT_EVENT: {
    APPROVED: 'approved',
    REJECTED: 'rejected',
    PAID: 'paid'
  }
}));

vi.mock(
  '@/lib/supabase-server',
  () => ({
    createClient:
      mocks.createClient
  })
);

vi.mock(
  'next/navigation',
  () => ({
    redirect:
      mocks.redirect
  })
);

vi.mock(
  'next/cache',
  () => ({
    revalidatePath:
      mocks.revalidatePath
  })
);

vi.mock(
  '@/lib/payoutStatusEmail',
  () => ({
    PAYOUT_EVENT:
      mocks.PAYOUT_EVENT,

    sendPayoutStatusEmail:
      mocks.sendPayoutStatusEmail
  })
);

import {
  approvePayoutRequest,
  completePayoutRequest,
  rejectPayoutRequest
} from './actions';

const PAYOUT_REQUEST_ID =
  '11111111-1111-4111-8111-111111111111';

function createRedirectError(url) {
  const error =
    new Error('NEXT_REDIRECT');

  error.url = url;

  return error;
}

function createFormData(fields = {}) {
  const formData =
    new FormData();

  Object.entries(fields).forEach(
    ([fieldName, value]) => {
      if (value !== undefined) {
        formData.set(
          fieldName,
          value
        );
      }
    }
  );

  return formData;
}

function configureSupabase({
  user = {
    id: 'platform-admin-1'
  },

  authError = null,

  rpcImplementation
} = {}) {
  const getUser = vi
    .fn()
    .mockResolvedValue({
      data: {
        user
      },

      error:
        authError
    });

  const rpc = vi.fn(
    rpcImplementation ||
      (async () => ({
        data: null,
        error: null
      }))
  );

  const supabase = {
    auth: {
      getUser
    },

    rpc
  };

  mocks.createClient
    .mockResolvedValue(
      supabase
    );

  return {
    supabase,
    getUser,
    rpc
  };
}

describe(
  'administrator payout actions',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

      process.env.NEXT_PUBLIC_SITE_URL =
        'https://beatmarket.example';

      mocks.redirect
        .mockImplementation(
          (url) => {
            throw createRedirectError(
              url
            );
          }
        );

      mocks.sendPayoutStatusEmail
        .mockResolvedValue(
          undefined
        );
    });

    describe(
      'approvePayoutRequest',
      () => {
        it(
          'rejects an invalid payout request ID before authentication',
          async () => {
            const actionPromise =
              approvePayoutRequest(
                createFormData({
                  payout_request_id:
                    'invalid-id'
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?error=The+payout+request+ID+is+invalid.'
            });

            expect(
              mocks.createClient
            ).not.toHaveBeenCalled();

            expect(
              mocks.sendPayoutStatusEmail
            ).not.toHaveBeenCalled();

            expect(
              mocks.revalidatePath
            ).not.toHaveBeenCalled();
          }
        );

        it(
          'redirects an unauthenticated user to login',
          async () => {
            const {
              rpc
            } = configureSupabase({
              user: null,

              authError: {
                message:
                  'No active session.'
              }
            });

            const actionPromise =
              approvePayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/login'
            });

            expect(rpc)
              .not.toHaveBeenCalled();

            expect(
              mocks.sendPayoutStatusEmail
            ).not.toHaveBeenCalled();
          }
        );

        it(
          'approves a payout, sends its email, and revalidates both dashboards',
          async () => {
            const {
              rpc
            } = configureSupabase();

            const actionPromise =
              approvePayoutRequest(
                createFormData({
                  payout_request_id:
                    `  ${PAYOUT_REQUEST_ID}  `
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?success=The+payout+request+was+approved.'
            });

            expect(rpc)
              .toHaveBeenCalledTimes(1);

            expect(rpc)
              .toHaveBeenCalledWith(
                'approve_producer_payout',
                {
                  target_payout_request_id:
                    PAYOUT_REQUEST_ID
                }
              );

            expect(
              mocks.sendPayoutStatusEmail
            ).toHaveBeenCalledTimes(1);

            expect(
              mocks.sendPayoutStatusEmail
            ).toHaveBeenCalledWith({
              payoutRequestId:
                PAYOUT_REQUEST_ID,

              eventType:
                'approved',

              baseUrl:
                'https://beatmarket.example'
            });

            expect(
              mocks.revalidatePath
            ).toHaveBeenCalledTimes(2);

            expect(
              mocks.revalidatePath
            ).toHaveBeenNthCalledWith(
              1,
              '/admin/payouts'
            );

            expect(
              mocks.revalidatePath
            ).toHaveBeenNthCalledWith(
              2,
              '/dashboard'
            );
          }
        );

        it(
          'uses the RPC error message when approval fails',
          async () => {
            const consoleErrorSpy =
              vi.spyOn(
                console,
                'error'
              )
                .mockImplementation(
                  () => {}
                );

            const approvalError = {
              message:
                'Only pending payout requests can be approved.'
            };

            configureSupabase({
              rpcImplementation:
                async () => ({
                  data: null,

                  error:
                    approvalError
                })
            });

            const actionPromise =
              approvePayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?error=Only+pending+payout+requests+can+be+approved.'
            });

            expect(
              consoleErrorSpy
            ).toHaveBeenCalledWith(
              'Payout approval error:',
              approvalError
            );

            expect(
              mocks.sendPayoutStatusEmail
            ).not.toHaveBeenCalled();

            expect(
              mocks.revalidatePath
            ).not.toHaveBeenCalled();

            consoleErrorSpy
              .mockRestore();
          }
        );
      }
    );

    describe(
      'rejectPayoutRequest',
      () => {
        it(
          'rejects an invalid rejection reason before authentication',
          async () => {
            const actionPromise =
              rejectPayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID,

                  rejection_reason:
                    'A'
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?error=Enter+a+rejection+reason+between+2+and+500+characters.'
            });

            expect(
              mocks.createClient
            ).not.toHaveBeenCalled();

            expect(
              mocks.sendPayoutStatusEmail
            ).not.toHaveBeenCalled();
          }
        );

        it(
          'rejects a payout with a trimmed reason and sends its email',
          async () => {
            const {
              rpc
            } = configureSupabase();

            const actionPromise =
              rejectPayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID,

                  rejection_reason:
                    '  Bank details could not be verified.  '
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?success=The+payout+request+was+rejected.'
            });

            expect(rpc)
              .toHaveBeenCalledTimes(1);

            expect(rpc)
              .toHaveBeenCalledWith(
                'reject_producer_payout',
                {
                  target_payout_request_id:
                    PAYOUT_REQUEST_ID,

                  rejection_reason_value:
                    'Bank details could not be verified.'
                }
              );

            expect(
              mocks.sendPayoutStatusEmail
            ).toHaveBeenCalledWith({
              payoutRequestId:
                PAYOUT_REQUEST_ID,

              eventType:
                'rejected',

              baseUrl:
                'https://beatmarket.example'
            });

            expect(
              mocks.revalidatePath
            ).toHaveBeenNthCalledWith(
              1,
              '/admin/payouts'
            );

            expect(
              mocks.revalidatePath
            ).toHaveBeenNthCalledWith(
              2,
              '/dashboard'
            );
          }
        );

        it(
          'uses a safe fallback when rejection fails without an error message',
          async () => {
            const consoleErrorSpy =
              vi.spyOn(
                console,
                'error'
              )
                .mockImplementation(
                  () => {}
                );

            configureSupabase({
              rpcImplementation:
                async () => ({
                  data: null,
                  error: {}
                })
            });

            const actionPromise =
              rejectPayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID,

                  rejection_reason:
                    'Invalid banking details.'
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?error=The+payout+request+could+not+be+rejected.'
            });

            expect(
              mocks.sendPayoutStatusEmail
            ).not.toHaveBeenCalled();

            expect(
              mocks.revalidatePath
            ).not.toHaveBeenCalled();

            consoleErrorSpy
              .mockRestore();
          }
        );
      }
    );

    describe(
      'completePayoutRequest',
      () => {
        it(
          'rejects an invalid bank transfer reference before authentication',
          async () => {
            const actionPromise =
              completePayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID,

                  bank_transfer_reference:
                    'A'
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?error=Enter+a+bank+transfer+reference+between+2+and+250+characters.'
            });

            expect(
              mocks.createClient
            ).not.toHaveBeenCalled();

            expect(
              mocks.sendPayoutStatusEmail
            ).not.toHaveBeenCalled();
          }
        );

        it(
          'marks a payout as paid and sends its email',
          async () => {
            const {
              rpc
            } = configureSupabase();

            const actionPromise =
              completePayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID,

                  bank_transfer_reference:
                    '  BANK-TRANSFER-2026-001  '
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?success=The+payout+request+was+marked+as+paid.'
            });

            expect(rpc)
              .toHaveBeenCalledTimes(1);

            expect(rpc)
              .toHaveBeenCalledWith(
                'complete_producer_payout',
                {
                  target_payout_request_id:
                    PAYOUT_REQUEST_ID,

                  bank_transfer_reference_value:
                    'BANK-TRANSFER-2026-001'
                }
              );

            expect(
              mocks.sendPayoutStatusEmail
            ).toHaveBeenCalledWith({
              payoutRequestId:
                PAYOUT_REQUEST_ID,

              eventType:
                'paid',

              baseUrl:
                'https://beatmarket.example'
            });

            expect(
              mocks.revalidatePath
            ).toHaveBeenNthCalledWith(
              1,
              '/admin/payouts'
            );

            expect(
              mocks.revalidatePath
            ).toHaveBeenNthCalledWith(
              2,
              '/dashboard'
            );
          }
        );

        it(
          'uses the RPC error message when completion fails',
          async () => {
            const consoleErrorSpy =
              vi.spyOn(
                console,
                'error'
              )
                .mockImplementation(
                  () => {}
                );

            const completionError = {
              message:
                'Only approved payout requests can be completed.'
            };

            configureSupabase({
              rpcImplementation:
                async () => ({
                  data: null,

                  error:
                    completionError
                })
            });

            const actionPromise =
              completePayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID,

                  bank_transfer_reference:
                    'BANK-TRANSFER-2026-001'
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?error=Only+approved+payout+requests+can+be+completed.'
            });

            expect(
              consoleErrorSpy
            ).toHaveBeenCalledWith(
              'Payout completion error:',
              completionError
            );

            expect(
              mocks.sendPayoutStatusEmail
            ).not.toHaveBeenCalled();

            expect(
              mocks.revalidatePath
            ).not.toHaveBeenCalled();

            consoleErrorSpy
              .mockRestore();
          }
        );

        it(
          'passes a null email base URL when the site URL is not configured',
          async () => {
            delete process.env.NEXT_PUBLIC_SITE_URL;

            configureSupabase();

            const actionPromise =
              completePayoutRequest(
                createFormData({
                  payout_request_id:
                    PAYOUT_REQUEST_ID,

                  bank_transfer_reference:
                    'BANK-TRANSFER-2026-002'
                })
              );

            await expect(
              actionPromise
            ).rejects.toMatchObject({
              message:
                'NEXT_REDIRECT',

              url:
                '/admin/payouts?success=The+payout+request+was+marked+as+paid.'
            });

            expect(
              mocks.sendPayoutStatusEmail
            ).toHaveBeenCalledWith({
              payoutRequestId:
                PAYOUT_REQUEST_ID,

              eventType:
                'paid',

              baseUrl:
                null
            });
          }
        );
      }
    );
  }
);