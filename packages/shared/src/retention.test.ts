import { describe, expect, it } from "vitest";
import { computePurgeAt, finalPriceMinor, leiToMinor } from "./retention.ts";

// Aceleași cazuri ca supabase/tests/functions/purge-at.test.ts (regula SQL `compute_purge_at`).
describe("computePurgeAt", () => {
  it("adaugă luni calendaristice în ora locală", () => {
    // 15 feb 12:00 EET (UTC+2) + 3 luni = 15 mai 12:00 EEST (UTC+3)
    expect(computePurgeAt(new Date("2026-02-15T10:00:00Z"), 3).toISOString()).toBe("2026-05-15T09:00:00.000Z");
  });

  it("limitează ziua la sfârșitul lunii (31 ian + 1 lună)", () => {
    expect(computePurgeAt(new Date("2026-01-31T18:00:00Z"), 1).toISOString()).toBe("2026-02-28T18:00:00.000Z");
  });

  it("păstrează miezul nopții local peste trecerea la ora de iarnă", () => {
    // 1 oct 00:00 EEST (30 sep 21:00Z) + 1 lună = 1 nov 00:00 EET (31 oct 22:00Z)
    expect(computePurgeAt(new Date("2026-09-30T21:00:00Z"), 1).toISOString()).toBe("2026-10-31T22:00:00.000Z");
  });

  it("trece peste sfârșitul anului", () => {
    expect(computePurgeAt(new Date("2026-11-20T10:00:00Z"), 12).toISOString()).toBe("2027-11-20T10:00:00.000Z");
  });

  it("refuză durate în afara catalogului (1–60 luni)", () => {
    expect(() => computePurgeAt(new Date(), 0)).toThrow(RangeError);
    expect(() => computePurgeAt(new Date(), 61)).toThrow(RangeError);
  });
});

describe("prețuri", () => {
  it("prețul final = bază + supliment, în bani", () => {
    expect(finalPriceMinor(29_900, 9_900)).toBe(39_800);
  });

  it("convertește lei în bani fără erori de rotunjire", () => {
    expect(leiToMinor(0.1 + 0.2)).toBe(30);
    expect(leiToMinor(299)).toBe(29_900);
  });
});
