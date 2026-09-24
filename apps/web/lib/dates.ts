/** Conversii între valorile câmpurilor `datetime-local` (ora browserului) și ISO 8601. */

const pad = (n: number) => String(n).padStart(2, "0");

export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valoare goală sau invalidă → șir gol (serverul întoarce eroarea de validare). */
export function localInputToIso(value: string): string {
  if (value === "") return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
