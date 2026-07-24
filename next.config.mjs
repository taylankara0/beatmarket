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