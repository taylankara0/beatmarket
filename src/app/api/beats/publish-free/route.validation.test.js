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
  revalidatePath: vi.fn(),
  getUser: vi.fn(),
  profileFrom: vi.fn(),
  profileSelect: vi.fn(),
  profileEq: vi.fn(),
  profileMaybeSingle: vi.fn(),
  adminFrom: vi.fn(),
  r2Send: vi.fn(),
}));

vi.mock(
  '@aws-sdk/client-s3',
  () => ({
    HeadObjectCommand:
      class HeadObjectCommandMock {
        constructor(input) {
          this.input = input;
        }
      },
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
  'next/cache',
  () => ({
    revalidatePath:
      mocks.revalidatePath,
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
  '@/lib/r2',
  () => ({
    r2Client: {
      send: mocks.r2Send,
    },
  })
);

import { POST } from './route';

const VALID_USER_ID =
  '22222222-2222-4222-8222-222222222222';

const OTHER_USER_ID =
  '33333333-3333-4333-8333-333333333333';

const VALID_BODY = {
  title: 'Test Free Beat',
  bpm: 120,

  previewKey:
    `masters/${VALID_USER_ID}/2026/11/preview/test.mp3`,

  masterKey:
    `masters/${VALID_USER_ID}/2026/11/master/test.wav`,
};

function createRequest({
  body = JSON.stringify(VALID_BODY),
  contentType = 'application/json',
  contentLength,
} = {}) {
  const headers = {};

  if (contentType !== null) {
    headers['content-type'] =
      contentType;
  }

  if (contentLength !== undefined) {
    headers['content-length'] =
      String(contentLength);
  }

  return new Request(
    'http://localhost:3000/api/beats/publish-free',
    {
      method: 'POST',
      headers,

      ...(body !== null
        ? { body }
        : {}),
    }
  );
}

async function sendRequest(options) {
  const response = await POST(
    createRequest(options)
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

function expectNoPublishing() {
  expect(
    mocks.adminFrom
  ).not.toHaveBeenCalled();

  expect(
    mocks.r2Send
  ).not.toHaveBeenCalled();

  expect(
    mocks.revalidatePath
  ).not.toHaveBeenCalled();
}

describe(
  'POST /api/beats/publish-free request validation',
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
        getAll: vi
          .fn()
          .mockReturnValue([]),

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

      mocks.profileMaybeSingle
        .mockResolvedValue({
          data: {
            is_producer: true,
            username: 'testproducer',
          },

          error: null,
        });

      mocks.profileEq.mockReturnValue({
        maybeSingle:
          mocks.profileMaybeSingle,
      });

      mocks.profileSelect.mockReturnValue({
        eq: mocks.profileEq,
      });

      mocks.profileFrom.mockImplementation(
        (table) => {
          if (table === 'profiles') {
            return {
              select: mocks.profileSelect,
            };
          }

          throw new Error(
            `Unexpected table: ${table}`
          );
        }
      );

      mocks.createServerClient
        .mockReturnValue({
          auth: {
            getUser: mocks.getUser,
          },

          from: mocks.profileFrom,
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
      'rejects requests with an invalid content type',
      async () => {
        const { response, body } =
          await sendRequest({
            contentType: 'text/plain',
          });

        expect(response.status).toBe(415);

        expect(body).toEqual({
          success: false,

          error:
            'The free beat publishing request must use application/json.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects malformed JSON',
      async () => {
        const { response, body } =
          await sendRequest({
            body: '{"title":',
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,

          error:
            'The free beat publishing request body is invalid.',
        });

        expectNoPublishing();
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
            'The free beat publishing request body is invalid.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects request bodies larger than 32 KB',
      async () => {
        const oversizedBody =
          JSON.stringify({
            ...VALID_BODY,
            extra: 'x'.repeat(33000),
          });

        const { response, body } =
          await sendRequest({
            body: oversizedBody,
          });

        expect(response.status).toBe(413);

        expect(body).toEqual({
          success: false,

          error:
            'The free beat publishing request body is too large.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects invalid content-length headers',
      async () => {
        const { response, body } =
          await sendRequest({
            contentLength: 'invalid',
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,

          error:
            'The free beat publishing request body length is invalid.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects declared request bodies larger than 32 KB',
      async () => {
        const { response, body } =
          await sendRequest({
            contentLength: 40000,
          });

        expect(response.status).toBe(413);

        expect(body).toEqual({
          success: false,

          error:
            'The free beat publishing request body is too large.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects empty beat titles',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              ...VALID_BODY,
              title: '   ',
            }),
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,

          error:
            'Beat title must contain between 1 and 120 characters.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects titles longer than 120 characters',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              ...VALID_BODY,
              title: 'A'.repeat(121),
            }),
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,

          error:
            'Beat title must contain between 1 and 120 characters.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects invalid BPM values',
      async () => {
        const invalidValues = [
          -1,
          0,
          401,
          120.5,
          'invalid',
        ];

        for (const bpm of invalidValues) {
          const { response, body } =
            await sendRequest({
              body: JSON.stringify({
                ...VALID_BODY,
                bpm,
              }),
            });

          expect(response.status).toBe(400);

          expect(body).toEqual({
            success: false,

            error:
              'BPM must be a whole number between 1 and 400.',
          });
        }

        expectNoPublishing();
      }
    );

    it(
      'rejects missing storage keys',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              title: 'Test Free Beat',
              bpm: 120,
            }),
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,

          error:
            'The preview or master storage key is missing.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects using the same file for preview and master',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              ...VALID_BODY,

              masterKey:
                VALID_BODY.previewKey,
            }),
          });

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,

          error:
            'The preview and master tracks must be different files.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects storage keys belonging to another user',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              ...VALID_BODY,

              previewKey:
                `masters/${OTHER_USER_ID}/2026/11/preview/test.mp3`,
            }),
          });

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'One or more uploaded files do not belong to your account or have an invalid upload role.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects storage keys with incorrect upload roles',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              ...VALID_BODY,

              masterKey:
                `masters/${VALID_USER_ID}/2026/11/preview/master.wav`,
            }),
          });

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'One or more uploaded files do not belong to your account or have an invalid upload role.',
        });

        expectNoPublishing();
      }
    );

    it(
      'rejects storage keys with invalid folder structure',
      async () => {
        const { response, body } =
          await sendRequest({
            body: JSON.stringify({
              ...VALID_BODY,

              previewKey:
                'invalid/path/preview.mp3',
            }),
          });

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'One or more uploaded files do not belong to your account or have an invalid upload role.',
        });

        expectNoPublishing();
      }
    );
  }
);