import { expect, test } from "@playwright/test";
import { createEvent, createOrganizer } from "./support/db";

// Principiul I și SC-002: LCP < 2,5 s pe 4G pentru pagina de upload (research.md R16).
test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !isMobile, "CDP doar pe mobile-chrome");

const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

test("LCP-ul paginii /e/[token] rămâne sub 2 500 ms pe Slow 4G + CPU 4×", async ({ browser }) => {
  const event = await createEvent({ organizerEmail: await createOrganizer(), name: "Nunta pentru LCP" });
  const samples: number[] = [];

  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ ...test.info().project.use });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    await page.goto(`/e/${event.token}`, { waitUntil: "load" });
    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            resolve(entries[entries.length - 1]?.startTime ?? 0);
          }).observe({ type: "largest-contentful-paint", buffered: true });
        }),
    );
    samples.push(lcp);
    await context.close();
  }

  samples.sort((a, b) => a - b);
  const median = samples[1] ?? Number.POSITIVE_INFINITY;
  console.log(`LCP (ms): ${samples.map((s) => Math.round(s)).join(", ")} — median ${Math.round(median)}`);
  expect(median).toBeLessThan(2500);
});
