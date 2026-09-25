import { expect, test } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createAdmin, createOrganizer, serviceClient } from "./support/db";
import { waitForEmail } from "./support/mailpit";
import { gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// US3 — evenimentul în așteptarea activării (002: FR-017–FR-019, FR-018a).
test("panoul arată prețul, ce include, data ștergerii și trimite cererea de activare", async ({ page }) => {
  const adminEmail = await createAdmin();
  const email = await createOrganizer();
  await loginWithMagicLink(page, email);

  const name = uniqueName("Nunta Elena");
  await gotoHydrated(page, "/events/new");
  await page.getByLabel("Numele evenimentului").fill(name);
  await page.getByLabel("Data evenimentului").fill(futureDate(20));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  const eventId = page.url().split("/").pop() ?? "";

  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await expect(panel).toContainText("Preț: 299,00");
  await expect(panel).toContainText("3 luni");
  await expect(panel).toContainText("se șterge automat pe");
  await expect(page.getByRole("link", { name: "Descarcă codul QR (PNG)" })).toBeVisible();

  const since = new Date();
  await panel.getByRole("button", { name: "Solicită activarea" }).click();
  await expect(panel.getByRole("status")).toContainText("Cerere trimisă pe");
  await expect(panel.getByRole("button", { name: "Solicită activarea" })).toHaveCount(0);
  await expect(panel).toContainText("Poți trimite o nouă cerere după");

  // Administratorii din platform_admins primesc emailul (ADMIN_NOTIFY_EMAILS e gol local).
  const mail = await waitForEmail(adminEmail, { since, subjectIncludes: "Cerere de activare" });
  expect(mail.Text).toContain(`/admin/events/${eventId}`);

  // După reîncărcare, cererea rămâne afișată.
  await page.reload();
  await expect(panel.getByRole("status")).toContainText("Cerere trimisă pe");
  const { data } = await serviceClient().from("activation_requests").select("id").eq("event_id", eventId);
  expect(data).toHaveLength(1);
});
