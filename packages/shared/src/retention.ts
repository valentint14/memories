/**
 * Data ștergerii automate și prețul final (FR-039, FR-040). Aceeași regulă ca trigger-ul SQL
 * `compute_purge_at`: se adună luni calendaristice în ora locală Europe/Bucharest.
 */

import { APP_TIME_ZONE } from "./limits.ts";

interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function toLocalParts(date: Date): LocalParts {
  const map: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return {
    year: map.year ?? 0,
    month: map.month ?? 1,
    day: map.day ?? 1,
    hour: map.hour ?? 0,
    minute: map.minute ?? 0,
    second: map.second ?? 0,
    ms: date.getUTCMilliseconds(),
  };
}

/** Offset-ul (ms) al fusului local față de UTC la momentul dat. */
function offsetAt(utcMs: number): number {
  const p = toLocalParts(new Date(utcMs));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.ms);
  return asUtc - utcMs;
}

/** Transformă o oră locală (fără fus) în momentul UTC corespunzător, ca `at time zone` din Postgres. */
function fromLocalParts(p: LocalParts): Date {
  const naive = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.ms);
  let utc = naive - offsetAt(naive);
  // A doua iterație corectează trecerile la/de la ora de vară.
  utc = naive - offsetAt(utc);
  return new Date(utc);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adaugă luni calendaristice ca Postgres: ziua se limitează la ultima zi a lunii (31 ian + 1 lună = 28/29 feb). */
export function computePurgeAt(uploadEndsAt: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    throw new RangeError("months trebuie să fie între 1 și 60");
  }
  const local = toLocalParts(uploadEndsAt);
  const totalMonths = local.year * 12 + (local.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const day = Math.min(local.day, daysInMonth(year, month));
  return fromLocalParts({ ...local, year, month, day });
}

export function finalPriceMinor(baseMinor: number, surchargeMinor: number): number {
  return baseMinor + surchargeMinor;
}

/** Lei (cu zecimale) → bani, fără erori de virgulă mobilă. */
export function leiToMinor(lei: number): number {
  return Math.round(lei * 100);
}

export function minorToLei(minor: number): number {
  return minor / 100;
}
