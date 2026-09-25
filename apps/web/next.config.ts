import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@memories/shared"],
  poweredByHeader: false,
  // Documentele legale se citesc la runtime din repository (002, research R9).
  outputFileTracingIncludes: { "/*": ["./content/legal/**/*.md"] },
  experimental: {
    serverActions: { bodySizeLimit: "256kb" },
  },
};

export default config;
