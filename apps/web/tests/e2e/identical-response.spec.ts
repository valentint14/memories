import { expect, test, type Page } from "@playwright/test";
import { createOrganizer, randomEmail } from "./support/db";
import { gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// Răspuns identic pentru adrese existente și inexistente (002: FR-003, FR-011, SC-004).
test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "măsurătoare doar pe desktop Chromium");
test.setTimeout(300_000);

const ROUNDS = 20;
const WARMUP = 2;

interface Sample {
  existing: boolean;
  ms: number;
  status: number;
  target: string;
}

/** Trimite formularul și măsoară cererea POST a Server Action-ului. */
async function measure(page: Page, url: string, fill: () => Promise<void>, submit: string): Promise<{ ms: number; status: number; target: string }> {
  await gotoHydrated(page, url);
  await fill();
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByRole("button", { name: submit }).click(),
  ]);
  const timing = response.request().timing();
  await expect(page).toHaveURL(/\/auth\/code\?request=/);
  // Id-ul cererii diferă mereu; restul adresei trebuie să fie identic.
  const target = new URL(page.url()).pathname;
  return { ms: timing.responseEnd, status: response.status(), target };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function run(page: Page, kind: "create" | "login"): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let i = 0; i < ROUNDS + WARMUP; i++) {
    const existing = i % 2 === 0;
    const email = existing ? await createOrganizer() : randomEmail("nobody");
    const result =
      kind === "create"
        ? await measure(
            page,
            "/",
            async () => {
              await page.getByLabel("Adresa de email").fill(email);
              await page.getByLabel("Numele evenimentului").fill(uniqueName("Timp"));
              await page.getByLabel("Data evenimentului").fill(futureDate(30));
              await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
            },
            "Creează evenimentul",
          )
        : await measure(
            page,
            "/login",
            async () => {
              await page.getByLabel("Adresa de email").fill(email);
            },
            "Trimite codul",
          );
    if (i >= WARMUP) samples.push({ existing, ...result });
  }
  return samples;
}

for (const kind of ["create", "login"] as const) {
  test(`${kind}: același status, aceeași pagină și timp mediu cu diferență sub 100 ms`, async ({ page }) => {
    const samples = await run(page, kind);
    expect(new Set(samples.map((s) => `${String(s.status)} ${s.target}`)).size).toBe(1);
    const existing = mean(samples.filter((s) => s.existing).map((s) => s.ms));
    const missing = mean(samples.filter((s) => !s.existing).map((s) => s.ms));
    test.info().annotations.push({ type: "timing", description: `existent ${existing.toFixed(0)} ms, inexistent ${missing.toFixed(0)} ms` });
    expect(Math.abs(existing - missing)).toBeLessThan(100);
  });
}
