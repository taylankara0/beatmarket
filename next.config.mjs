function getOrigin(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const isDevelopment =
  process.env.NODE_ENV !== 'production';

const supabaseOrigin =
  getOrigin(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );

const r2AccountId =
  process.env.R2_ACCOUNT_ID?.trim();

const r2Origin =
  r2AccountId
    ? `https://${r2AccountId}.r2.cloudflarestorage.com`
    : null;

function buildContentSecurityPolicy() {
  const connectSources = [
    "'self'",
    supabaseOrigin,
    r2Origin,
    isDevelopment
      ? 'ws:'
      : null,
  ].filter(Boolean);

  const directives = [
    "default-src 'self'",

    [
      "script-src 'self' 'unsafe-inline'",
      isDevelopment
        ? "'unsafe-eval'"
        : null,
    ]
      .filter(Boolean)
      .join(' '),

    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self' blob:",
    `connect-src ${connectSources.join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",

    isDevelopment
      ? null
      : 'upgrade-insecure-requests',
  ].filter(Boolean);

  return directives.join('; ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'iyzipay',
    'postman-request',
  ],

  outputFileTracingIncludes: {
    '/api/checkout/iyzico': [
      './node_modules/iyzipay/**/*',
      './node_modules/postman-request/**/*',
    ],

    '/api/checkout/iyzico/callback': [
      './node_modules/iyzipay/**/*',
      './node_modules/postman-request/**/*',
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',

        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              buildContentSecurityPolicy(),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value:
              'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value:
              'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;