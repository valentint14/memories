import "server-only";
import { SIGNED_URL_TTL_SECONDS, safeNamePart } from "@memories/shared";
import { ActionError, throwIfDbError } from "../actions/result";
import { serverSupabase } from "../supabase/server";
import { requireActiveEvent } from "./media";

export type ArchiveStatus = "pending" | "building" | "ready" | "failed" | "expired";

export interface ArchiveState {
  jobId: string;
  status: ArchiveStatus;
  fileCount: number | null;
  skippedCount: number | null;
  expiresAt: string | null;
}

/** Ultimul job de arhivă al evenimentului (RLS: doar organizatorul lui). */
export async function latestArchive(eventId: string): Promise<ArchiveState | null> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase
    .from("archive_jobs")
    .select("id, status, file_count, skipped_count, expires_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfDbError(error);
  if (!data) return null;
  return {
    jobId: data.id,
    status: data.status,
    fileCount: data.file_count,
    skippedCount: data.skipped_count,
    expiresAt: data.expires_at,
  };
}

export async function requestArchiveJob(eventId: string): Promise<ArchiveState> {
  const supabase = await requireActiveEvent(eventId);
  const { data, error } = await supabase.rpc("request_archive", { p_event_id: eventId });
  throwIfDbError(error);
  if (!data) throw new ActionError("INTERNAL");
  return { jobId: data, status: "pending", fileCount: null, skippedCount: null, expiresAt: null };
}

/** URL semnat de 15 min pentru arhiva gata (FR-030, FR-034). */
export async function archiveUrl(jobId: string): Promise<{ url: string; fileCount: number; skippedCount: number; expiresAt: string }> {
  const supabase = await serverSupabase();
  const { data: job, error } = await supabase
    .from("archive_jobs")
    .select("id, event_id, status, archive_path, file_count, skipped_count, expires_at")
    .eq("id", jobId)
    .maybeSingle();
  throwIfDbError(error);
  if (!job) throw new ActionError("FORBIDDEN");
  await requireActiveEvent(job.event_id);
  if (job.status === "expired" || (job.expires_at !== null && new Date(job.expires_at) <= new Date())) {
    throw new ActionError("ARCHIVE_EXPIRED");
  }
  if (job.status !== "ready" || job.archive_path === null || job.expires_at === null) throw new ActionError("NOT_READY");

  const { data: event } = await supabase.from("organizer_events").select("name").eq("id", job.event_id).single();
  const signed = await supabase.storage
    .from("archives")
    .createSignedUrl(job.archive_path, SIGNED_URL_TTL_SECONDS, { download: `${safeNamePart(event?.name ?? "eveniment")}.zip` });
  if (signed.error) throw new ActionError("FORBIDDEN");
  return {
    url: signed.data.signedUrl,
    fileCount: job.file_count ?? 0,
    skippedCount: job.skipped_count ?? 0,
    expiresAt: job.expires_at,
  };
}
