import type { AdminEventRow } from "./queries";

/**
 * Registrul evenimentelor din administrare: grupe în ordinea în care cer atenție. Cererile de
 * activare stau primele, fiindcă doar ele așteaptă o acțiune de la administrator.
 */
export const LEDGER_GROUPS = ["requested", "awaiting", "active", "suspended", "expiring", "ended"] as const;
export type LedgerGroup = (typeof LEDGER_GROUPS)[number];
/** Fila selectată: toate grupele sau una singură. */
export type LedgerView = "all" | LedgerGroup;

type GroupInput = Pick<AdminEventRow, "status" | "lastActivationRequestAt">;

export function groupOf(e: GroupInput): LedgerGroup {
  switch (e.status) {
    case "awaiting_activation":
      return e.lastActivationRequestAt !== null ? "requested" : "awaiting";
    case "active":
      return "active";
    case "suspended":
      return "suspended";
    case "expiring":
      return "expiring";
    default:
      return "ended";
  }
}

/** Evenimentele activate au preț, fișiere și dată de ștergere; cele neactivate, încă nu. */
export function isActivated(e: GroupInput): boolean {
  return e.status !== "awaiting_activation";
}

export function parseView(value: string | undefined): LedgerView {
  return LEDGER_GROUPS.find((g) => g === value) ?? "all";
}

/** Fără diacritice și fără majuscule: „Nuntă” se găsește și cu „nunta”. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

type SearchInput = Pick<AdminEventRow, "name" | "organizerEmail" | "anonymizedAt">;

/** Caută în numele evenimentului și în emailul organizatorului (nu și în cele anonimizate). */
export function matchesQuery(e: SearchInput, query: string): boolean {
  const q = fold(query.trim());
  if (q === "") return true;
  if (e.anonymizedAt !== null) return false;
  return [e.name, e.organizerEmail].some((v) => v !== null && fold(v).includes(q));
}

export interface Ledger<T> {
  /** Numărul de evenimente din fiecare grupă, după căutare (pentru file). */
  counts: Record<LedgerGroup, number>;
  total: number;
  /** Grupele de afișat pentru fila aleasă, fără cele goale (în afară de fila cerută explicit). */
  groups: { id: LedgerGroup; rows: T[] }[];
}

export function buildLedger<T extends GroupInput & SearchInput>(rows: T[], { view, query }: { view: LedgerView; query: string }): Ledger<T> {
  const found = rows.filter((r) => matchesQuery(r, query));
  const byGroup = new Map<LedgerGroup, T[]>(LEDGER_GROUPS.map((g) => [g, []]));
  for (const r of found) byGroup.get(groupOf(r))?.push(r);
  const counts = Object.fromEntries(LEDGER_GROUPS.map((g) => [g, byGroup.get(g)?.length ?? 0])) as Record<LedgerGroup, number>;
  const groups =
    view === "all"
      ? LEDGER_GROUPS.filter((g) => counts[g] > 0).map((id) => ({ id, rows: byGroup.get(id) ?? [] }))
      : [{ id: view, rows: byGroup.get(view) ?? [] }];
  return { counts, total: found.length, groups };
}
