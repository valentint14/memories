import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAsNewAdmin } from "./support/auth";
import { createAdmin } from "./support/db";
import { fillDate, gotoHydrated, waitForHydration } from "./support/page";
import { futureDate } from "./support/self-service";

// Codurile de reducere (005).
const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

test("adminul generează coduri personale și de campanie, apoi dezactivează unul (US1)", async ({ page }) => {
  await loginAsNewAdmin(page, await createAdmin());
  await gotoHydrated(page, "/admin/events");
  await page.getByRole("link", { name: "Coduri de reducere" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Coduri de reducere" })).toBeVisible();
  await waitForHydration(page);

  const form = page.getByRole("region", { name: "Generează coduri" });
  await form.getByLabel("Valoarea reducerii").fill("50");
  await form.getByLabel("Câte coduri").fill("3");
  await fillDate(form, "Valabil până la (opțional)", futureDate(30));
  await form.getByLabel("Notă internă (opțional)").fill("Test e2e");
  await form.getByRole("button", { name: "Generează" }).click();

  const generated = page.getByRole("region", { name: "Coduri generate" });
  await expect(generated.getByRole("listitem")).toHaveCount(3);
  const codes = await generated.getByRole("listitem").allInnerTexts();
  for (const c of codes) expect(c.trim()).toMatch(CODE);
  expect(new Set(codes).size).toBe(3);
  await expect(generated.getByRole("button", { name: "Copiază tot" })).toBeVisible();

  // Cod de campanie: 15%, maxim 30 de utilizări.
  await form.getByRole("button", { name: /Felul codului/ }).click();
  await page.getByRole("option", { name: /De campanie/ }).click();
  await form.getByRole("button", { name: /Tipul reducerii/ }).click();
  await page.getByRole("option", { name: /Procent/ }).click();
  await form.getByLabel("Valoarea reducerii").fill("15");
  await form.getByLabel("Numărul maxim de utilizări").fill("30");
  await form.getByRole("button", { name: "Generează" }).click();
  await expect(generated.getByRole("listitem")).toHaveCount(1);
  const campaign = (await generated.getByRole("listitem").innerText()).trim();

  await page.reload();
  const list = page.getByRole("region", { name: "Coduri" }).last();
  const row = list.getByRole("listitem").filter({ hasText: campaign });
  await expect(row).toContainText("0 din 30 utilizări");
  await expect(row).toContainText("15%");

  // Dezactivarea unui cod personal.
  const personal = list.getByRole("listitem").filter({ hasText: codes[0]?.trim() ?? "" });
  await personal.getByRole("button", { name: "Dezactivează" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Dezactivează" }).click();
  await expect(personal).toContainText("Dezactivat");

  await waitForHydration(page);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
});
