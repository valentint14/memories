import { expect, type Locator, type Page } from "@playwright/test";

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

/**
 * Completează un `DateField` (segmente zi, lună, an și, la oră, ora și minutul) ca un utilizator:
 * focus pe primul segment și tastarea cifrelor. `value`: „AAAA-LL-ZZ” sau „AAAA-LL-ZZTHH:mm”.
 */
export async function fillDate(scope: Page | Locator, label: string, value: string): Promise<void> {
  const [date = "", time] = value.split("T");
  const [year, month, day] = date.split("-");
  const digits = `${day ?? ""}${month ?? ""}${year ?? ""}${time === undefined ? "" : time.slice(0, 5).replace(":", "")}`;
  await scope.getByRole("group", { name: label }).getByRole("spinbutton").first().click();
  await ("keyboard" in scope ? scope : scope.page()).keyboard.type(digits);
}
