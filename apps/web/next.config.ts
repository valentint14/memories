import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@memories/shared"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "256kb" },
  },
};

export default config;
