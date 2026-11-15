import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Make sure saved demo data is deployed with the analyze route.
  outputFileTracingIncludes: {
    "/api/analyze": ["./data/saved/**/*"],
  },
};

export default nextConfig;
