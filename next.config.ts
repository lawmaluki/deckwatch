import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The read API is public: any site may call it from the browser. Only GET is
  // allowed cross-origin; POST /api/reports stays same-origin until reports
  // are actually stored and moderated.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
