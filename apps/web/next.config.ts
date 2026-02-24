// const nextConfig = {
//   reactStrictMode: true,
//   transpilePackages: ['@enxtai/shared-types'],
//   env: {
//     NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
//   },

//   async reWrites() {
//     return [
//       {
//         source: '/api/digilocker/:path*',
//         destination: 'http://localhost:3001/api/digilocker/:path*', // Proxy to Backend
//       }
//     ];
//   },

//   experimental: {
//     allowedDevOrigins: ['https://abram-gymnogenous-victor.ngrok-free.dev'],
//   },

//   /**
//    * URL Redirects
//    *
//    * Handles legacy URL migration for authentication pages.
//    *
//    * @remarks
//    * **Redirect Rules**:
//    * - `/client-login` → `/client/login` (301 permanent)
//    *
//    * **Purpose**:
//    * - Maintains backward compatibility with old client login URL
//    * - SEO-friendly permanent redirect (301 status)
//    * - Ensures bookmarks and external links continue to work
//    *
//    * **Status Code**: 301 (Moved Permanently)
//    * - Tells browsers and search engines the URL has permanently moved
//    * - Browsers will cache the redirect
//    * - Updates bookmarks automatically
//    */
//   async redirects() {
//     return [
//       {
//         source: '/client-login',
//         destination: '/client/login',
//         permanent: true, // 301 redirect
//       },
//     ];
//   },
// };

// export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/digilocker/:path*',
        destination: 'http://localhost:3001/api/digilocker/:path*',
      },
    ];
  },
  experimental: {
    allowedDevOrigins: ['https://abram-gymnogenous-victor.ngrok-free.dev'],
  },
};

export default nextConfig;
