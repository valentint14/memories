import "server-only";
import { throwIfDbError } from "../actions/result";
import { requireAdminPage as requireAdmin } from "./guard";

export interface PackageSettings {
  priceMinor: number;
  maxFilesPerGuest: number;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  retentionOptionId: string | null;
  maxAwaitingEventsPerOrganizer: number;
}

/** Valorile curente ale pachetului complet și ale setărilor self-service (002: FR-015). */
export async function getPackageSettings(): Promise<PackageSettings> {
  const supabase = await requireAdmin();
  const [pkg, settings] = await Promise.all([
    supabase
      .from("packages")
      .select("price_minor, max_files_per_guest, max_photo_bytes, max_video_bytes, retention_option_id")
      .eq("code", "complete")
      .single(),
    supabase.from("self_service_settings").select("max_awaiting_events_per_organizer").single(),
  ]);
  throwIfDbError(pkg.error);
  throwIfDbError(settings.error);
  if (!pkg.data || !settings.data) throw new Error("Pachetul sau setările lipsesc");
  return {
    priceMinor: pkg.data.price_minor,
    maxFilesPerGuest: pkg.data.max_files_per_guest,
    maxPhotoBytes: pkg.data.max_photo_bytes,
    maxVideoBytes: pkg.data.max_video_bytes,
    retentionOptionId: pkg.data.retention_option_id,
    maxAwaitingEventsPerOrganizer: settings.data.max_awaiting_events_per_organizer,
  };
}
