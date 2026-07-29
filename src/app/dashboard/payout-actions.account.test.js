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
  saveProducerPayoutAccount
} from './payout-actions';

function createRedirectError(url) {
  const error =
    new Error('NEXT_REDIRECT');

  error.url = url;

  return error;
}

function createFormData({
  accountHolderName,
  iban
}) {
  const formData =
    new FormData();

  if (
    accountHolderName !==
    undefined
  ) {
    formData.set(
      'account_holder_name',
      accountHolderName
    );
  }

  if (iban !== undefined) {
    formData.set(
      'iban',
      iban
    );
  }

  return formData;
}

function configureSupabase({
  user = {
    id: 'producer-user-1'
  },

  authError = null,

  profile = {
    is_producer: true
  },

  profileError = null,

  payoutAccountError = null
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

  const maybeSingle = vi
    .fn()
    .mockResolvedValue({
      data:
        profile,

      error:
        profileError
    });

  const profileEq = vi
    .fn()
    .mockReturnValue({
      maybeSingle
    });

  const profileSelect = vi
    .fn()
    .mockReturnValue({
      eq:
        profileEq
    });

  const upsert = vi
    .fn()
    .mockResolvedValue({
      error:
        payoutAccountError
    });

  const from = vi.fn(
    (tableName) => {
      if (
        tableName ===
        'profiles'
      ) {
        return {
          select:
            profileSelect
        };
      }

      if (
        tableName ===
        'producer_payout_accounts'
      ) {
        return {
          upsert
        };
      }

      throw new Error(
        `Unexpected table access: ${tableName}`
      );
    }
  );

  const supabase = {
    auth: {
      getUser
    },

    from
  };

  mocks.createClient
    .mockResolvedValue(
      supabase
    );

  return {
    supabase,
    getUser,
    from,
    profileSelect,
    profileEq,
    maybeSingle,
    upsert
  };
}

describe(
  'saveProducerPayoutAccount',
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
          from
        } = configureSupabase({
          user: null,

          authError: {
            message:
              'No active session.'
          }
        });

        const actionPromise =
          saveProducerPayoutAccount(
            createFormData({
              accountHolderName:
                'Taylan Kara',

              iban:
                'TR123456789012345678901234'
            })
          );

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

        expect(from)
          .not.toHaveBeenCalled();
      }
    );

    it(
      'rejects an invalid account holder name before database access',
      async () => {
        const {
          from
        } = configureSupabase();

        const actionPromise =
          saveProducerPayoutAccount(
            createFormData({
              accountHolderName:
                'A',

              iban:
                'TR123456789012345678901234'
            })
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=Enter+a+valid+account+holder+name.'
        });

        expect(from)
          .not.toHaveBeenCalled();
      }
    );

    it(
      'rejects an invalid Turkish IBAN before database access',
      async () => {
        const {
          from
        } = configureSupabase();

        const actionPromise =
          saveProducerPayoutAccount(
            createFormData({
              accountHolderName:
                'Taylan Kara',

              iban:
                'TR123'
            })
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=Enter+a+valid+Turkish+IBAN.'
        });

        expect(from)
          .not.toHaveBeenCalled();
      }
    );

    it(
      'allows only an active producer to save payout details',
      async () => {
        const {
          profileEq,
          upsert
        } = configureSupabase({
          profile: {
            is_producer: false
          }
        });

        const actionPromise =
          saveProducerPayoutAccount(
            createFormData({
              accountHolderName:
                'Taylan Kara',

              iban:
                'TR123456789012345678901234'
            })
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=Only+active+producers+can+save+payout+details.'
        });

        expect(profileEq)
          .toHaveBeenCalledWith(
            'id',
            'producer-user-1'
          );

        expect(upsert)
          .not.toHaveBeenCalled();
      }
    );

    it(
      'normalizes and saves valid producer payout details',
      async () => {
        const {
          upsert
        } = configureSupabase();

        const actionPromise =
          saveProducerPayoutAccount(
            createFormData({
              accountHolderName:
                '  Taylan    Kara  ',

              iban:
                'tr12 3456 7890 1234 5678 9012 34'
            })
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?success=Your+payout+account+was+saved.'
        });

        expect(upsert)
          .toHaveBeenCalledTimes(1);

        expect(upsert)
          .toHaveBeenCalledWith(
            {
              producer_id:
                'producer-user-1',

              account_holder_name:
                'Taylan Kara',

              iban:
                'TR123456789012345678901234',

              currency:
                'TRY'
            },
            {
              onConflict:
                'producer_id'
            }
          );

        expect(
          mocks.redirect
        ).toHaveBeenLastCalledWith(
          '/dashboard?success=Your+payout+account+was+saved.'
        );
      }
    );

    it(
      'redirects with a safe error when payout account saving fails',
      async () => {
        const consoleErrorSpy =
          vi.spyOn(
            console,
            'error'
          )
            .mockImplementation(
              () => {}
            );

        const payoutAccountError = {
          message:
            'Database write failed.'
        };

        const {
          upsert
        } = configureSupabase({
          payoutAccountError
        });

        const actionPromise =
          saveProducerPayoutAccount(
            createFormData({
              accountHolderName:
                'Taylan Kara',

              iban:
                'TR123456789012345678901234'
            })
          );

        await expect(
          actionPromise
        ).rejects.toMatchObject({
          message:
            'NEXT_REDIRECT',

          url:
            '/dashboard?error=Your+payout+account+could+not+be+saved.'
        });

        expect(upsert)
          .toHaveBeenCalledTimes(1);

        expect(
          consoleErrorSpy
        ).toHaveBeenCalledWith(
          'Payout account saving error:',
          payoutAccountError
        );

        consoleErrorSpy
          .mockRestore();
      }
    );
  }
);