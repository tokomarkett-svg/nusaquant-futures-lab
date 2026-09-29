/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nusaquant/core', '@nusaquant/db'],
  // better-sqlite3 adalah modul native sinkron: jangan dibundel, pakai langsung dari node_modules.
  serverExternalPackages: ['better-sqlite3'],
  // Preview sandbox memakai domain proxy — izinkan agar dev server tidak menolak origin luar.
  allowedDevOrigins: ['*.e2b.app', '*.vercel.app'],
};

export default nextConfig;
