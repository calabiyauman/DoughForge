/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  webpack: (config) => {
    // Handle Three.js and other libraries
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    
    return config;
  },
  // Optimized for Vercel deployment
  experimental: {
    esmExternals: 'loose',
  },
}

module.exports = nextConfig
