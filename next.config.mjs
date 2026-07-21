/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['iyzipay'],

  outputFileTracingIncludes: {
    '/api/checkout/iyzico': [
      './node_modules/iyzipay/**/*',
    ],
    '/api/checkout/iyzico/callback': [
      './node_modules/iyzipay/**/*',
    ],
  },
};

export default nextConfig;