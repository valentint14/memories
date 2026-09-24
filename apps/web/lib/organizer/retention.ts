import "server-only";
import { ActionError, throwIfDbError } from "../actions/result";
import { serverSupabase } from "../supabase/server";

export interface RetentionOptionQuote {
  optionId: string;
  months: number;
  surchargeMinor: number;
  finalPriceMinor: number;
  purgeAt: string;
  selectable: boolean;
}

/** Oferta de prelungire pentru un eveniment (prețul și data rezultate pentru fiecare opțiune). */
export async function retentionQuote(eventId: string): Promise<RetentionOptionQuote[]> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc("retention_quote", { p_event_id: eventId });
  throwIfDbError(error);
  return (data ?? []).map((q) => ({
    optionId: q.option_id,
    months: q.months,
    surchargeMinor: q.surcharge_minor,
    finalPriceMinor: q.final_price_minor,
    purgeAt: q.purge_at,
    selectable: q.selectable,
  }));
}

/** Prelungirea confirmată de organizator, la prețul afișat (FR-041, FR-042). */
export async function extendEventRetention(
  eventId: string,
  optionId: string,
  expectedFinalPriceMinor: number,
): Promise<{ finalPriceMinor: number; purgeAt: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc("extend_retention", {
    p_event_id: eventId,
    p_option_id: optionId,
    p_expected_final_price_minor: expectedFinalPriceMinor,
  });
  throwIfDbError(error);
  const row = data?.[0];
  if (!row) throw new ActionError("INTERNAL");
  return { finalPriceMinor: row.final_price_minor, purgeAt: row.purge_at };
}
