import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Imaginea Docker (apps/web/Dockerfile) folosește serverul autonom; testele rulează cu `next start`.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const config: NextConfig = {
  ...(standalone && {
    output: "standalone",
    // Monorepo: urmărirea dependențelor pornește din rădăcină, ca să includă @memories/shared.
    outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  }),
  transpilePackages: ["@memories/shared"],
  poweredByHeader: false,
  // Documentele legale se citesc la runtime din repository (002, research R9).
  outputFileTracingIncludes: { "/*": ["./content/legal/**/*.md"] },
  experimental: {
    serverActions: { bodySizeLimit: "256kb" },
  },
};

export default config;
