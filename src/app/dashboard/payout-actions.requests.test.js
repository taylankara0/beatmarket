import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn()
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

import {
  cancelProducerPayout,
  requestProducerPayout
} from './payout-actions';

function createRedirectError(url) {
  const error =
    new Error('NEXT_REDIRECT');

  error.url = url;

  return error;
}

function createCancellationFormData(
  payoutRequestId
) {
  const formData =
    new FormData();

  if (
    payoutRequestId !==
    undefined
  ) {
    formData.set(
      'payout_request_id',
      payoutRequestId
    );
  }

  return formData;
}

function configureSupabase({
  user = {
    id: 'producer-user-1'
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
  'requestProducerPayout',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

      mocks.redirect
        .mockImplementation(
          (url) => {
            throw createRedirectError(
              url
            );
          }
        );
    });

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
          requestProducerPayout();

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url: '/login'
        });

        expect(
          mocks.redirect
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.redirect
        ).toHaveBeenCalledWith(
          '/login'
        );

        expect(rpc)
          .not.toHaveBeenCalled();
      }
    );

    it(
      'submits a producer payout request successfully',
      async () => {
        const {
          rpc
        } = configureSupabase();

        const actionPromise =
          requestProducerPayout();

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?success=Your+payout+request+was+submitted.'
        });

        expect(rpc)
          .toHaveBeenCalledTimes(1);

        expect(rpc)
          .toHaveBeenCalledWith(
            'request_producer_payout'
          );

        expect(
          mocks.redirect
        ).toHaveBeenLastCalledWith(
          '/dashboard?success=Your+payout+request+was+submitted.'
        );
      }
    );

    it(
      'uses the RPC error message when payout request creation fails',
      async () => {
        const consoleErrorSpy =
          vi.spyOn(
            console,
            'error'
          )
            .mockImplementation(
              () => {}
            );

        const payoutRequestError = {
          message:
            'No available earnings can be paid out.'
        };

        const {
          rpc
        } = configureSupabase({
          rpcImplementation:
            async (
              functionName
            ) => {
              if (
                functionName ===
                'request_producer_payout'
              ) {
                return {
                  data: null,

                  error:
                    payoutRequestError
                };
              }

              throw new Error(
                `Unexpected RPC call: ${functionName}`
              );
            }
        });

        const actionPromise =
          requestProducerPayout();

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=No+available+earnings+can+be+paid+out.'
        });

        expect(rpc)
          .toHaveBeenCalledWith(
            'request_producer_payout'
          );

        expect(
          consoleErrorSpy
        ).toHaveBeenCalledWith(
          'Payout request creation error:',
          payoutRequestError
        );

        consoleErrorSpy
          .mockRestore();
      }
    );

    it(
      'uses a safe fallback when the payout request RPC error has no message',
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
          requestProducerPayout();

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=Your+payout+request+could+not+be+created.'
        });

        consoleErrorSpy
          .mockRestore();
      }
    );
  }
);

describe(
  'cancelProducerPayout',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

      mocks.redirect
        .mockImplementation(
          (url) => {
            throw createRedirectError(
              url
            );
          }
        );
    });

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
          cancelProducerPayout(
            createCancellationFormData(
              'payout-request-1'
            )
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url: '/login'
        });

        expect(rpc)
          .not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a missing payout request ID before calling the RPC',
      async () => {
        const {
          rpc
        } = configureSupabase();

        const actionPromise =
          cancelProducerPayout(
            createCancellationFormData(
              '   '
            )
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=The+payout+request+ID+is+missing.'
        });

        expect(rpc)
          .not.toHaveBeenCalled();
      }
    );

    it(
      'cancels a producer payout request successfully',
      async () => {
        const {
          rpc
        } = configureSupabase();

        const actionPromise =
          cancelProducerPayout(
            createCancellationFormData(
              '  payout-request-1  '
            )
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?success=Your+payout+request+was+cancelled.'
        });

        expect(rpc)
          .toHaveBeenCalledTimes(1);

        expect(rpc)
          .toHaveBeenCalledWith(
            'cancel_producer_payout',
            {
              target_payout_request_id:
                'payout-request-1'
            }
          );

        expect(
          mocks.redirect
        ).toHaveBeenLastCalledWith(
          '/dashboard?success=Your+payout+request+was+cancelled.'
        );
      }
    );

    it(
      'uses the RPC error message when payout cancellation fails',
      async () => {
        const consoleErrorSpy =
          vi.spyOn(
            console,
            'error'
          )
            .mockImplementation(
              () => {}
            );

        const cancellationError = {
          message:
            'Only pending payout requests can be cancelled.'
        };

        const {
          rpc
        } = configureSupabase({
          rpcImplementation:
            async (
              functionName
            ) => {
              if (
                functionName ===
                'cancel_producer_payout'
              ) {
                return {
                  data: null,

                  error:
                    cancellationError
                };
              }

              throw new Error(
                `Unexpected RPC call: ${functionName}`
              );
            }
        });

        const actionPromise =
          cancelProducerPayout(
            createCancellationFormData(
              'payout-request-1'
            )
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=Only+pending+payout+requests+can+be+cancelled.'
        });

        expect(rpc)
          .toHaveBeenCalledWith(
            'cancel_producer_payout',
            {
              target_payout_request_id:
                'payout-request-1'
            }
          );

        expect(
          consoleErrorSpy
        ).toHaveBeenCalledWith(
          'Payout cancellation error:',
          cancellationError
        );

        consoleErrorSpy
          .mockRestore();
      }
    );

    it(
      'uses a safe fallback when the cancellation RPC error has no message',
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
          cancelProducerPayout(
            createCancellationFormData(
              'payout-request-1'
            )
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=The+payout+request+could+not+be+cancelled.'
        });

        consoleErrorSpy
          .mockRestore();
      }
    );
  }
);