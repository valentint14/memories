import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Vezi `app/events/(liste)/loading.tsx`: grupul are doar pagini de citire, fără formulare și fără
// `notFound()`; `admin/events/[eventId]` și paginile cu formulare rămân în afara lui.
export default function Loading() {
  return <PageSkeleton />;
}
