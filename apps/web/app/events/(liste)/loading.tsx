import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Grup de rute `(liste)`: doar paginile care nu apelează `notFound()`. Un `loading.tsx` începe
// răspunsul înainte ca pagina să se rezolve, iar codul 404 (evenimentul altui organizator, FR-009)
// n-ar mai putea fi trimis; `events/[eventId]` rămâne deci în afara grupului.
export default function Loading() {
  return <PageSkeleton />;
}
