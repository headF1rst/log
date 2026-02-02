/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'export',
  trailingSlash: true,

  webpack: (config) => {
    config.resolve.fallback = { fs: false };

    return config;
  },
  images: {
    unoptimized: true,
    domains: [
      "i.imgur.com",
      "velog.velcdn.com",
      "images.unsplash.com",
      "avatars.githubusercontent.com",
    ],
  },
  basePath: isProd ? "/log" : "",
};

module.exports = nextConfig;
