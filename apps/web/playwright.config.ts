import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

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

// Servere suplimentare pe același build (002, T006): limitele reale de frecvență, secretul
// Turnstile care respinge mereu și widgetul Turnstile real (are nevoie de internet).
const extraServers = [
  { name: "limits", port: 3001, match: /abuse-limits\.spec\.ts/, env: {} },
  { name: "captcha-reject", port: 3002, match: /captcha-reject\.spec\.ts/, env: { TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA" } },
  ...(process.env.CI || process.env.E2E_TURNSTILE_SMOKE === "1"
    ? [{ name: "turnstile-smoke", port: 3003, match: /turnstile-widget\.spec\.ts/, env: { TURNSTILE_OFFLINE: "" } }]
    : []),
];
const EXTRA = /(abuse-limits|captcha-reject|turnstile-widget)\.spec\.ts/;

const webServer: PlaywrightTestConfig["webServer"] = process.env.E2E_BASE_URL
  ? undefined
  : [
      {
        // Build de producție: testul de LCP (research.md R16) măsoară bundle-ul real.
        command: `npx next build && npx next start --port ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        // Toată suita rulează de pe 127.0.0.1; limitele per adresă rămân cele reale.
        env: { RATE_LIMIT_IP_PER_HOUR: "100000" },
      },
      ...extraServers.map((server) => ({
        // Pornește după serverul principal și refolosește build-ul lui.
        command: `npx next start --port ${server.port}`,
        url: `http://localhost:${server.port}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { APP_URL: `http://localhost:${server.port}`, ...server.env },
      })),
    ];

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
    ...browsers.map(({ name, device }) => ({ name, testIgnore: [RETENTION, EXTRA], use: { ...device } })),
    ...browsers.map(({ name, device }, index) => ({
      name: `retention-${name}`,
      testMatch: RETENTION,
      dependencies: index === 0 ? [] : [`retention-${browsers[index - 1]?.name ?? ""}`],
      use: { ...device },
    })),
    ...extraServers.map((server) => ({
      name: server.name,
      testMatch: server.match,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${server.port}` },
    })),
  ],
  webServer,
});
