import "server-only";
import { throwIfDbError } from "../actions/result";
import { serverSupabase } from "../supabase/server";

export interface ActivationInfo {
  priceMinor: number;
  retentionMonths: number | null;
  maxFilesPerGuest: number;
  lastRequestAt: string | null;
}

/** Ce include pachetul complet și ultima cerere de activare a evenimentului (002: FR-018, FR-018a). */
export async function activationInfo(eventId: string): Promise<ActivationInfo> {
  const supabase = await serverSupabase();
  const [pkg, requests] = await Promise.all([
    supabase
      .from("packages")
      .select("price_minor, max_files_per_guest, retention_options(months)")
      .eq("code", "complete")
      .single(),
    supabase
      .from("activation_requests")
      .select("requested_at")
      .eq("event_id", eventId)
      .order("requested_at", { ascending: false })
      .limit(1),
  ]);
  throwIfDbError(pkg.error);
  throwIfDbError(requests.error);
  if (!pkg.data) throw new Error("Pachetul complet lipsește");
  return {
    priceMinor: pkg.data.price_minor,
    retentionMonths: pkg.data.retention_options?.months ?? null,
    maxFilesPerGuest: pkg.data.max_files_per_guest,
    lastRequestAt: requests.data?.[0]?.requested_at ?? null,
  };
}
