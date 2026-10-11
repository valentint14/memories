import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Grup de rute `(liste)`: vezi `app/events/(liste)/loading.tsx` — `admin/events/[eventId]` rămâne în afară,
// ca `notFound()` să păstreze codul 404.
export default function Loading() {
  return <PageSkeleton />;
}
