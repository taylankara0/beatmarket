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
  reuseMaybeSingle: vi.fn(),
  beatInsert: vi.fn(),
  insertSelect: vi.fn(),
  insertSingle: vi.fn(),
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

const CREATED_BEAT_ID =
  '44444444-4444-4444-8444-444444444444';

const PREVIEW_KEY =
  `masters/${USER_ID}/2026/11/preview/test.mp3`;

const MASTER_KEY =
  `masters/${USER_ID}/2026/11/master/test.wav`;

const VALID_BODY = {
  title: 'Free Publishing Test Beat',
  bpm: 120,
  previewKey: PREVIEW_KEY,
  masterKey: MASTER_KEY,
};

function createRequest(
  body = VALID_BODY
) {
  return new Request(
    'http://localhost:3000/api/beats/publish-free',
    {
      method: 'POST',

      headers: {
        'content-type':
          'application/json',
      },

      body: JSON.stringify(body),
    }
  );
}

async function sendRequest(
  body = VALID_BODY
) {
  const response = await POST(
    createRequest(body)
  );

  const responseBody =
    await response.json();

  expect(
    response.headers.get(
      'cache-control'
    )
  ).toBe('no-store');

  return {
    response,
    body: responseBody,
  };
}

function createStoredObject({
  uploadType,
  contentType,
  bytes,
}) {
  return {
    ContentLength: bytes,
    ContentType: contentType,

    Metadata: {
      owner: USER_ID,
      uploadtype: uploadType,
      expectedbytes: String(bytes),
    },
  };
}

describe(
  'POST /api/beats/publish-free successful publishing',
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

      mocks.reuseMaybeSingle
        .mockResolvedValue({
          data: null,
          error: null,
        });

      mocks.beatLimit.mockReturnValue({
        maybeSingle:
          mocks.reuseMaybeSingle,
      });

      mocks.beatEq.mockReturnValue({
        limit: mocks.beatLimit,
      });

      mocks.beatSelect.mockReturnValue({
        eq: mocks.beatEq,
      });

      mocks.insertSingle
        .mockResolvedValue({
          data: {
            id: CREATED_BEAT_ID,
          },

          error: null,
        });

      mocks.insertSelect.mockReturnValue({
        single: mocks.insertSingle,
      });

      mocks.beatInsert.mockReturnValue({
        select: mocks.insertSelect,
      });

      mocks.adminFrom.mockImplementation(
        (table) => {
          if (table === 'beats') {
            return {
              select: mocks.beatSelect,
              insert: mocks.beatInsert,
            };
          }

          throw new Error(
            `Unexpected table: ${table}`
          );
        }
      );

      mocks.r2Send.mockImplementation(
        async (command) => {
          const key = command.input.Key;

          if (key === PREVIEW_KEY) {
            return createStoredObject({
              uploadType: 'preview',
              contentType: 'audio/mpeg',
              bytes: 2048,
            });
          }

          if (key === MASTER_KEY) {
            return createStoredObject({
              uploadType: 'master',
              contentType: 'audio/wav',
              bytes: 8192,
            });
          }

          throw new Error(
            'Unexpected storage key.'
          );
        }
      );
    });

    it(
      'publishes a valid free beat with downloads enabled',
      async () => {
        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(201);

        expect(body).toEqual({
          success: true,

          beatId: CREATED_BEAT_ID,

          freeDownloadEnabled: true,

          storedFiles: {
            preview: {
              format: 'MP3',
              bytes: 2048,
            },

            master: {
              format: 'WAV',
              bytes: 8192,
            },
          },
        });

        expect(
          mocks.beatInsert
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.beatInsert
        ).toHaveBeenCalledWith({
          title:
            'Free Publishing Test Beat',

          bpm: 120,

          preview_url:
            PREVIEW_KEY,

          untagged_file_key:
            MASTER_KEY,

          producer_id:
            USER_ID,

          is_sold_exclusive:
            false,

          is_free_download_enabled:
            true,
        });

        expect(
          mocks.revalidatePath
        ).toHaveBeenCalledWith(
          '/dashboard'
        );

        expect(
          mocks.revalidatePath
        ).toHaveBeenCalledWith(
          '/explore'
        );

        expect(
          mocks.revalidatePath
        ).toHaveBeenCalledWith(
          '/profile'
        );

        expect(
          mocks.revalidatePath
        ).toHaveBeenCalledWith(
          '/profile/testproducer'
        );
      }
    );

    it(
      'checks both private audio files before publishing',
      async () => {
        const { response } =
          await sendRequest();

        expect(response.status).toBe(201);

        expect(
          mocks.beatEq
        ).toHaveBeenCalledWith(
          'preview_url',
          PREVIEW_KEY
        );

        expect(
          mocks.beatEq
        ).toHaveBeenCalledWith(
          'untagged_file_key',
          MASTER_KEY
        );

        expect(
          mocks.r2Send
        ).toHaveBeenCalledTimes(2);

        const inspectedKeys =
          mocks.r2Send.mock.calls.map(
            ([command]) => command.input.Key
          );

        expect(inspectedKeys).toEqual(
          expect.arrayContaining([
            PREVIEW_KEY,
            MASTER_KEY,
          ])
        );

        for (
          const [command] of
          mocks.r2Send.mock.calls
        ) {
          expect(
            command.input.Bucket
          ).toBe('test-private-bucket');
        }

        expect(
          mocks.beatInsert
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      'supports a FLAC master file',
      async () => {
        const flacKey =
          `masters/${USER_ID}/2026/11/master/test.flac`;

        mocks.r2Send.mockImplementation(
          async (command) => {
            if (
              command.input.Key ===
              PREVIEW_KEY
            ) {
              return createStoredObject({
                uploadType: 'preview',
                contentType: 'audio/mpeg',
                bytes: 2048,
              });
            }

            if (
              command.input.Key ===
              flacKey
            ) {
              return createStoredObject({
                uploadType: 'master',
                contentType: 'audio/flac',
                bytes: 16384,
              });
            }

            throw new Error(
              'Unexpected storage key.'
            );
          }
        );

        const { response, body } =
          await sendRequest({
            ...VALID_BODY,
            masterKey: flacKey,
          });

        expect(response.status).toBe(201);

        expect(
          body.storedFiles.master
        ).toEqual({
          format: 'FLAC',
          bytes: 16384,
        });

        expect(
          mocks.beatInsert
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            untagged_file_key:
              flacKey,

            is_free_download_enabled:
              true,
          })
        );
      }
    );

    it(
      'trims the beat title and allows BPM to be omitted',
      async () => {
        const { response, body } =
          await sendRequest({
            title:
              '  My Free Beat  ',

            previewKey:
              PREVIEW_KEY,

            masterKey:
              MASTER_KEY,
          });

        expect(response.status).toBe(201);

        expect(body.success).toBe(true);

        expect(
          mocks.beatInsert
        ).toHaveBeenCalledWith({
          title: 'My Free Beat',

          bpm: null,

          preview_url:
            PREVIEW_KEY,

          untagged_file_key:
            MASTER_KEY,

          producer_id:
            USER_ID,

          is_sold_exclusive:
            false,

          is_free_download_enabled:
            true,
        });
      }
    );

    it(
      'returns an error when the database cannot save the beat',
      async () => {
        mocks.insertSingle
          .mockResolvedValue({
            data: null,

            error: {
              message:
                'Database insert failed.',
            },
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(500);

        expect(body).toEqual({
          success: false,

          error:
            'The free beat could not be saved.',
        });

        expect(
          mocks.beatInsert
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.revalidatePath
        ).not.toHaveBeenCalled();
      }
    );
  }
);