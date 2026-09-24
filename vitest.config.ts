import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          include: ["packages/shared/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias: { "@": new URL("./apps/web/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") } },
        test: {
          name: "web",
          include: ["apps/web/tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "worker",
          include: ["apps/worker/tests/**/*.test.ts"],
          setupFiles: ["apps/worker/tests/setup.ts"],
          environment: "node",
          testTimeout: 120_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "db",
          include: ["supabase/tests/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
