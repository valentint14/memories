import "server-only";
import { throwIfDbError } from "../actions/result";
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
