import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transport ceiling; project API still enforces 18 MiB JSON and 8 MiB decoded data.
  experimental: { middlewareClientMaxBodySize: "20mb" },
  serverExternalPackages: ["esbuild", "tailwindcss", "postcss"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.google.com',
      },
    ],
  },
};

export default nextConfig;
