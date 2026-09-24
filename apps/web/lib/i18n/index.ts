import { APP_TIME_ZONE } from "@memories/shared";
import { ro, type PluralMessage } from "./messages/ro";

type Dictionary = typeof ro;
export type MessageKey = { [K in keyof Dictionary]: Dictionary[K] extends string ? K : never }[keyof Dictionary];
export type PluralKey = { [K in keyof Dictionary]: Dictionary[K] extends PluralMessage ? K : never }[keyof Dictionary];
type Params = Record<string, string | number>;

const LOCALE = "ro-RO";
const pluralRules = new Intl.PluralRules("ro");

function interpolate(template: string, params: Params | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function t(key: MessageKey, params?: Params): string {
  return interpolate(ro[key], params);
}

export function tp(key: PluralKey, count: number, params?: Params): string {
  const forms: PluralMessage = ro[key];
  const category = pluralRules.select(count);
  const template = category === "one" ? forms.one : category === "few" ? forms.few : forms.other;
  return interpolate(template, { ...params, count });
}

const moneyFormat = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "RON" });
export function formatMoney(minor: number): string {
  return moneyFormat.format(minor / 100);
}

const dateFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: APP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function formatDate(value: Date | string): string {
  return dateFormat.format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  const date = new Date(value);
  return `${dateFormat.format(date)}, ${timeFormat.format(date)}`;
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
  return `${rounded} ${units[unit] ?? "B"}`;
}
