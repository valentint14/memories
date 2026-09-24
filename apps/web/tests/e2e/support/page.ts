import { expect, type Page } from "@playwright/test";

/** Așteaptă hidratarea React (marcaj pus de HydrationMarker) înainte de a completa formulare. */
export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator("html[data-hydrated='true']")).toBeAttached();
}

export async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForHydration(page);
}

export function uniqueName(base: string): string {
  return `${base} ${Math.random().toString(36).slice(2, 6)}`;
}
