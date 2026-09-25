import { expect, test } from "@playwright/test";
import { loginAsNewAdmin, loginWithMagicLink } from "./support/auth";
import { createAdmin, createEvent, createOrganizer, serviceClient } from "./support/db";
import { gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// US2 — organizatorul care revine își vede toate evenimentele (002: FR-005, FR-010, FR-012, FR-021).

test("vede evenimentele create de administrator și pe cele self-service, cu starea fiecăruia", async ({ page }) => {
  const email = await createOrganizer();
  const adminEvent = uniqueName("Nunta de la admin");
  await createEvent({ organizerEmail: email, name: adminEvent });

  await loginWithMagicLink(page, email);
  // Primul eveniment self-service, creat din cont: cere acceptarea termenilor (FR-041).
  const selfService = uniqueName("Botez din cont");
  await gotoHydrated(page, "/events/new");
  await page.getByLabel("Numele evenimentului").fill(selfService);
  await page.getByLabel("Data evenimentului").fill(futureDate(25));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  await expect(page.getByText("În așteptarea activării").first()).toBeVisible();

  await page.goto("/events");
  const adminCard = page.getByRole("listitem").filter({ hasText: adminEvent });
  const ownCard = page.getByRole("listitem").filter({ hasText: selfService });
  await expect(adminCard).toContainText("Activ");
  await expect(ownCard).toContainText("În așteptarea activării");
});

test("creează din cont fără email; la limită primește mesajul explicativ", async ({ page }) => {
  const email = await createOrganizer();
  await loginWithMagicLink(page, email);
  const since = new Date();

  for (let i = 0; i < 3; i++) {
    await gotoHydrated(page, "/events/new");
    await page.getByLabel("Numele evenimentului").fill(uniqueName(`Eveniment ${String(i)}`));
    await page.getByLabel("Data evenimentului").fill(futureDate(30));
    const accept = page.getByRole("checkbox", { name: /Accept termenii/ });
    if (await accept.isVisible()) await accept.check();
    await page.getByRole("button", { name: "Creează evenimentul" }).click();
    if (i < 2) await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  }
  await expect(page.locator("form").getByRole("alert")).toContainText("numărul maxim de evenimente");

  // Crearea din cont nu trimite emailuri de confirmare.
  const mailpit = process.env.MAILPIT_URL ?? "http://localhost:54324";
  const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const messages = ((await res.json()) as { messages: { Created: string }[] }).messages;
  expect(messages.filter((m) => new Date(m.Created) >= since)).toHaveLength(0);
});

test("pe pagina principală, organizatorul autentificat creează direct în cont", async ({ page }) => {
  const email = await createOrganizer();
  await loginWithMagicLink(page, email);
  await gotoHydrated(page, "/");
  await expect(page.getByLabel("Adresa de email")).toHaveCount(0);
  const name = uniqueName("Aniversare");
  await page.getByLabel("Numele evenimentului").fill(name);
  await page.getByLabel("Data evenimentului").fill(futureDate(15));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  const { data } = await serviceClient().from("events").select("status, origin").eq("name", name).single();
  expect(data).toEqual({ status: "awaiting_activation", origin: "self_service" });
});

test("administratorul se autentifică cu cod și trece prin al doilea factor", async ({ page }) => {
  await loginAsNewAdmin(page, await createAdmin());
  await expect(page).toHaveURL(/\/admin\/events$/);
});
