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
  adminFrom: vi.fn(),
  getUser: vi.fn(),
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

const VALID_LICENSE_BODY = {
  accepted: true,
  licenseVersion: 'free-noncommercial-v1',
};

function createRequest({
  body = JSON.stringify(VALID_LICENSE_BODY),
  contentType = 'application/json',
  contentLength,
} = {}) {
  const headers = {};

  if (contentType !== null) {
    headers['content-type'] = contentType;
  }

  if (contentLength !== undefined) {
    headers['content-length'] =
      String(contentLength);
  }

  return new Request(
    `http://localhost:3000/api/beats/${VALID_BEAT_ID}/free-download`,
    {
      method: 'POST',
      headers,

      ...(body !== null
        ? { body }
        : {}),
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

async function sendRequest(options) {
  const response = await POST(
    createRequest(options),
    createContext()
  );

  const body = await response.json();

  return {
    response,
    body,
  };
}

function expectNoDownloadOperations() {
  expect(
    mocks.adminFrom
  ).not.toHaveBeenCalled();

  expect(
    mocks.r2Send
  ).not.toHaveBeenCalled();

  expect(
    mocks.getSignedUrl
  ).not.toHaveBeenCalled();
}

describe(
  'POST /api/beats/[beatId]/free-download request validation',
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
            id:
              '22222222-2222-4222-8222-222222222222',
          },
        },

        error: null,
      });

      mocks.createServerClient.mockReturnValue({
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
    });

    it(
      'rejects requests without JSON content type',
      async () => {
        const { response, body } =
          await sendRequest({
            contentType: 'text/plain',
          });

        expect(response.status).toBe(415);

        expect(body).toEqual({
          success: false,
          error:
            'The free-download request must use application/json.',
        });

        expectNoDownloadOperations();
      }
    );

    it(
      'rejects malformed JSON',
      async () => {
        const { response, body } =
          await sendRequest({
            body: '{"accepted":true,',
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,
          error:
            'The free-download request body is invalid.',
        });

        expectNoDownloadOperations();
      }
    );

    it(
      'rejects an empty request body',
      async () => {
        const { response, body } =
          await sendRequest({
            body: null,
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,
          error:
            'The free-download request body is invalid.',
        });

        expectNoDownloadOperations();
      }
    );

    it(
      'rejects request bodies larger than 8 KB',
      async () => {
        const oversizedBody = JSON.stringify({
          ...VALID_LICENSE_BODY,

          extra: 'x'.repeat(9000),
        });

        const { response, body } =
          await sendRequest({
            body: oversizedBody,
          });

        expect(response.status).toBe(413);

        expect(body).toEqual({
          success: false,
          error:
            'The free-download request body is too large.',
        });

        expectNoDownloadOperations();
      }
    );

    it(
      'rejects an invalid content-length header',
      async () => {
        const { response, body } =
          await sendRequest({
            contentLength: 'invalid',
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,
          error:
            'The free-download request body length is invalid.',
        });

        expectNoDownloadOperations();
      }
    );

    it(
      'rejects license acceptance that is not explicitly true',
      async () => {
        const invalidAcceptances = [
          false,
          null,
          'true',
          1,
        ];

        for (const accepted of invalidAcceptances) {
          const { response, body } =
            await sendRequest({
              body: JSON.stringify({
                accepted,

                licenseVersion:
                  'free-noncommercial-v1',
              }),
            });

          expect(response.status).toBe(400);

          expect(body).toEqual({
            success: false,
            error:
              'You must accept the free-beat license before downloading.',
          });
        }

        expectNoDownloadOperations();
      }
    );

    it(
      'rejects missing license acceptance',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              licenseVersion:
                'free-noncommercial-v1',
            }),
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,
          error:
            'You must accept the free-beat license before downloading.',
        });

        expectNoDownloadOperations();
      }
    );

    it(
      'rejects an outdated license version',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              accepted: true,

              licenseVersion:
                'free-noncommercial-v0',
            }),
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,
          error:
            'The accepted free-beat license version is invalid or outdated.',
        });

        expectNoDownloadOperations();
      }
    );

    it(
      'rejects a missing license version',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              accepted: true,
            }),
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,
          error:
            'The accepted free-beat license version is invalid or outdated.',
        });

        expectNoDownloadOperations();
      }
    );

    it(
      'sets no-store on validation error responses',
      async () => {
        const { response } =
          await sendRequest({
            body: JSON.stringify({
              accepted: false,

              licenseVersion:
                'free-noncommercial-v1',
            }),
          });

        expect(
          response.headers.get('cache-control')
        ).toBe('no-store');

        expectNoDownloadOperations();
      }
    );
  }
);