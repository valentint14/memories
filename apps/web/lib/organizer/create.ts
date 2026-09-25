import "server-only";
import { currentLegalVersions } from "../legal";
import { serverSupabase } from "../supabase/server";
import { todayInAppZone } from "../validation/self-service";

/** Datele formularului de creare din cont: intervalul de date și, dacă e nevoie, versiunile de acceptat. */
export async function organizerCreateFormProps(): Promise<{
  minDate: string;
  maxDate: string;
  versions: { terms: string; privacy: string } | null;
}> {
  const supabase = await serverSupabase();
  const [{ data: needsTerms }, versions] = await Promise.all([supabase.rpc("organizer_needs_terms"), currentLegalVersions()]);
  const today = todayInAppZone(new Date());
  return {
    minDate: today,
    maxDate: `${String(Number(today.slice(0, 4)) + 2)}${today.slice(4)}`,
    versions: needsTerms === false ? null : { terms: versions.terms, privacy: versions.privacy },
  };
}
