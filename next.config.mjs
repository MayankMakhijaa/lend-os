/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer"],
};
export default nextConfig;
