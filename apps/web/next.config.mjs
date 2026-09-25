/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nusaquant/core'],
  // Preview sandbox memakai domain proxy — izinkan agar dev server tidak menolak origin luar.
  allowedDevOrigins: ['*.e2b.app', '*.vercel.app'],
};

export default nextConfig;
