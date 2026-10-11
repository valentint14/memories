import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Grupul de rute `(liste)` conține doar pagini de citire, fără formulare și fără `notFound()`:
// - un `loading.tsx` începe răspunsul înainte ca pagina să se rezolve, deci codul 404 (evenimentul
//   altui organizator, FR-009) n-ar mai putea fi trimis; `events/[eventId]` rămâne în afara grupului;
// - conținutul din spatele lui se hidratează după restul paginii, iar un formular completat înainte
//   de hidratare își pierde valorile (testele e2e pe iPhone au prins-o la `events/new`).
export default function Loading() {
  return <PageSkeleton />;
}
