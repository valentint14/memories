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
}

/**
 * Toate evenimentele cu statistici agregate (001/FR-003, FR-007; 002/FR-027) — fără acces la media.
 * Gruparea și căutarea se fac în `ledger.ts`, pe lista întreagă, ca numărătoarea filelor să fie exactă.
 */
export async function listEvents(): Promise<AdminEventRow[]> {
  const supabase = await requireAdmin();
  const [events, stats] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, event_date, organizer_email, status, origin, final_price_minor, retention_months, purge_at, pending_purge_at, created_at, anonymized_at")
      .not("status", "in", "(deleting,unconfirmed)")
      .order("created_at", { ascending: false }),
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
    origin: e.origin,
    finalPriceMinor: e.final_price_minor ?? 0,
    retentionMonths: e.retention_months,
    purgeAt: e.purge_at,
    pendingPurgeAt: e.pending_purge_at,
    createdAt: e.created_at,
    anonymizedAt: e.anonymized_at,
    fileCount: byId.get(e.id)?.file_count ?? 0,
    totalBytes: byId.get(e.id)?.total_bytes ?? 0,
  }));
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
    origin: e.origin,
    finalPriceMinor: e.final_price_minor ?? 0,
    retentionMonths: e.retention_months,
    purgeAt: e.purge_at,
    pendingPurgeAt: e.pending_purge_at,
    createdAt: e.created_at,
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
  actorKind: "admin" | "organizer" | "system" | "payment";
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

export interface AdminPaymentRow {
  id: string;
  purpose: "activation" | "retention_extension";
  status: "open" | "paid" | "failed" | "expired" | "refund_due";
  amountMinor: number;
  retentionMonths: number;
  createdAt: string;
  paidAt: string | null;
  disputedAt: string | null;
  refundReason: string | null;
  reference: string | null;
  billingName: string | null;
  billingAddress: string | null;
  billingCompany: string | null;
  billingTaxId: string | null;
  /** Suma rambursată cumulată, momentul ultimei rambursări și efectul aplicat (004: FR-012). */
  refundedMinor: number;
  refundedAt: string | null;
  refundEffect: "suspended" | "retention_reverted" | "manual_adjustment" | "none" | null;
  previousRetentionMonths: number | null;
}

/** Plățile unui eveniment, cu datele de facturare (003: FR-013); RLS: doar administratorii aal2. */
export async function listPayments(eventId: string): Promise<AdminPaymentRow[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, purpose, status, amount_minor, retention_months, created_at, paid_at, disputed_at, refund_reason, stripe_payment_intent_id, stripe_session_id, billing_name, billing_address, billing_company, billing_tax_id, refunded_minor, refunded_at, refund_effect, previous_retention_months",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  throwIfDbError(error);
  return (data ?? []).map((p) => ({
    id: p.id,
    purpose: p.purpose,
    status: p.status,
    amountMinor: p.amount_minor,
    retentionMonths: p.retention_months,
    createdAt: p.created_at,
    paidAt: p.paid_at,
    disputedAt: p.disputed_at,
    refundReason: p.refund_reason,
    reference: p.stripe_payment_intent_id ?? p.stripe_session_id,
    billingName: p.billing_name,
    billingAddress: formatAddress(p.billing_address),
    billingCompany: p.billing_company,
    billingTaxId: p.billing_tax_id,
    refundedMinor: p.refunded_minor,
    refundedAt: p.refunded_at,
    // Valorile sunt limitate de constrângerea `payments_refund_effect` (data-model.md).
    refundEffect: p.refund_effect as AdminPaymentRow["refundEffect"],
    previousRetentionMonths: p.previous_retention_months,
  }));
}

/** Adresa de facturare pe un rând: stradă, oraș, cod, județ, țară (fără câmpurile goale). */
function formatAddress(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  const parts = ["line1", "line2", "postal_code", "city", "state", "country"]
    .map((k) => a[k])
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return parts.length === 0 ? null : parts.join(", ");
}

