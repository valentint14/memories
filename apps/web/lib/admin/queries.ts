import "server-only";
import { serverEnv } from "../server-env";
import { throwIfDbError } from "../actions/result";
import { requireAdminPage as requireAdmin } from "./guard";

export interface AdminEventRow {
  id: string;
  name: string | null;
  eventDate: string;
  organizerEmail: string | null;
  status: "active" | "expiring" | "expired" | "deleting";
  finalPriceMinor: number;
  retentionMonths: number;
  purgeAt: string;
  anonymizedAt: string | null;
  fileCount: number;
  totalBytes: number;
}

/** Lista evenimentelor cu statistici agregate (FR-003, FR-007) — fără acces la media. */
export async function listEvents(): Promise<AdminEventRow[]> {
  const supabase = await requireAdmin();
  const [events, stats] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, event_date, organizer_email, status, final_price_minor, retention_months, purge_at, anonymized_at")
      .neq("status", "deleting")
      .order("event_date", { ascending: false }),
    supabase.rpc("admin_event_stats", {}),
  ]);
  throwIfDbError(events.error);
  throwIfDbError(stats.error);
  const byId = new Map((stats.data ?? []).map((s) => [s.event_id, s]));
  return (events.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    eventDate: e.event_date,
    organizerEmail: e.organizer_email,
    status: e.status,
    finalPriceMinor: e.final_price_minor ?? 0,
    retentionMonths: e.retention_months,
    purgeAt: e.purge_at,
    anonymizedAt: e.anonymized_at,
    fileCount: byId.get(e.id)?.file_count ?? 0,
    totalBytes: byId.get(e.id)?.total_bytes ?? 0,
  }));
}

export interface AdminEventDetail extends AdminEventRow {
  uploadStartsAt: string;
  uploadEndsAt: string;
  maxFilesPerGuest: number;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  basePriceMinor: number;
  retentionOptionId: string;
  uploadUrl: string;
}

export async function getEvent(eventId: string): Promise<AdminEventDetail | null> {
  const supabase = await requireAdmin();
  const { data: e, error } = await supabase
    .from("events")
    .select(
      "id, name, event_date, organizer_email, status, final_price_minor, retention_months, purge_at, anonymized_at, upload_starts_at, upload_ends_at, max_files_per_guest, max_photo_bytes, max_video_bytes, base_price_minor, retention_option_id",
    )
    .eq("id", eventId)
    .neq("status", "deleting")
    .maybeSingle();
  throwIfDbError(error);
  if (!e) return null;
  const [token, stats] = await Promise.all([
    supabase.rpc("admin_event_token", { p_event_id: eventId }),
    supabase.rpc("admin_event_stats", { p_event_id: eventId }),
  ]);
  throwIfDbError(token.error);
  const stat = stats.data?.[0];
  return {
    id: e.id,
    name: e.name,
    eventDate: e.event_date,
    organizerEmail: e.organizer_email,
    status: e.status,
    finalPriceMinor: e.final_price_minor ?? 0,
    retentionMonths: e.retention_months,
    purgeAt: e.purge_at,
    anonymizedAt: e.anonymized_at,
    fileCount: stat?.file_count ?? 0,
    totalBytes: stat?.total_bytes ?? 0,
    uploadStartsAt: e.upload_starts_at,
    uploadEndsAt: e.upload_ends_at,
    maxFilesPerGuest: e.max_files_per_guest,
    maxPhotoBytes: e.max_photo_bytes,
    maxVideoBytes: e.max_video_bytes,
    basePriceMinor: e.base_price_minor,
    retentionOptionId: e.retention_option_id,
    uploadUrl: new URL(`/e/${token.data ?? ""}`, serverEnv.appUrl).toString(),
  };
}

export interface RetentionOptionRow {
  id: string;
  months: number;
  surchargeMinor: number;
  active: boolean;
}

export async function listActiveRetentionOptions(): Promise<RetentionOptionRow[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from("retention_options")
    .select("id, months, surcharge_minor, active")
    .eq("active", true)
    .order("months");
  throwIfDbError(error);
  return (data ?? []).map((o) => ({ id: o.id, months: o.months, surchargeMinor: o.surcharge_minor, active: o.active }));
}

export interface CatalogOptionRow extends RetentionOptionRow {
  usedBy: number;
}

/** Catalogul complet (inclusiv opțiunile inactive), cu numărul de evenimente care le folosesc. */
export async function listRetentionCatalog(): Promise<CatalogOptionRow[]> {
  const supabase = await requireAdmin();
  const [options, events] = await Promise.all([
    supabase.from("retention_options").select("id, months, surcharge_minor, active").order("months"),
    supabase.from("events").select("retention_option_id"),
  ]);
  throwIfDbError(options.error);
  throwIfDbError(events.error);
  const usage = new Map<string, number>();
  for (const e of events.data ?? []) usage.set(e.retention_option_id, (usage.get(e.retention_option_id) ?? 0) + 1);
  return (options.data ?? []).map((o) => ({
    id: o.id,
    months: o.months,
    surchargeMinor: o.surcharge_minor,
    active: o.active,
    usedBy: usage.get(o.id) ?? 0,
  }));
}

export interface RetentionChangeRow {
  at: string;
  actorKind: "admin" | "organizer" | "system";
  fromMonths: number | null;
  toMonths: number;
  fromFinalPriceMinor: number | null;
  toFinalPriceMinor: number;
  toPurgeAt: string;
}

/** Istoricul schimbărilor de retenție și preț (FR-043). */
export async function listRetentionChanges(eventId: string): Promise<RetentionChangeRow[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from("event_retention_changes")
    .select("created_at, actor_kind, from_months, to_months, from_final_price_minor, to_final_price_minor, to_purge_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  throwIfDbError(error);
  return (data ?? []).map((c) => ({
    at: c.created_at,
    actorKind: c.actor_kind,
    fromMonths: c.from_months,
    toMonths: c.to_months,
    fromFinalPriceMinor: c.from_final_price_minor,
    toFinalPriceMinor: c.to_final_price_minor,
    toPurgeAt: c.to_purge_at,
  }));
}
