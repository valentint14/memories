import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "@memories/shared";
import { formatDateTime, formatMoney, formatBytes, t, tp } from "../../lib/i18n";
import { ro } from "../../lib/i18n/messages/ro";

describe("t()", () => {
  it("interpolează parametrii", () => {
    expect(t("upload.limitReached", { limit: 5 })).toBe("Ai atins limita de 5 fișiere pentru acest eveniment.");
  });

  it("are un mesaj în română pentru fiecare cod de eroare", () => {
    for (const code of ERROR_CODES) {
      expect(ro[`errors.${code}`], code).toBeTypeOf("string");
    }
  });
});

describe("tp() — pluralul românesc", () => {
  it.each([
    [1, "1 fișier"],
    [2, "2 fișiere"],
    [19, "19 fișiere"],
    [20, "20 de fișiere"],
    [101, "101 fișiere"],
    [120, "120 de fișiere"],
  ])("%i → %s", (count, expected) => {
    expect(tp("plural.files", count)).toBe(expected);
  });
});

describe("formatare", () => {
  it("afișează sumele în lei, din bani", () => {
    expect(formatMoney(39_800)).toMatch(/^398,00\sRON$/);
  });

  it("afișează datele în ora României", () => {
    expect(formatDateTime(new Date("2026-05-15T09:00:00Z"))).toBe("15 mai 2026, 12:00");
  });

  it("afișează dimensiunile în MB/GB", () => {
    expect(formatBytes(52_428_800)).toBe("50 MB");
    expect(formatBytes(1_073_741_824)).toBe("1 GB");
  });
});
