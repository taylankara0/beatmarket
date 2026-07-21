/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['iyzipay'],

  outputFileTracingIncludes: {
    '/api/checkout/iyzico': [
      './node_modules/iyzipay/lib/resources/**/*',
    ],
    '/api/checkout/iyzico/callback': [
      './node_modules/iyzipay/lib/resources/**/*',
    ],
  },
};

export default nextConfig;