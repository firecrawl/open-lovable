import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.google.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/firecrawl-scrape-media/**",
      },
    ],
  },
};

export default nextConfig;