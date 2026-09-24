import { describe, expect, it } from "vitest";
import { archiveEntryName, safeNamePart, uniqueEntryNames } from "./archive-naming.ts";

describe("archiveEntryName (research.md R9)", () => {
  it("folosește data și ora locale, numele invitatului și un id scurt", () => {
    expect(
      archiveEntryName({
        uploadedAt: "2026-06-20T17:05:09Z",
        guestName: "Maria Popescu",
        id: "3f2f6a1c-6f8e-4d3a-9b1d-2a7c5e8f9a10",
        extension: "jpg",
      }),
    ).toBe("2026-06-20_20-05-09_Maria-Popescu_3f2f6a1c.jpg");
  });

  it("scrie „anonim” pentru invitații fără nume", () => {
    expect(
      archiveEntryName({ uploadedAt: "2026-01-10T08:00:00Z", guestName: null, id: "abcdef12-0000", extension: "heic" }),
    ).toBe("2026-01-10_10-00-00_anonim_abcdef12.heic");
  });
});

describe("safeNamePart", () => {
  it("păstrează diacriticele și emoji, elimină separatorii de cale și caracterele de control", () => {
    expect(safeNamePart("Ștefan / Țuțu 🌸")).toBe("Ștefan-Țuțu-🌸");
    expect(safeNamePart("..\\..\\etc\u0000passwd")).toBe("etcpasswd");
    expect(safeNamePart('a:b*c?d"e<f>g|h')).toBe("abcdefgh");
  });

  it("scurtează numele lungi și întoarce „anonim” pentru rezultate goale", () => {
    expect(safeNamePart("x".repeat(80))).toHaveLength(40);
    expect(safeNamePart("   ")).toBe("anonim");
    expect(safeNamePart("///")).toBe("anonim");
  });
});

describe("uniqueEntryNames", () => {
  it("face numele unice chiar dacă se repetă", () => {
    expect(uniqueEntryNames(["a.jpg", "a.jpg", "b.jpg", "a.jpg"])).toEqual(["a.jpg", "a-2.jpg", "b.jpg", "a-3.jpg"]);
  });
});
