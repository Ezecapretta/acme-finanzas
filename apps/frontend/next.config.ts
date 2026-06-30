import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@acme/shared'],
};

export default nextConfig;
