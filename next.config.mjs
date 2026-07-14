/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Native sharp binary for `/api/convert-heic` on Vercel & local Node. */
  serverExternalPackages: ["sharp"],
  turbopack: {},
};

export default nextConfig;
