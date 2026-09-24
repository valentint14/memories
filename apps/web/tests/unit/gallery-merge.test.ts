import { describe, expect, it } from "vitest";
import { latestUpdatedAt, mergeGallery } from "../../lib/gallery/merge";
import type { GalleryItem } from "../../lib/organizer/media";

function item(id: string, uploadedAt: string, patch: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id,
    kind: "photo",
    status: "ready",
    guestName: null,
    uploadedAt,
    updatedAt: uploadedAt,
    thumbUrl: null,
    width: null,
    height: null,
    durationMs: null,
    ...patch,
  };
}

describe("mergeGallery (FR-033)", () => {
  it("adaugă elementele noi în poziția cronologică corectă", () => {
    const current = [item("a", "2026-06-20T10:00:00Z"), item("c", "2026-06-20T12:00:00Z")];
    const merged = mergeGallery(current, [item("b", "2026-06-20T11:00:00Z")], []);
    expect(merged.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("actualizează elementele existente fără duplicate (resincronizare după Realtime)", () => {
    const current = [item("a", "2026-06-20T10:00:00Z", { status: "processing" })];
    const merged = mergeGallery(current, [item("a", "2026-06-20T10:00:00Z", { status: "ready", thumbUrl: "x" })], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("ready");
    expect(merged[0]?.thumbUrl).toBe("x");
  });

  it("elimină elementele șterse", () => {
    const current = [item("a", "2026-06-20T10:00:00Z"), item("b", "2026-06-20T11:00:00Z")];
    expect(mergeGallery(current, [], ["a"]).map((i) => i.id)).toEqual(["b"]);
  });

  it("la același moment de încărcare ordonează după id", () => {
    const t = "2026-06-20T10:00:00Z";
    expect(mergeGallery([], [item("b", t), item("a", t)], []).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("nu păstrează o miniatură semnată mai veche peste una nouă lipsă doar temporar", () => {
    const current = [item("a", "2026-06-20T10:00:00Z", { thumbUrl: "vechi" })];
    const merged = mergeGallery(current, [item("a", "2026-06-20T10:00:00Z", { thumbUrl: null, status: "ready" })], []);
    expect(merged[0]?.thumbUrl).toBe("vechi");
  });
});

describe("latestUpdatedAt", () => {
  it("întoarce cel mai recent `updatedAt` (cursorul de resincronizare)", () => {
    expect(
      latestUpdatedAt([
        item("a", "2026-06-20T10:00:00Z", { updatedAt: "2026-06-20T10:05:00Z" }),
        item("b", "2026-06-20T11:00:00Z", { updatedAt: "2026-06-20T11:01:00Z" }),
      ]),
    ).toBe("2026-06-20T11:01:00Z");
    expect(latestUpdatedAt([])).toBeNull();
  });
});
