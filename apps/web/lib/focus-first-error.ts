"use client";

import { useEffect, useRef } from "react";

const INVALID = '[aria-invalid="true"], [data-invalid]';
const FOCUSABLE = 'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])';

/**
 * După o trimitere respinsă de server, duce utilizatorul la primul câmp cu eroare din pagină (în
 * ordinea din document): îl derulează în vizor și îi dă focusul, ca să poată corecta de la tastatură
 * și ca cititoarele de ecran să-i citească eticheta și mesajul. Câmpurile compuse (data) marchează
 * grupul, nu elementul focalizabil: se alege primul element focalizabil dinăuntru.
 *
 * `signal` trebuie să fie `null` cât timp nu există erori și o valoare nouă la fiecare răspuns cu
 * erori (starea din `useActionState` sau obiectul de erori din `useState` îndeplinesc ambele condiții).
 */
export function useFocusFirstError<T extends HTMLElement>(signal: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (signal === null || signal === undefined || ref.current === null) return;
    const marked = ref.current.querySelector<HTMLElement>(INVALID);
    const target = marked?.matches(FOCUSABLE) ? marked : marked?.querySelector<HTMLElement>(FOCUSABLE);
    if (target === null || target === undefined) return;
    target.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }, [signal]);
  return ref;
}
