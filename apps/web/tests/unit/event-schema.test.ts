import { describe, expect, it } from "vitest";
import { eventInputSchema } from "../../lib/validation/event";

const valid = {
  name: "Nunta Ana și Mihai",
  eventDate: "2026-10-10",
  organizerEmail: "ana@example.test",
  uploadStartsAt: "2026-10-10T14:00:00.000Z",
  uploadEndsAt: "2026-10-11T06:00:00.000Z",
  maxFilesPerGuest: 50,
  maxPhotoMb: 50,
  maxVideoMb: 1024,
  basePriceLei: 299,
  retentionOptionId: "3f2f6a1c-6f8e-4d3a-9b1d-2a7c5e8f9a10",
};

function fieldsOf(input: unknown): string[] {
  const result = eventInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

describe("eventInputSchema (FR-001, FR-001a, FR-002, FR-039)", () => {
  it("acceptă un eveniment valid și convertește unitățile", () => {
    const parsed = eventInputSchema.parse(valid);
    expect(parsed.maxPhotoBytes).toBe(52_428_800);
    expect(parsed.maxVideoBytes).toBe(1_073_741_824);
    expect(parsed.basePriceMinor).toBe(29_900);
  });

  it("taie spațiile din nume și refuză numele peste 120 de caractere", () => {
    expect(eventInputSchema.parse({ ...valid, name: "  Botez  " }).name).toBe("Botez");
    expect(fieldsOf({ ...valid, name: "x".repeat(121) })).toContain("name");
    expect(fieldsOf({ ...valid, name: "   " })).toContain("name");
  });

  it("refuză un email invalid", () => {
    expect(fieldsOf({ ...valid, organizerEmail: "ana@" })).toContain("organizerEmail");
  });

  it("refuză o perioadă de upload în care sfârșitul nu e după început", () => {
    expect(fieldsOf({ ...valid, uploadEndsAt: valid.uploadStartsAt })).toContain("uploadEndsAt");
  });

  it("refuză limitele nepozitive sau peste plafoanele platformei", () => {
    expect(fieldsOf({ ...valid, maxFilesPerGuest: 0 })).toContain("maxFilesPerGuest");
    expect(fieldsOf({ ...valid, maxFilesPerGuest: 1001 })).toContain("maxFilesPerGuest");
    expect(fieldsOf({ ...valid, maxPhotoMb: 51 })).toContain("maxPhotoMb");
    expect(fieldsOf({ ...valid, maxVideoMb: 0 })).toContain("maxVideoMb");
    expect(fieldsOf({ ...valid, maxVideoMb: 1025 })).toContain("maxVideoMb");
  });

  it("refuză un preț negativ", () => {
    expect(fieldsOf({ ...valid, basePriceLei: -1 })).toContain("basePriceLei");
  });
});
