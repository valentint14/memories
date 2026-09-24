import { expect, test, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { loginWithMagicLink as login } from "./support/auth";
import { createAdmin, randomEmail } from "./support/db";
import { gotoHydrated, uniqueName, waitForHydration } from "./support/page";

// US1 — administratorul creează un eveniment și obține codul QR (quickstart 1–3, 15, 17).
test.describe.configure({ mode: "serial" });

let totp: TOTP;
let adminEmail: string;

async function verifyCode(page: Page): Promise<void> {
  await waitForHydration(page);
  await page.getByLabel("Codul din aplicație").fill(totp.generate());
  await page.getByRole("button", { name: "Verifică" }).click();
  await expect(page).toHaveURL(/\/admin\/events$/);
}

function inputDateTime(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function createEvent(page: Page, name: string): Promise<string> {
  await gotoHydrated(page, "/admin/events/new");
  await page.getByLabel("Numele evenimentului").fill(name);
  await page.getByLabel("Data evenimentului").fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Emailul organizatorului").fill(randomEmail("org"));
  await page.getByLabel("Începutul încărcărilor").fill(inputDateTime(-3_600_000));
  await page.getByLabel("Sfârșitul încărcărilor").fill(inputDateTime(86_400_000));
  await page.getByLabel("Preț de bază (lei)").fill("299");
  await expect(page.getByTestId("price-preview")).toContainText("299,00");
  await expect(page.getByTestId("purge-preview")).toContainText(/\d{4}/);
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const uploadUrl = await page.getByTestId("upload-url").innerText();
  expect(uploadUrl).toMatch(/\/e\/[A-Za-z0-9_-]{22}$/);
  return uploadUrl;
}

test("autentificare cu al doilea factor obligatoriu (FR-006a)", async ({ page }) => {
  adminEmail = await createAdmin();
  await login(page, adminEmail);

  // Fără TOTP, nicio pagină de administrare.
  await expect(page).toHaveURL(/\/auth\/mfa/);
  await page.goto("/admin/events");
  await expect(page).toHaveURL(/\/auth\/mfa/);

  const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  totp = new TOTP({ secret });
  await verifyCode(page);
});

test("creează evenimentul, arată prețul, data ștergerii și descarcă QR-ul", async ({ page }) => {
  await login(page, adminEmail);
  await expect(page).toHaveURL(/\/auth\/mfa/);
  await verifyCode(page);

  const firstName = uniqueName("Nunta Ioana și Radu");
  const url1 = await createEvent(page, firstName);
  const eventUrl = page.url();

  const png = await page.request.get(`${eventUrl}/qr.png`);
  expect(png.headers()["content-type"]).toBe("image/png");
  expect(png.headers()["content-disposition"]).toContain("attachment");
  const body = await png.body();
  // Lățimea și înălțimea din antetul IHDR (octeții 16–23).
  expect(body.readUInt32BE(16)).toBe(2400);
  expect(body.readUInt32BE(20)).toBe(2400);

  const svg = await page.request.get(`${eventUrl}/qr.svg`);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svg.text()).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);

  // Linkurile a două evenimente nu pot fi deduse unul din altul (FR-004).
  const url2 = await createEvent(page, uniqueName("Botezul lui Luca"));
  const token1 = url1.split("/e/")[1] ?? "";
  const token2 = url2.split("/e/")[1] ?? "";
  expect(token1).not.toBe(token2);
  expect(token1.slice(0, 6)).not.toBe(token2.slice(0, 6));

  // Lista arată prețul final, retenția și data ștergerii.
  await page.goto("/admin/events");
  const row = page.getByRole("row", { name: new RegExp(firstName) });
  await expect(row).toContainText("299,00");
  await expect(row).toContainText("3 luni");
  await expect(row).toContainText("0 fișiere");
});

test("validarea formularului arată erorile lângă câmpuri (FR-002)", async ({ page }) => {
  await login(page, adminEmail);
  await verifyCode(page);
  await gotoHydrated(page, "/admin/events/new");
  await page.getByLabel("Numele evenimentului").fill("Test");
  await page.getByLabel("Emailul organizatorului").fill("nu-e-email");
  await page.getByLabel("Începutul încărcărilor").fill(inputDateTime(86_400_000));
  await page.getByLabel("Sfârșitul încărcărilor").fill(inputDateTime(3_600_000));
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page.getByText("Adresa de email nu este validă.")).toBeVisible();
  await expect(page.getByText("Sfârșitul trebuie să fie după început.")).toBeVisible();
});

test("ștergerea evenimentului cere numele și invalidează linkul (FR-006b)", async ({ page }) => {
  await login(page, adminEmail);
  await verifyCode(page);
  const name = uniqueName("Aniversare 30");
  const uploadUrl = await createEvent(page, name);

  await page.getByRole("button", { name: "Șterge evenimentul" }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Șterge definitiv" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Tastează numele evenimentului").fill(name.slice(0, -1));
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Tastează numele evenimentului").fill(name);
  await confirm.click();
  await expect(page).toHaveURL(/\/admin\/events$/);

  await page.goto(uploadUrl);
  await expect(page.getByText("Evenimentul nu a fost găsit")).toBeVisible();
});
