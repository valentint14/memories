import { expect, test } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createOrganizer, serviceClient } from "./support/db";
import { fillDate, gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// US3 (002) — evenimentul în așteptarea activării: prețul, ce include, data ștergerii (FR-017–FR-019);
// cererea de activare e înlocuită de plata online (003: FR-001, FR-015).
test("panoul arată prețul, ce include, data ștergerii și plata, fără cererea de activare", async ({ page }) => {
  const email = await createOrganizer();
  await loginWithMagicLink(page, email);

  const name = uniqueName("Nunta Elena");
  await gotoHydrated(page, "/events/new");
  await page.getByLabel("Numele evenimentului").fill(name);
  await fillDate(page, "Data evenimentului", futureDate(20));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  const eventId = page.url().split("/").pop() ?? "";

  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await expect(panel).toContainText("Preț: 299,00");
  await expect(panel).toContainText("3 luni");
  await expect(panel).toContainText("se șterge automat pe");
  await expect(panel.getByRole("radio", { name: /^3 luni \(inclusă\)/ })).toBeChecked();
  await expect(panel.getByRole("button", { name: "Plătește și activează" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Solicită activarea" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Descarcă codul QR (PNG)" })).toBeVisible();

  const { data } = await serviceClient().from("activation_requests").select("id").eq("event_id", eventId);
  expect(data).toEqual([]);
});
