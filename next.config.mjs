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
};

export default nextConfig;