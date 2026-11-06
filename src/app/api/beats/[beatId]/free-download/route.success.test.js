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
  auditInsert: vi.fn(),
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
        value ===
        'free-noncommercial-v1',
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

const SIGNED_DOWNLOAD_URL =
  'https://storage.example.test/download?signature=test';

const VALID_BEAT = {
  id: VALID_BEAT_ID,

  title: 'Free Test Beat',

  producer_id:
    '33333333-3333-4333-8333-333333333333',

  untagged_file_key:
    'private/master/free-test-beat.mp3',

  is_sold_exclusive: false,

  is_free_download_enabled: true,
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

  const body =
    await response.json();

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

describe(
  'POST /api/beats/[beatId]/free-download successful delivery',
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

      mocks.auditInsert
        .mockResolvedValue({
          error: null,
        });

      mocks.adminFrom.mockImplementation(
        (table) => {
          if (table === 'beats') {
            return {
              select: mocks.beatSelect,
            };
          }

          if (
            table ===
            'free_beat_downloads'
          ) {
            return {
              insert: mocks.auditInsert,
            };
          }

          throw new Error(
            `Unexpected table access: ${table}`
          );
        }
      );

      mocks.r2Send.mockResolvedValue({
        ContentLength: 1024,
      });

      mocks.getSignedUrl
        .mockResolvedValue(
          SIGNED_DOWNLOAD_URL
        );
    });

    it(
      'generates a secure download and records the accepted license',
      async () => {
        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(200);

        expect(body).toEqual({
          success: true,

          downloadUrl:
            SIGNED_DOWNLOAD_URL,

          filename:
            'Free_Test_Beat-free-beat.mp3',

          expiresIn: 60,

          licenseVersion:
            'free-noncommercial-v1',
        });

        expect(
          mocks.getUser
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.beatEq
        ).toHaveBeenCalledWith(
          'id',
          VALID_BEAT_ID
        );

        expect(
          mocks.r2Send
        ).toHaveBeenCalledTimes(1);

        const headCommand =
          mocks.r2Send.mock.calls[0][0];

        expect(
          headCommand.input
        ).toEqual({
          Bucket:
            'test-private-bucket',

          Key:
            VALID_BEAT.untagged_file_key,
        });

        expect(
          mocks.getSignedUrl
        ).toHaveBeenCalledTimes(1);

        const [
          storageClient,
          downloadCommand,
          signingOptions,
        ] =
          mocks.getSignedUrl.mock.calls[0];

        expect(storageClient.send).toBe(
          mocks.r2Send
        );

        expect(
          downloadCommand.input
        ).toEqual({
          Bucket:
            'test-private-bucket',

          Key:
            VALID_BEAT.untagged_file_key,

          ResponseContentDisposition:
            'attachment; filename="Free_Test_Beat-free-beat.mp3"',
        });

        expect(
          signingOptions
        ).toEqual({
          expiresIn: 60,
        });

        expect(
          mocks.auditInsert
        ).toHaveBeenCalledTimes(1);

        const downloadRecord =
          mocks.auditInsert.mock.calls[0][0];

        expect(downloadRecord).toEqual({
          beat_id:
            VALID_BEAT_ID,

          downloader_id:
            VALID_USER_ID,

          license_version:
            'free-noncommercial-v1',

          accepted_at:
            expect.any(String),

          downloaded_at:
            expect.any(String),
        });

        expect(
          downloadRecord.accepted_at
        ).toBe(
          downloadRecord.downloaded_at
        );

        expect(
          Number.isNaN(
            Date.parse(
              downloadRecord.accepted_at
            )
          )
        ).toBe(false);

        expect(
          JSON.stringify(body)
        ).not.toContain(
          VALID_BEAT.untagged_file_key
        );
      }
    );

    it(
      'preserves the WAV extension in the download filename',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValue({
            data: {
              ...VALID_BEAT,

              untagged_file_key:
                'private/master/free-test-beat.wav',
            },

            error: null,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(200);

        expect(body.filename).toBe(
          'Free_Test_Beat-free-beat.wav'
        );

        expect(
          mocks.auditInsert
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      'preserves the FLAC extension in the download filename',
      async () => {
        mocks.beatMaybeSingle
          .mockResolvedValue({
            data: {
              ...VALID_BEAT,

              untagged_file_key:
                'private/master/free-test-beat.flac',
            },

            error: null,
          });

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(200);

        expect(body.filename).toBe(
          'Free_Test_Beat-free-beat.flac'
        );

        expect(
          mocks.auditInsert
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      'does not record a download when signed URL generation fails',
      async () => {
        mocks.getSignedUrl
          .mockRejectedValue(
            new Error(
              'Signing service unavailable'
            )
          );

        const { response, body } =
          await sendRequest();

        expect(response.status).toBe(500);

        expect(body).toEqual({
          success: false,

          error:
            'The secure free-download link could not be generated.',
        });

        expect(
          mocks.getSignedUrl
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.auditInsert
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'does not return the signed URL when license audit insertion fails',
      async () => {
        mocks.auditInsert
          .mockResolvedValue({
            error: {
              message:
                'Database insert failed',
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
          mocks.getSignedUrl
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.auditInsert
        ).toHaveBeenCalledTimes(1);

        expect(
          JSON.stringify(body)
        ).not.toContain(
          SIGNED_DOWNLOAD_URL
        );
      }
    );

    it(
      'rejects downloads when the private storage bucket is not configured',
      async () => {
        delete process.env.R2_BUCKET_NAME;

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

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();

        expect(
          mocks.auditInsert
        ).not.toHaveBeenCalled();
      }
    );
  }
);