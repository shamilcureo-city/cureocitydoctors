/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PWA support will be added via next-pwa
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
