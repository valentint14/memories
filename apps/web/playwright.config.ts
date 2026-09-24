import { defineConfig, devices } from "@playwright/test";

// Local: variabilele scrise de `node scripts/ci-env.mjs --write`; în CI vin din mediu.
try {
  process.loadEnvFile(".env.local");
} catch {
  // fără .env.local
}

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

const browsers = [
  { name: "desktop-chromium", device: devices["Desktop Chrome"] },
  { name: "mobile-chrome", device: devices["Pixel 7"] },
  { name: "mobile-safari", device: devices["iPhone 15"] },
];

// retention.spec.ts modifică suplimentele din catalogul global de retenție: rulează pe rând în cele
// trei browsere (fiecare proiect depinde de precedentul), niciodată în paralel cu el însuși.
const RETENTION = /retention\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  // Fișierele rulează în paralel; testele dintr-un fișier, în ordine (multe folosesc date comune).
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: Number(process.env.E2E_WORKERS ?? (process.env.CI ? 2 : 3)),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    trace: "retain-on-failure",
  },
  projects: [
    ...browsers.map(({ name, device }) => ({ name, testIgnore: RETENTION, use: { ...device } })),
    ...browsers.map(({ name, device }, index) => ({
      name: `retention-${name}`,
      testMatch: RETENTION,
      dependencies: index === 0 ? [] : [`retention-${browsers[index - 1]?.name ?? ""}`],
      use: { ...device },
    })),
  ],
  // Build de producție: testul de LCP (research.md R16) măsoară bundle-ul real.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next build && npx next start --port ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
