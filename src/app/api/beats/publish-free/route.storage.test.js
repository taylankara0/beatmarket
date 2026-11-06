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
  profileMaybeSingle: vi.fn(),
  adminFrom: vi.fn(),
  beatSelect: vi.fn(),
  beatEq: vi.fn(),
  beatLimit: vi.fn(),
  beatMaybeSingle: vi.fn(),
  beatInsert: vi.fn(),
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

const USER_ID =
  '22222222-2222-4222-8222-222222222222';

const OTHER_USER_ID =
  '33333333-3333-4333-8333-333333333333';

const PREVIEW_KEY =
  `masters/${USER_ID}/2026/11/preview/test.mp3`;

const MASTER_KEY =
  `masters/${USER_ID}/2026/11/master/test.wav`;

const VALID_BODY = {
  title: 'Storage Test Beat',
  bpm: 120,
  previewKey: PREVIEW_KEY,
  masterKey: MASTER_KEY,
};

const VALID_PREVIEW_OBJECT = {
  ContentLength: 2048,
  ContentType: 'audio/mpeg',

  Metadata: {
    owner: USER_ID,
    uploadtype: 'preview',
    expectedbytes: '2048',
  },
};

const VALID_MASTER_OBJECT = {
  ContentLength: 8192,
  ContentType: 'audio/wav',

  Metadata: {
    owner: USER_ID,
    uploadtype: 'master',
    expectedbytes: '8192',
  },
};

function createRequest() {
  return new Request(
    'http://localhost:3000/api/beats/publish-free',
    {
      method: 'POST',

      headers: {
        'content-type':
          'application/json',
      },

      body: JSON.stringify(
        VALID_BODY
      ),
    }
  );
}

async function sendRequest() {
  const response = await POST(
    createRequest()
  );

  const body = await response.json();

  expect(
    response.headers.get(
      'cache-control'
    )
  ).toBe('no-store');

  return {
    response,
    body,
  };
}

function configureStorageObjects(
  previewObject = VALID_PREVIEW_OBJECT,
  masterObject = VALID_MASTER_OBJECT
) {
  mocks.r2Send.mockImplementation(
    async (command) => {
      const key =
        command.input.Key;

      if (key === PREVIEW_KEY) {
        return previewObject;
      }

      if (key === MASTER_KEY) {
        return masterObject;
      }

      throw new Error(
        'Unexpected storage key.'
      );
    }
  );
}

function expectPublishingRejected(
  response,
  body,
  status,
  error
) {
  expect(response.status).toBe(
    status
  );

  expect(body).toEqual({
    success: false,
    error,
  });

  expect(
    mocks.beatInsert
  ).not.toHaveBeenCalled();

  expect(
    mocks.revalidatePath
  ).not.toHaveBeenCalled();
}

describe(
  'POST /api/beats/publish-free storage security',
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
            id: USER_ID,
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

      mocks.profileFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle:
              mocks.profileMaybeSingle,
          }),
        }),
      });

      mocks.createServerClient
        .mockReturnValue({
          auth: {
            getUser:
              mocks.getUser,
          },

          from:
            mocks.profileFrom,
        });

      mocks.createSupabaseAdminClient
        .mockReturnValue({
          from:
            mocks.adminFrom,
        });

      mocks.consumeApiRateLimit
        .mockResolvedValue({
          allowed: true,
          retryAfterSeconds: 0,
        });

      mocks.beatMaybeSingle
        .mockResolvedValue({
          data: null,
          error: null,
        });

      mocks.beatLimit.mockReturnValue({
        maybeSingle:
          mocks.beatMaybeSingle,
      });

      mocks.beatEq.mockReturnValue({
        limit:
          mocks.beatLimit,
      });

      mocks.beatSelect.mockReturnValue({
        eq:
          mocks.beatEq,
      });

      mocks.adminFrom.mockImplementation(
        (table) => {
          if (table === 'beats') {
            return {
              select:
                mocks.beatSelect,

              insert:
                mocks.beatInsert,
            };
          }

          throw new Error(
            `Unexpected table: ${table}`
          );
        }
      );

      configureStorageObjects();
    });

    it(
      'rejects a previously used preview file',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValueOnce({
            data: {
              id: 'existing-beat',
            },

            error: null,
          })
          .mockResolvedValueOnce({
            data: null,
            error: null,
          });

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          409,
          'One or more uploaded files have already been used to publish a beat.'
        );

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects a previously used master file',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValueOnce({
            data: null,
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: 'existing-beat',
            },

            error: null,
          });

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          409,
          'One or more uploaded files have already been used to publish a beat.'
        );

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects publishing when the file reuse check fails',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValueOnce({
            data: null,

            error: {
              message:
                'Database lookup failed.',
            },
          });

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          500,
          'The uploaded file usage could not be verified.'
        );

        expect(
          mocks.r2Send
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'rejects publishing when a stored audio file is missing',
      async () => {
        mocks.r2Send
          .mockRejectedValue(
            new Error(
              'NoSuchKey'
            )
          );

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'One or more uploaded audio files could not be found in private storage.'
        );
      }
    );

    it(
      'rejects incorrect file ownership metadata',
      async () => {
        configureStorageObjects({
          ...VALID_PREVIEW_OBJECT,

          Metadata: {
            ...VALID_PREVIEW_OBJECT.Metadata,

            owner:
              OTHER_USER_ID,
          },
        });

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The preview file ownership metadata is invalid.'
        );
      }
    );

    it(
      'rejects incorrect upload role metadata',
      async () => {
        configureStorageObjects({
          ...VALID_PREVIEW_OBJECT,

          Metadata: {
            ...VALID_PREVIEW_OBJECT.Metadata,

            uploadtype:
              'master',
          },
        });

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The stored file is not authorized as a preview upload.'
        );
      }
    );

    it(
      'rejects preview files with missing expected-size metadata',
      async () => {
        configureStorageObjects({
          ...VALID_PREVIEW_OBJECT,

          Metadata: {
            owner: USER_ID,
            uploadtype: 'preview',
          },
        });

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The preview file is missing its expected-size metadata.'
        );
      }
    );

    it(
      'rejects master files whose sizes do not match authorized metadata',
      async () => {
        configureStorageObjects(
          VALID_PREVIEW_OBJECT,
          {
            ...VALID_MASTER_OBJECT,

            ContentLength: 9000,
          }
        );

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The actual master file size does not match its authorized size.'
        );
      }
    );

    it(
      'rejects preview files exceeding 25 MB',
      async () => {
        const oversizedBytes =
          26 * 1024 * 1024;

        configureStorageObjects({
          ...VALID_PREVIEW_OBJECT,

          ContentLength:
            oversizedBytes,

          Metadata: {
            ...VALID_PREVIEW_OBJECT.Metadata,

            expectedbytes:
              String(oversizedBytes),
          },
        });

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The preview file exceeds the 25 MB limit.'
        );
      }
    );

    it(
      'rejects master files exceeding 250 MB',
      async () => {
        const oversizedBytes =
          251 * 1024 * 1024;

        configureStorageObjects(
          VALID_PREVIEW_OBJECT,
          {
            ...VALID_MASTER_OBJECT,

            ContentLength:
              oversizedBytes,

            Metadata: {
              ...VALID_MASTER_OBJECT.Metadata,

              expectedbytes:
                String(oversizedBytes),
            },
          }
        );

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The master file exceeds the 250 MB limit.'
        );
      }
    );

    it(
      'rejects preview files that are not valid MP3 audio',
      async () => {
        configureStorageObjects({
          ...VALID_PREVIEW_OBJECT,

          ContentType:
            'audio/wav',
        });

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The streaming preview must be a valid MP3 file.'
        );
      }
    );

    it(
      'rejects unsupported master audio content types',
      async () => {
        configureStorageObjects(
          VALID_PREVIEW_OBJECT,
          {
            ...VALID_MASTER_OBJECT,

            ContentType:
              'text/plain',
          }
        );

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The master track must be a valid MP3, WAV, or FLAC file.'
        );
      }
    );

    it(
      'rejects empty master files',
      async () => {
        configureStorageObjects(
          VALID_PREVIEW_OBJECT,
          {
            ...VALID_MASTER_OBJECT,

            ContentLength: 0,
          }
        );

        const { response, body } =
          await sendRequest();

        expectPublishingRejected(
          response,
          body,
          400,
          'The master file is empty or has an invalid size.'
        );
      }
    );
  }
);