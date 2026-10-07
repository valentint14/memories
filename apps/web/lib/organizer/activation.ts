import "server-only";
import { throwIfDbError } from "../actions/result";
import type { PaymentStateView } from "../actions/payments";
import { serverSupabase } from "../supabase/server";

export interface ActivationOption {
  id: string;
  months: number;
  /** Suma de plată (redusă, dacă e aplicat un cod de reducere — 005). */
  amountMinor: number;
  /** Prețul întreg și reducerea (0 fără cod). */
  fullAmountMinor: number;
  discountMinor: number;
  purgeAt: string;
  included: boolean;
}

export interface ActivationInfo {
  priceMinor: number;
  retentionMonths: number | null;
  maxFilesPerGuest: number;
  /** Opțiunile de păstrare de plătit (003: FR-001), cu prețul final și data ștergerii. */
  options: ActivationOption[];
  /** Ultima plată a evenimentului (FR-009). */
  payment: PaymentStateView | null;
}

/** Ce include pachetul complet, opțiunile de plată și ultima plată a evenimentului (002/FR-018, 003). */
export async function activationInfo(eventId: string): Promise<ActivationInfo> {
  const supabase = await serverSupabase();
  const [pkg, quote, payment] = await Promise.all([
    supabase.from("packages").select("price_minor, max_files_per_guest, retention_options(months)").eq("code", "complete").single(),
    supabase.rpc("activation_quote", { p_event_id: eventId }),
    supabase.rpc("organizer_payment_state", { p_event_id: eventId }),
  ]);
  throwIfDbError(pkg.error);
  throwIfDbError(quote.error);
  throwIfDbError(payment.error);
  if (!pkg.data) throw new Error("Pachetul complet lipsește");
  const last = payment.data?.[0];
  return {
    priceMinor: pkg.data.price_minor,
    retentionMonths: pkg.data.retention_options?.months ?? null,
    maxFilesPerGuest: pkg.data.max_files_per_guest,
    options: (quote.data ?? []).map((o) => ({
      id: o.option_id,
      months: o.months,
      amountMinor: o.amount_minor,
      fullAmountMinor: o.amount_minor,
      discountMinor: 0,
      purgeAt: o.purge_at,
      included: o.included,
    })),
    payment: last ? { status: last.status, purpose: last.purpose, paidAt: last.paid_at } : null,
  };
}
