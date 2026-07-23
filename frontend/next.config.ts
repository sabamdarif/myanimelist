import type { NextConfig } from "next";

const DJANGO = process.env.DJANGO_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${DJANGO}/api/:path*` },
      { source: "/accounts/:path*", destination: `${DJANGO}/accounts/:path*` },
      {
        source: "/django-static/:path*",
        destination: `${DJANGO}/django-static/:path*`,
      },
    ];
  },
};

export default nextConfig;
