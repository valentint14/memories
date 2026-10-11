import { describe, expect, it } from "vitest";
import { headingId } from "../../lib/heading-id";

describe("headingId", () => {
  it("scoate numărul, diacriticele și spațiile din titlu", () => {
    expect(headingId("5. Retragere și rambursări")).toBe("retragere-si-rambursari");
    expect(headingId("10. Legea aplicabilă și soluționarea litigiilor")).toBe("legea-aplicabila-si-solutionarea-litigiilor");
  });
});
