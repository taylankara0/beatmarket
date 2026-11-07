import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createServerClient: vi.fn(),
  cookies: vi.fn(),
  consumeApiRateLimit: vi.fn(),
  getUser: vi.fn(),
  adminFrom: vi.fn(),
  beatSelect: vi.fn(),
  beatEq: vi.fn(),
  beatMaybeSingle: vi.fn(),
  r2Send: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock(
  '@aws-sdk/client-s3',
  () => ({
    GetObjectCommand:
      class GetObjectCommandMock {
        constructor(input) {
          this.input = input;
        }
      },

    HeadObjectCommand:
      class HeadObjectCommandMock {
        constructor(input) {
          this.input = input;
        }
      },
  })
);

vi.mock(
  '@aws-sdk/s3-request-presigner',
  () => ({
    getSignedUrl: mocks.getSignedUrl,
  })
);

vi.mock(
  '@supabase/supabase-js',
  () => ({
    createClient:
      mocks.createSupabaseAdminClient,
  })
);

vi.mock(
  '@supabase/ssr',
  () => ({
    createServerClient:
      mocks.createServerClient,
  })
);

vi.mock(
  'next/headers',
  () => ({
    cookies: mocks.cookies,
  })
);

vi.mock(
  '@/lib/apiRateLimit',
  () => ({
    consumeApiRateLimit:
      mocks.consumeApiRateLimit,
  })
);

vi.mock(
  '@/lib/freeBeatLicense',
  () => ({
    FREE_BEAT_LICENSE_VERSION:
      'free-noncommercial-v1',

    isAcceptedFreeBeatLicenseVersion:
      (value) =>
        value === 'free-noncommercial-v1',
  })
);

vi.mock(
  '@/lib/r2',
  () => ({
    r2Client: {
      send: mocks.r2Send,
    },
  })
);

import { POST } from './route';

const VALID_BEAT_ID =
  '11111111-1111-4111-8111-111111111111';

const VALID_USER_ID =
  '22222222-2222-4222-8222-222222222222';

const VALID_BEAT = {
  id: VALID_BEAT_ID,
  title: 'Free Test Beat',
  producer_id:
    '33333333-3333-4333-8333-333333333333',
  untagged_file_key:
    'test/master/free-test-beat.mp3',
  is_sold_exclusive: false,
  is_free_download_enabled: true,
  is_published: true,
};

function createRequest() {
  return new Request(
    `http://localhost:3000/api/beats/${VALID_BEAT_ID}/free-download`,
    {
      method: 'POST',

      headers: {
        'content-type':
          'application/json',
      },

      body: JSON.stringify({
        accepted: true,

        licenseVersion:
          'free-noncommercial-v1',
      }),
    }
  );
}

function createContext() {
  return {
    params: Promise.resolve({
      beatId: VALID_BEAT_ID,
    }),
  };
}

async function sendRequest() {
  const response = await POST(
    createRequest(),
    createContext()
  );

  const body = await response.json();

  expect(
    response.headers.get('cache-control')
  ).toBe('no-store');

  return {
    response,
    body,
  };
}

function expectNoSecureDownload() {
  expect(
    mocks.getSignedUrl
  ).not.toHaveBeenCalled();

  expect(
    mocks.adminFrom
  ).not.toHaveBeenCalledWith(
    'free_beat_downloads'
  );
}

describe(
  'POST /api/beats/[beatId]/free-download availability',
  () => {
    beforeEach(() => {
      vi.resetAllMocks();

      process.env.NEXT_PUBLIC_SUPABASE_URL =
        'https://test.supabase.co';

      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
        'test-anon-key';

      process.env.SUPABASE_SERVICE_ROLE_KEY =
        'test-service-role-key';

      process.env.R2_BUCKET_NAME =
        'test-private-bucket';

      mocks.cookies.mockResolvedValue({
        getAll: vi.fn().mockReturnValue([]),
        set: vi.fn(),
      });

      mocks.getUser.mockResolvedValue({
        data: {
          user: {
            id: VALID_USER_ID,
          },
        },

        error: null,
      });

      mocks.createServerClient
        .mockReturnValue({
          auth: {
            getUser: mocks.getUser,
          },
        });

      mocks.createSupabaseAdminClient
        .mockReturnValue({
          from: mocks.adminFrom,
        });

      mocks.consumeApiRateLimit
        .mockResolvedValue({
          allowed: true,
          retryAfterSeconds: 0,
        });

      mocks.beatMaybeSingle
        .mockResolvedValue({
          data: {
            ...VALID_BEAT,
          },

          error: null,
        });

      mocks.beatEq.mockReturnValue({
        maybeSingle:
          mocks.beatMaybeSingle,
      });

      mocks.beatSelect.mockReturnValue({
        eq: mocks.beatEq,
      });

      mocks.adminFrom.mockImplementation(
        (table) => {
          if (table === 'beats') {
            return {
              select: mocks.beatSelect,
            };
          }

          throw new Error(
            `Unexpected table access: ${table}`
          );
        }
      );
    });

    it(
      'returns 404 when the beat does not exist',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValue({
            data: null,
            error: null,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(404);

        expect(body).toEqual({
          success: false,
          error: 'Beat not found.',
        });

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expectNoSecureDownload();
      }
    );

    it(
      'blocks downloads of unpublished beats',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValue({
            data: {
              ...VALID_BEAT,
              is_published: false,
              is_free_download_enabled: true,
            },

            error: null,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(404);

        expect(body).toEqual({
          success: false,
          error: 'Beat not found.',
        });

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();

        expectNoSecureDownload();
      }
    );

    it(
      'blocks free downloads for sold-exclusive beats',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValue({
            data: {
              ...VALID_BEAT,
              is_sold_exclusive: true,
            },

            error: null,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'This beat is no longer available for free download.',
        });

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expectNoSecureDownload();
      }
    );

    it(
      'blocks downloads when the producer has disabled them',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValue({
            data: {
              ...VALID_BEAT,

              is_free_download_enabled:
                false,
            },

            error: null,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'Free downloads are currently disabled for this beat.',
        });

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expectNoSecureDownload();
      }
    );

    it(
      'rejects beats without a master file key',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValue({
            data: {
              ...VALID_BEAT,

              untagged_file_key: null,
            },

            error: null,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(404);

        expect(body).toEqual({
          success: false,

          error:
            'The free-download master file is not available.',
        });

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expectNoSecureDownload();
      }
    );

    it(
      'rejects downloads when the private master file cannot be found',
      async () => {
        mocks.r2Send.mockRejectedValue(
          new Error(
            'NoSuchKey: Object not found'
          )
        );

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(404);

        expect(body).toEqual({
          success: false,

          error:
            'The free-download master file could not be found in private storage.',
        });

        expect(
          mocks.r2Send
        ).toHaveBeenCalledTimes(1);

        expectNoSecureDownload();
      }
    );

    it(
      'returns a generic server error when the beat lookup fails',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValue({
            data: null,

            error: {
              message:
                'Temporary database failure',
            },
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(500);

        expect(body).toEqual({
          success: false,

          error:
            'The secure free-download link could not be generated.',
        });

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();

        expectNoSecureDownload();
      }
    );
  }
);