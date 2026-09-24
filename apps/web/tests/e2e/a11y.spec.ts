import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { loginWithMagicLink } from "./support/auth";
import { createAdmin, createEvent, createOrganizer, uploadAsGuest, waitForProcessed } from "./support/db";
import { gotoHydrated, uniqueName, waitForHydration } from "./support/page";

// FR-037: WCAG 2.2 nivel AA pe toate ecranele (constituția, principiul VIII).
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const HOUR = 3_600_000;

async function expectAccessible(page: Page, label: string): Promise<void> {
  await waitForHydration(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact ?? "?"}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, label).toEqual([]);
}

test.describe("pagina invitatului", () => {
  test("toate stările", async ({ page }) => {
    const organizer = await createOrganizer();
    const open = await createEvent({ organizerEmail: organizer, name: "Nunta accesibilă" });
    const notStarted = await createEvent({ organizerEmail: organizer, startsInMs: 2 * HOUR, endsInMs: 4 * HOUR });
    const ended = await createEvent({ organizerEmail: organizer, startsInMs: -4 * HOUR, endsInMs: -HOUR });

    await gotoHydrated(page, `/e/${open.token}`);
    await expectAccessible(page, "upload deschis");
    await page.getByLabel("Alege poze și video").setInputFiles([
      { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("x") },
    ]);
    await expect(page.getByRole("status").filter({ hasText: "nu s-a încărcat" })).toBeVisible();
    await expectAccessible(page, "upload cu fișier respins");

    for (const [token, label] of [
      [notStarted.token, "neînceput"],
      [ended.token, "încheiat"],
      ["tokenInexistent0000000", "inexistent"],
    ] as const) {
      await gotoHydrated(page, `/e/${token}`);
      await expectAccessible(page, label);
    }
  });
});

test("autentificare", async ({ page }) => {
  await gotoHydrated(page, "/login");
  await expectAccessible(page, "/login");
});

test("zona organizatorului: listă, galerie, vizualizator și dialoguri", async ({ page }) => {
  const email = await createOrganizer();
  const event = await createEvent({ organizerEmail: email, name: uniqueName("Nunta a11y") });
  await waitForProcessed([
    await uploadAsGuest(event.token, "android.jpg", "image/jpeg", "Ana"),
    await uploadAsGuest(event.token, "clip.mp4", "video/mp4"),
  ]);
  await loginWithMagicLink(page, email);
  await expectAccessible(page, "/events");

  await gotoHydrated(page, `/events/${event.id}`);
  await expectAccessible(page, "galerie");

  await page.getByRole("row").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectAccessible(page, "vizualizator");
  await page.getByRole("button", { name: "Închide" }).click();

  await page.getByRole("row").first().locator("label").click();
  await page.getByRole("button", { name: /Șterge selecția/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expectAccessible(page, "dialog ștergere");
  await page.getByRole("alertdialog").getByRole("button", { name: "Renunță" }).click();

  await page.getByRole("region", { name: "Păstrarea fișierelor" }).getByRole("radio", { name: /^12 luni/ }).check({ force: true });
  await page.getByRole("button", { name: "Prelungește păstrarea" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expectAccessible(page, "dialog prelungire");
});

test("zona de administrare", async ({ page }) => {
  await loginWithMagicLink(page, await createAdmin());
  await expect(page).toHaveURL(/\/auth\/mfa/);
  await expect(page.getByTestId("totp-secret")).toBeVisible();
  await expectAccessible(page, "/auth/mfa");

  const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  await page.getByLabel("Codul din aplicație").fill(new TOTP({ secret }).generate());
  await page.getByRole("button", { name: "Verifică" }).click();
  await expect(page).toHaveURL(/\/admin\/events$/);
  await expectAccessible(page, "/admin/events");

  await gotoHydrated(page, "/admin/events/new");
  await expectAccessible(page, "/admin/events/new");

  await gotoHydrated(page, "/admin/retention");
  await expectAccessible(page, "/admin/retention");
});
