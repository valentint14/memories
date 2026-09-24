import { expect, test } from "@playwright/test";
import { randomEmail, serviceClient } from "./support/db";
import { waitForHydration, uniqueName } from "./support/page";
import { codeFromEmail, enterCode, failedAttempts, futureDate, submitCreateForm } from "./support/self-service";

// US1 — vizitatorul își creează singur un eveniment (002: FR-001–FR-009, SC-001–SC-004).

test("creează evenimentul de pe pagina principală și îl confirmă cu codul din email", async ({ page }) => {
  const email = randomEmail("ss-code");
  const name = uniqueName("Nunta Ioana");
  const since = new Date();
  await submitCreateForm(page, { email, name });
  await expect(page.getByRole("heading", { name: "Verifică-ți emailul" })).toBeVisible();

  const { code } = await codeFromEmail(email, since);
  await waitForHydration(page);
  await enterCode(page, code);

  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("În așteptarea activării").first()).toBeVisible();

  const qr = page.getByRole("link", { name: "Descarcă codul QR (PNG)" });
  const response = await page.request.get((await qr.getAttribute("href")) ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("confirmă prin link pe alt dispozitiv, doar după apăsarea butonului", async ({ page, browser }) => {
  const email = randomEmail("ss-link");
  const name = uniqueName("Botez");
  const since = new Date();
  await submitCreateForm(page, { email, name });
  const { link } = await codeFromEmail(email, since);

  const phone = await browser.newContext(test.info().project.use);
  try {
    const other = await phone.newPage();
    await other.goto(link);
    await expect(other.getByRole("heading", { name: "Confirmă evenimentul" })).toBeVisible();
    await expect(other.getByText(name)).toBeVisible();
    // Deschiderea linkului nu a confirmat nimic.
    const before = await serviceClient().from("events").select("status").eq("name", name).single();
    expect(before.data?.status).toBe("unconfirmed");

    await other.getByRole("button", { name: "Confirmă" }).click();
    await expect(other).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    await expect(other.getByRole("heading", { name })).toBeVisible();
  } finally {
    await phone.close();
  }
});

test("deschiderea linkului fără buton nu consumă codul", async ({ page, browser }) => {
  const email = randomEmail("ss-scanner");
  const since = new Date();
  await submitCreateForm(page, { email, name: uniqueName("Cununie") });
  const { code, link } = await codeFromEmail(email, since);

  // Un scaner de email deschide linkul, fără interacțiune.
  const scanner = await browser.newContext();
  await (await scanner.newPage()).goto(link);
  await scanner.close();

  await waitForHydration(page);
  await enterCode(page, code);
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
});

test("după 5 coduri greșite, cererea e invalidată și se poate cere un cod nou", async ({ page }) => {
  const email = randomEmail("ss-wrong");
  const since = new Date();
  await submitCreateForm(page, { email, name: uniqueName("Aniversare") });
  const { code } = await codeFromEmail(email, since);
  await waitForHydration(page);

  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 1; i <= 4; i++) {
    await enterCode(page, wrong);
    await expect.poll(() => failedAttempts(page)).toBe(i);
    await expect(page.locator("form").getByRole("alert")).toContainText("Codul nu este corect");
  }
  await enterCode(page, wrong);
  await expect.poll(() => failedAttempts(page)).toBe(5);
  await expect(page.locator("form").getByRole("alert")).toContainText("de prea multe ori");
  await enterCode(page, code);
  await expect(page.locator("form").getByRole("alert")).toContainText("Cere unul nou");

  const resent = new Date();
  await page.getByRole("button", { name: "Trimite din nou codul" }).click();
  const { code: fresh } = await codeFromEmail(email, resent);
  await enterCode(page, fresh);
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
});

test("afișează erorile lângă câmpuri și nu trimite formularul incomplet", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);
  await page.getByLabel("Adresa de email").fill("nu-e-email");
  await page.getByLabel("Numele evenimentului").fill("Nunta");
  await page.getByLabel("Data evenimentului").fill("2020-01-01");
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Adresa de email nu este validă.")).toBeVisible();
  await expect(page.getByText("Alege o dată între azi și peste 2 ani.")).toBeVisible();
  await expect(page.getByText("Trebuie să accepți termenii și politica de confidențialitate.")).toBeVisible();
});

test("răspunsul e același pentru o adresă existentă și pentru una nouă", async ({ page }) => {
  const pages: string[] = [];
  for (const email of ["org-a@example.test", randomEmail("ss-new")]) {
    await submitCreateForm(page, { email, name: uniqueName("Test"), date: futureDate(40) });
    pages.push((await page.locator("main").innerText()).trim());
  }
  expect(pages[0]).toBe(pages[1]);
});
