"use server";

import { leiToMinor } from "@memories/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "../admin/guard";
import { adminSupabase } from "../supabase/admin";
import { serverEnv } from "../server-env";
import { eventInputSchema, type EventData, type EventInput } from "../validation/event";
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
      purgeAt: row.purge_at,
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
      purgeAt: row.purge_at,
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
