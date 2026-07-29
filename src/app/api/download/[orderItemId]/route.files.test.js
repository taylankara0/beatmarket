import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  GetObjectCommand:
    vi.fn(),

  getSignedUrl:
    vi.fn(),

  createSupabaseAdminClient:
    vi.fn(),

  createServerClient:
    vi.fn(),

  cookies:
    vi.fn(),

  consumeApiRateLimit:
    vi.fn(),

  r2Client: {
    name: 'mock-r2-client'
  }
}));

vi.mock(
  '@aws-sdk/client-s3',
  () => ({
    GetObjectCommand:
      mocks.GetObjectCommand
  })
);

vi.mock(
  '@aws-sdk/s3-request-presigner',
  () => ({
    getSignedUrl:
      mocks.getSignedUrl
  })
);

vi.mock(
  '@supabase/supabase-js',
  () => ({
    createClient:
      mocks.createSupabaseAdminClient
  })
);

vi.mock(
  '@supabase/ssr',
  () => ({
    createServerClient:
      mocks.createServerClient
  })
);

vi.mock(
  'next/headers',
  () => ({
    cookies:
      mocks.cookies
  })
);

vi.mock(
  '@/lib/apiRateLimit',
  () => ({
    consumeApiRateLimit:
      mocks.consumeApiRateLimit
  })
);

vi.mock(
  '@/lib/r2',
  () => ({
    r2Client:
      mocks.r2Client
  })
);

import { GET } from './route';

const ORDER_ITEM_ID =
  '11111111-1111-4111-8111-111111111111';

const ORDER_ID =
  '22222222-2222-4222-8222-222222222222';

const BEAT_ID =
  '33333333-3333-4333-8333-333333333333';

const LICENSE_ID =
  '44444444-4444-4444-8444-444444444444';

const BUYER_ID =
  'buyer-user-1';

function createRequest() {
  return new Request(
    `http://localhost:3000/api/download/${ORDER_ITEM_ID}`,
    {
      method: 'GET'
    }
  );
}

function createContext() {
  return {
    params: Promise.resolve({
      orderItemId:
        ORDER_ITEM_ID
    })
  };
}

function createOrderItem(
  overrides = {}
) {
  return {
    id:
      ORDER_ITEM_ID,

    order_id:
      ORDER_ID,

    beat_id:
      BEAT_ID,

    license_id:
      LICENSE_ID,

    title:
      'Order Item Beat',

    license_name:
      'Order Item License',

    ...overrides
  };
}

function createOrder(
  overrides = {}
) {
  return {
    id:
      ORDER_ID,

    user_id:
      BUYER_ID,

    status:
      'paid',

    refunded_at:
      null,

    ...overrides
  };
}

function createLicense(
  overrides = {}
) {
  return {
    id:
      LICENSE_ID,

    beat_id:
      BEAT_ID,

    name:
      'Premium License',

    file_format:
      'wav',

    is_exclusive:
      false,

    ...overrides
  };
}

function createBeat(
  overrides = {}
) {
  return {
    id:
      BEAT_ID,

    title:
      'Night Drive',

    untagged_file_key:
      'private/masters/night-drive.wav',

    ...overrides
  };
}

function createOneEqQuery({
  data,
  error = null
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({
      data,
      error
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

  return {
    select,
    eq,
    maybeSingle
  };
}

function createTwoEqQuery({
  data,
  error = null
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({
      data,
      error
    });

  const secondEq = vi
    .fn()
    .mockReturnValue({
      maybeSingle
    });

  const firstEq = vi
    .fn()
    .mockReturnValue({
      eq:
        secondEq
    });

  const select = vi
    .fn()
    .mockReturnValue({
      eq:
        firstEq
    });

  return {
    select,
    firstEq,
    secondEq,
    maybeSingle
  };
}

function configureDownloadFlow({
  orderItem =
    createOrderItem(),

  order =
    createOrder(),

  license =
    createLicense(),

  beat =
    createBeat(),

  licenseError =
    null,

  beatError =
    null
} = {}) {
  const getUser = vi
    .fn()
    .mockResolvedValue({
      data: {
        user: {
          id:
            BUYER_ID
        }
      },

      error: null
    });

  const supabaseAuth = {
    auth: {
      getUser
    }
  };

  const orderItemQuery =
    createOneEqQuery({
      data:
        orderItem
    });

  const orderQuery =
    createOneEqQuery({
      data:
        order
    });

  const licenseQuery =
    createTwoEqQuery({
      data:
        license,

      error:
        licenseError
    });

  const beatQuery =
    createOneEqQuery({
      data:
        beat,

      error:
        beatError
    });

  const from = vi.fn(
    (tableName) => {
      if (
        tableName ===
        'order_items'
      ) {
        return {
          select:
            orderItemQuery.select
        };
      }

      if (
        tableName ===
        'orders'
      ) {
        return {
          select:
            orderQuery.select
        };
      }

      if (
        tableName ===
        'licenses'
      ) {
        return {
          select:
            licenseQuery.select
        };
      }

      if (
        tableName ===
        'beats'
      ) {
        return {
          select:
            beatQuery.select
        };
      }

      throw new Error(
        `Unexpected table access: ${tableName}`
      );
    }
  );

  const supabaseAdmin = {
    from
  };

  mocks.createServerClient
    .mockReturnValue(
      supabaseAuth
    );

  mocks.createSupabaseAdminClient
    .mockReturnValue(
      supabaseAdmin
    );

  return {
    supabaseAdmin,
    from,
    orderItemQuery,
    orderQuery,
    licenseQuery,
    beatQuery
  };
}

describe(
  'GET /api/download/[orderItemId] file access',
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

        set: vi.fn()
      });

      mocks.consumeApiRateLimit
        .mockResolvedValue({
          allowed: true,
          retryAfterSeconds: 0
        });

      mocks.GetObjectCommand
        .mockImplementation(
          function GetObjectCommandMock(
            input
          ) {
            this.input =
              input;
          }
        );

      mocks.getSignedUrl
        .mockResolvedValue(
          'https://signed.example.test/download'
        );
    });

    it(
      'returns 404 when the purchased license cannot be verified against the beat',
      async () => {
        const {
          from,
          licenseQuery,
          beatQuery
        } = configureDownloadFlow({
          license: null
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(404);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'The purchased license could not be verified.'
        });

        expect(
          licenseQuery.firstEq
        ).toHaveBeenCalledWith(
          'id',
          LICENSE_ID
        );

        expect(
          licenseQuery.secondEq
        ).toHaveBeenCalledWith(
          'beat_id',
          BEAT_ID
        );

        expect(from)
          .not.toHaveBeenCalledWith(
            'beats'
          );

        expect(
          beatQuery.select
        ).not.toHaveBeenCalled();

        expect(
          mocks.GetObjectCommand
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'returns 404 when the private master audio file is unavailable',
      async () => {
        configureDownloadFlow({
          beat:
            createBeat({
              untagged_file_key:
                null
            })
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(404);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'The master audio file is not available.'
        });

        expect(
          mocks.GetObjectCommand
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'returns a server error when the R2 bucket configuration is missing',
      async () => {
        delete process.env.R2_BUCKET_NAME;

        configureDownloadFlow();

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(500);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: false,

          error:
            'The secure download link could not be generated.'
        });

        expect(
          mocks.GetObjectCommand
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'creates a short-lived signed R2 download URL for the purchase owner',
      async () => {
        const privateFileKey =
          'private/masters/night-drive-master.wav';

        configureDownloadFlow({
          license:
            createLicense({
              name:
                'Premium License',

              file_format:
                'WAV'
            }),

          beat:
            createBeat({
              title:
                'Night Drive',

              untagged_file_key:
                privateFileKey
            })
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(200);

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(body).toEqual({
          success: true,

          downloadUrl:
            'https://signed.example.test/download',

          filename:
            'Night_Drive-Premium_License.wav',

          expiresIn: 60
        });

        expect(
          body
        ).not.toHaveProperty(
          'fileKey'
        );

        expect(
          JSON.stringify(body)
        ).not.toContain(
          privateFileKey
        );

        expect(
          mocks.GetObjectCommand
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.GetObjectCommand
        ).toHaveBeenCalledWith({
          Bucket:
            'test-private-bucket',

          Key:
            privateFileKey,

          ResponseContentDisposition:
            'attachment; filename="Night_Drive-Premium_License.wav"'
        });

        const generatedCommand =
          mocks.GetObjectCommand
            .mock
            .instances[0];

        expect(
          generatedCommand.input
        ).toEqual({
          Bucket:
            'test-private-bucket',

          Key:
            privateFileKey,

          ResponseContentDisposition:
            'attachment; filename="Night_Drive-Premium_License.wav"'
        });

        expect(
          mocks.getSignedUrl
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.getSignedUrl
        ).toHaveBeenCalledWith(
          mocks.r2Client,
          generatedCommand,
          {
            expiresIn: 60
          }
        );
      }
    );
  }
);