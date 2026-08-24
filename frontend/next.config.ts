import type { NextConfig } from "next";

const DJANGO = process.env.DJANGO_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone", // self-contained server for the Docker image
  // stray lockfiles above the repo make Next mis-infer the workspace root,
  // which nests the standalone output under the full host path
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
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
