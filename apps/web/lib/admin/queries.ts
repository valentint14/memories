import "server-only";
import { serverEnv } from "../server-env";
import { throwIfDbError } from "../actions/result";
import type { Database } from "../supabase/types";
import { requireAdminPage as requireAdmin } from "./guard";

type EventStatus = Database["public"]["Enums"]["event_status"];

export interface AdminEventRow {
  id: string;
  name: string | null;
  eventDate: string;
  organizerEmail: string | null;
  status: EventStatus;
  origin: "admin" | "self_service";
  finalPriceMinor: number;
  retentionMonths: number;
  /** Null până la activare (002/FR-025). */
  purgeAt: string | null;
  pendingPurgeAt: string | null;
  createdAt: string;
  anonymizedAt: string | null;
  fileCount: number;
  totalBytes: number;
  /** Ultima cerere de activare (002/FR-018a, FR-027). */
  lastActivationRequestAt: string | null;
}

export interface EventFilters {
  origin?: "admin" | "self_service" | undefined;
  status?: EventStatus | undefined;
  /** Doar evenimentele neactivate cu cerere de activare (002/FR-027). */
  requested?: boolean | undefined;
}

/** Lista evenimentelor cu statistici agregate (001/FR-003, FR-007; 002/FR-027) — fără acces la media. */
export async function listEvents(filters: EventFilters = {}): Promise<AdminEventRow[]> {
  const supabase = await requireAdmin();
  let query = supabase
    .from("events")
    .select("id, name, event_date, organizer_email, status, origin, final_price_minor, retention_months, purge_at, pending_purge_at, created_at, anonymized_at")
    .not("status", "in", "(deleting,unconfirmed)")
    .order("created_at", { ascending: false });
  if (filters.origin) query = query.eq("origin", filters.origin);
  if (filters.status) query = query.eq("status", filters.status);
  const [events, stats, requests] = await Promise.all([
    query,
    supabase.rpc("admin_event_stats", {}),
    supabase.from("activation_requests").select("event_id, requested_at").order("requested_at", { ascending: false }),
  ]);
  throwIfDbError(events.error);
  throwIfDbError(stats.error);
  throwIfDbError(requests.error);
  const byId = new Map((stats.data ?? []).map((s) => [s.event_id, s]));
  const lastRequest = new Map<string, string>();
  for (const r of requests.data ?? []) if (!lastRequest.has(r.event_id)) lastRequest.set(r.event_id, r.requested_at);
  const rows = (events.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    eventDate: e.event_date,
    organizerEmail: e.organizer_email,
    status: e.status,
    origin: e.origin,
    finalPriceMinor: e.final_price_minor ?? 0,
    retentionMonths: e.retention_months,
    purgeAt: e.purge_at,
    pendingPurgeAt: e.pending_purge_at,
    createdAt: e.created_at,
    anonymizedAt: e.anonymized_at,
    fileCount: byId.get(e.id)?.file_count ?? 0,
    totalBytes: byId.get(e.id)?.total_bytes ?? 0,
    lastActivationRequestAt: lastRequest.get(e.id) ?? null,
  }));
  return filters.requested ? rows.filter((r) => r.status === "awaiting_activation" && r.lastActivationRequestAt !== null) : rows;
}

export interface AdminEventDetail extends AdminEventRow {
  /** Câmpurile comerciale sunt null până la activare (002/FR-016). */
  uploadStartsAt: string | null;
  uploadEndsAt: string | null;
  maxFilesPerGuest: number;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  basePriceMinor: number | null;
  retentionOptionId: string | null;
  uploadUrl: string;
}

export async function getEvent(eventId: string): Promise<AdminEventDetail | null> {
  const supabase = await requireAdmin();
  const { data: e, error } = await supabase
    .from("events")
    .select(
      "id, name, event_date, organizer_email, status, origin, final_price_minor, retention_months, purge_at, pending_purge_at, created_at, anonymized_at, upload_starts_at, upload_ends_at, max_files_per_guest, max_photo_bytes, max_video_bytes, base_price_minor, retention_option_id",
    )
    .eq("id", eventId)
    .not("status", "in", "(deleting,unconfirmed)")
    .maybeSingle();
  throwIfDbError(error);
  if (!e) return null;
  const [token, stats, requests] = await Promise.all([
    supabase.rpc("admin_event_token", { p_event_id: eventId }),
    supabase.rpc("admin_event_stats", { p_event_id: eventId }),
    supabase.from("activation_requests").select("requested_at").eq("event_id", eventId).order("requested_at", { ascending: false }).limit(1),
  ]);
  throwIfDbError(token.error);
  const stat = stats.data?.[0];
  return {
    id: e.id,
    name: e.name,
    eventDate: e.event_date,
    organizerEmail: e.organizer_email,
    status: e.status,
    origin: e.origin,
    finalPriceMinor: e.final_price_minor ?? 0,
    retentionMonths: e.retention_months,
    purgeAt: e.purge_at,
    pendingPurgeAt: e.pending_purge_at,
    createdAt: e.created_at,
    anonymizedAt: e.anonymized_at,
    fileCount: stat?.file_count ?? 0,
    totalBytes: stat?.total_bytes ?? 0,
    lastActivationRequestAt: requests.data?.[0]?.requested_at ?? null,
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
  for (const e of events.data ?? []) {
    if (e.retention_option_id !== null) usage.set(e.retention_option_id, (usage.get(e.retention_option_id) ?? 0) + 1);
  }
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

export interface StatusChangeRow {
  at: string;
  fromStatus: EventStatus | null;
  toStatus: EventStatus;
  source: Database["public"]["Enums"]["status_change_source"];
  actorUserId: string | null;
  reason: string | null;
  externalRef: string | null;
  note: string | null;
}

/** Istoricul stărilor unui eveniment (002/FR-024, FR-029). */
export async function listStatusChanges(eventId: string): Promise<StatusChangeRow[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from("event_status_changes")
    .select("created_at, from_status, to_status, source, actor_user_id, reason, external_ref, note")
    .eq("event_id", eventId)
    .order("id", { ascending: true });
  throwIfDbError(error);
  return (data ?? []).map((c) => ({
    at: c.created_at,
    fromStatus: c.from_status,
    toStatus: c.to_status,
    source: c.source,
    actorUserId: c.actor_user_id,
    reason: c.reason,
    externalRef: c.external_ref,
    note: c.note,
  }));
}
