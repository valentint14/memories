/**
 * Integrarea actualizărilor în galerie (FR-033): upsert după `id`, eliminarea celor șterse,
 * ordine cronologică stabilă după `(uploadedAt, id)`. Funcție pură, fără duplicate.
 */
import type { GalleryItem } from "../organizer/media";

function compare(a: GalleryItem, b: GalleryItem): number {
  if (a.uploadedAt !== b.uploadedAt) return a.uploadedAt < b.uploadedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function mergeGallery(
  current: readonly GalleryItem[],
  incoming: readonly GalleryItem[],
  removedIds: readonly string[],
): GalleryItem[] {
  const byId = new Map(current.map((i) => [i.id, i]));
  for (const item of incoming) {
    const previous = byId.get(item.id);
    // Un URL semnat valid nu se pierde dacă actualizarea nu are încă miniatura semnată.
    byId.set(item.id, previous && item.thumbUrl === null && previous.thumbUrl !== null ? { ...item, thumbUrl: previous.thumbUrl } : item);
  }
  for (const id of removedIds) byId.delete(id);
  return [...byId.values()].sort(compare);
}

/** Cursorul de resincronizare: cel mai recent `updatedAt` văzut. */
export function latestUpdatedAt(items: readonly GalleryItem[]): string | null {
  let latest: string | null = null;
  for (const i of items) if (latest === null || i.updatedAt > latest) latest = i.updatedAt;
  return latest;
}
