"use server";

import { leiToMinor } from "@memories/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "../admin/guard";
import { adminSupabase } from "../supabase/admin";
import { serverEnv } from "../server-env";
import { eventInputSchema, type EventData, type EventInput } from "../validation/event";
import { eventBasicsSchema } from "../validation/self-service";
import { ActionError, runAction, throwIfDbError, type ActionResult } from "./result";

/** Creează utilizatorul Auth al organizatorului, dacă nu există (research.md R4). */
async function ensureOrganizerUser(email: string): Promise<void> {
  const { error } = await adminSupabase().auth.admin.createUser({ email, email_confirm: true });
  if (error && error.code !== "email_exists") throw new ActionError("INTERNAL");
}

function toRow(data: EventData) {
  return {
    name: data.name,
    event_date: data.eventDate,
    organizer_email: data.organizerEmail,
    upload_starts_at: data.uploadStartsAt,
    upload_ends_at: data.uploadEndsAt,
    max_files_per_guest: data.maxFilesPerGuest,
    max_photo_bytes: data.maxPhotoBytes,
    max_video_bytes: data.maxVideoBytes,
    base_price_minor: data.basePriceMinor,
    retention_option_id: data.retentionOptionId,
  };
}

export interface SavedEvent {
  eventId: string;
  uploadUrl: string;
  finalPriceMinor: number;
  purgeAt: string;
}

async function uploadUrlOf(eventId: string): Promise<string> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_event_token", { p_event_id: eventId });
  throwIfDbError(error);
  return new URL(`/e/${data ?? ""}`, serverEnv.appUrl).toString();
}

export async function createEvent(input: EventInput): Promise<ActionResult<SavedEvent>> {
  return runAction(eventInputSchema, input, async (data) => {
    const supabase = await requireAdmin();
    await ensureOrganizerUser(data.organizerEmail);
    const { data: row, error } = await supabase
      .from("events")
      .insert(toRow(data))
      .select("id, final_price_minor, purge_at")
      .single();
    throwIfDbError(error);
    if (!row) throw new ActionError("INTERNAL");
    revalidatePath("/admin/events");
    return {
      eventId: row.id,
      uploadUrl: await uploadUrlOf(row.id),
      finalPriceMinor: row.final_price_minor ?? 0,
      // Evenimentele create de administrator sunt active, deci au mereu data ștergerii.
      purgeAt: row.purge_at ?? "",
    };
  });
}

const updateSchema = z.object({ eventId: z.uuid(), input: eventInputSchema });

export async function updateEvent(eventId: string, input: EventInput): Promise<ActionResult<SavedEvent>> {
  return runAction(updateSchema, { eventId, input }, async ({ eventId: id, input: data }) => {
    const supabase = await requireAdmin();
    await ensureOrganizerUser(data.organizerEmail);
    const { data: row, error } = await supabase
      .from("events")
      .update(toRow(data))
      .eq("id", id)
      .select("id, final_price_minor, purge_at")
      .maybeSingle();
    throwIfDbError(error);
    if (!row) throw new ActionError("NOT_FOUND");
    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${id}`);
    return {
      eventId: row.id,
      uploadUrl: await uploadUrlOf(row.id),
      finalPriceMinor: row.final_price_minor ?? 0,
      // Evenimentele create de administrator sunt active, deci au mereu data ștergerii.
      purgeAt: row.purge_at ?? "",
    };
  });
}

const optionSchema = z.object({
  id: z.uuid().optional(),
  months: z.coerce.number("validation.months").int("validation.months").min(1, "validation.months").max(60, "validation.months"),
  surchargeLei: z.coerce.number("validation.price").min(0, "validation.price").max(1_000_000, "validation.price"),
  active: z.boolean(),
});

/** Adaugă sau modifică o opțiune de retenție (FR-038); evenimentele existente nu sunt afectate. */
export async function upsertRetentionOption(input: {
  id?: string;
  months: number | string;
  surchargeLei: number | string;
  active: boolean;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(optionSchema, input, async (data) => {
    const supabase = await requireAdmin();
    const row = { months: data.months, surcharge_minor: leiToMinor(data.surchargeLei), active: data.active };
    const query = data.id
      ? supabase.from("retention_options").update(row).eq("id", data.id).select("id").single()
      : supabase.from("retention_options").insert(row).select("id").single();
    const { data: saved, error } = await query;
    throwIfDbError(error);
    if (!saved) throw new ActionError("NOT_FOUND");
    revalidatePath("/admin/retention");
    return { id: saved.id };
  });
}

/** Șterge o opțiune nefolosită; cele folosite de evenimente → OPTION_IN_USE. */
export async function deleteRetentionOption(id: string): Promise<ActionResult<null>> {
  return runAction(z.object({ id: z.uuid() }), { id }, async (data) => {
    const supabase = await requireAdmin();
    const { error } = await supabase.from("retention_options").delete().eq("id", data.id);
    throwIfDbError(error);
    revalidatePath("/admin/retention");
    return null;
  });
}

const deleteSchema = z.object({ eventId: z.uuid(), confirmName: z.string().max(200) });

/** Ștergere definitivă, după tastarea numelui (FR-006b). */
export async function deleteEvent(eventId: string, confirmName: string): Promise<ActionResult<{ status: "deleting" }>> {
  return runAction(deleteSchema, { eventId, confirmName }, async (data) => {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc("request_event_deletion", {
      p_event_id: data.eventId,
      p_confirm_name: data.confirmName,
    });
    throwIfDbError(error);
    revalidatePath("/admin/events");
    return { status: "deleting" as const };
  });
}

const reasonSchema = z.string().trim().min(1, "validation.reason").max(500, "validation.reason");
const stateActionSchema = z.object({ eventId: z.uuid(), reason: reasonSchema });

function revalidateEvent(eventId: string): void {
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
}

/** Activarea pachetului complet (002: FR-025, FR-028); aceeași funcție SQL o va folosi plata online. */
export async function activateEvent(input: { eventId: string; reason: string }): Promise<ActionResult<{ alreadyActive: boolean }>> {
  return runAction(stateActionSchema, input, async ({ eventId, reason }) => {
    const supabase = await requireAdmin();
    const { data, error } = await supabase.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: reason });
    throwIfDbError(error);
    revalidateEvent(eventId);
    return { alreadyActive: data?.[0]?.already_active ?? false };
  });
}

export async function suspendEvent(input: { eventId: string; reason: string }): Promise<ActionResult<null>> {
  return runAction(stateActionSchema, input, async ({ eventId, reason }) => {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc("suspend_event", { p_event_id: eventId, p_reason: reason });
    throwIfDbError(error);
    revalidateEvent(eventId);
    return null;
  });
}

export async function reactivateEvent(input: { eventId: string; reason: string }): Promise<ActionResult<null>> {
  return runAction(stateActionSchema, input, async ({ eventId, reason }) => {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc("reactivate_event", { p_event_id: eventId, p_reason: reason });
    throwIfDbError(error);
    revalidateEvent(eventId);
    return null;
  });
}

/** Numele și data unui eveniment neactivat (002: FR-028). */
export async function updatePendingEvent(input: { eventId: string; name: string; eventDate: string }): Promise<ActionResult<null>> {
  return runAction(
    eventBasicsSchema(new Date()).extend({ eventId: z.uuid() }),
    input,
    async ({ eventId, name, eventDate }) => {
      const supabase = await requireAdmin();
      const { error } = await supabase.rpc("admin_update_pending_event", { p_event_id: eventId, p_name: name, p_event_date: eventDate });
      throwIfDbError(error);
      revalidateEvent(eventId);
      return null;
    },
  );
}

const MB = 1024 * 1024;

const packageSchema = z.object({
  priceLei: z.coerce.number("validation.price").min(0, "validation.price").max(1_000_000, "validation.price"),
  maxFilesPerGuest: z.coerce.number("validation.maxFiles").int("validation.maxFiles").min(1, "validation.maxFiles").max(1000, "validation.maxFiles"),
  maxPhotoMb: z.coerce.number("validation.maxPhotoMb").positive("validation.maxPhotoMb").max(50, "validation.maxPhotoMb"),
  maxVideoMb: z.coerce.number("validation.maxVideoMb").positive("validation.maxVideoMb").max(1024, "validation.maxVideoMb"),
  retentionOptionId: z.uuid("validation.option"),
  maxAwaitingEventsPerOrganizer: z.coerce
    .number("validation.maxAwaiting")
    .int("validation.maxAwaiting")
    .min(1, "validation.maxAwaiting")
    .max(20, "validation.maxAwaiting"),
});

export type PackageInput = z.input<typeof packageSchema>;

/**
 * Pachetul complet și setările self-service, fără modificări de cod (002: FR-015). Se aplică doar
 * evenimentelor activate ulterior; cele active își păstrează valorile (FR-016).
 */
export async function updatePackage(input: PackageInput): Promise<ActionResult<null>> {
  return runAction(packageSchema, input, async (data) => {
    const supabase = await requireAdmin();
    const pkg = await supabase
      .from("packages")
      .update({
        price_minor: leiToMinor(data.priceLei),
        max_files_per_guest: data.maxFilesPerGuest,
        max_photo_bytes: Math.round(data.maxPhotoMb * MB),
        max_video_bytes: Math.round(data.maxVideoMb * MB),
        retention_option_id: data.retentionOptionId,
      })
      .eq("code", "complete");
    throwIfDbError(pkg.error);
    const settings = await supabase
      .from("self_service_settings")
      .update({ max_awaiting_events_per_organizer: data.maxAwaitingEventsPerOrganizer })
      .eq("id", true);
    throwIfDbError(settings.error);
    revalidatePath("/admin/package");
    return null;
  });
}
