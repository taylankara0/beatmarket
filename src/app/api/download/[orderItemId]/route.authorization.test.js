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

const VALID_ORDER_ITEM_ID =
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
    `http://localhost:3000/api/download/${VALID_ORDER_ITEM_ID}`,
    {
      method: 'GET'
    }
  );
}

function createContext() {
  return {
    params: Promise.resolve({
      orderItemId:
        VALID_ORDER_ITEM_ID
    })
  };
}

function createOrderItem(
  overrides = {}
) {
  return {
    id:
      VALID_ORDER_ITEM_ID,

    order_id:
      ORDER_ID,

    beat_id:
      BEAT_ID,

    license_id:
      LICENSE_ID,

    title:
      'Test Beat',

    license_name:
      'Premium',

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

function createSingleResultQuery({
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

function configureAuthorizedRequest({
  orderItem = createOrderItem(),
  order = createOrder()
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
    createSingleResultQuery({
      data:
        orderItem
    });

  const orderQuery =
    createSingleResultQuery({
      data:
        order
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
    getUser,
    supabaseAdmin,
    from,
    orderItemQuery,
    orderQuery
  };
}

describe(
  'GET /api/download/[orderItemId] purchase authorization',
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
    });

    it(
      'returns 404 when the purchased order item does not exist',
      async () => {
        const {
          from,
          orderItemQuery,
          orderQuery
        } = configureAuthorizedRequest({
          orderItem: null
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(404);

        expect(body).toEqual({
          success: false,

          error:
            'Purchased item not found.'
        });

        expect(
          response.headers.get(
            'cache-control'
          )
        ).toBe('no-store');

        expect(
          orderItemQuery.eq
        ).toHaveBeenCalledWith(
          'id',
          VALID_ORDER_ITEM_ID
        );

        expect(from)
          .toHaveBeenCalledTimes(1);

        expect(
          orderQuery.select
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
      'returns 404 when the parent order does not exist',
      async () => {
        const {
          orderQuery
        } = configureAuthorizedRequest({
          order: null
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(404);

        expect(body).toEqual({
          success: false,

          error:
            'Order not found.'
        });

        expect(
          orderQuery.eq
        ).toHaveBeenCalledWith(
          'id',
          ORDER_ID
        );

        expect(
          mocks.GetObjectCommand
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'blocks downloads for a refunded order',
      async () => {
        configureAuthorizedRequest({
          order:
            createOrder({
              status:
                'refunded',

              refunded_at:
                '2026-07-29T05:00:00.000Z'
            })
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'This purchase has been refunded, so its files are no longer available for download.'
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
      'blocks downloads for an order that is not paid',
      async () => {
        configureAuthorizedRequest({
          order:
            createOrder({
              status:
                'payment_failed'
            })
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'This order has not been paid successfully.'
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
      'blocks a user who does not own the paid order',
      async () => {
        configureAuthorizedRequest({
          order:
            createOrder({
              user_id:
                'different-user'
            })
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(403);

        expect(body).toEqual({
          success: false,

          error:
            'You do not have permission to download this purchase.'
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
      'rejects a purchased item with missing beat or license information',
      async () => {
        configureAuthorizedRequest({
          orderItem:
            createOrderItem({
              beat_id: null
            })
        });

        const response = await GET(
          createRequest(),
          createContext()
        );

        const body =
          await response.json();

        expect(response.status).toBe(400);

        expect(body).toEqual({
          success: false,

          error:
            'The purchased beat or license information is missing.'
        });

        expect(
          mocks.GetObjectCommand
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl
        ).not.toHaveBeenCalled();
      }
    );
  }
);