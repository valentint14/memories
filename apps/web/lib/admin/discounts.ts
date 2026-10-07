import "server-only";
import { throwIfDbError } from "../actions/result";
import { requireAdminPage as requireAdmin } from "./guard";

export type DiscountStatus = "available" | "exhausted" | "expired" | "disabled";

export interface DiscountRedemption {
  paymentId: string;
  eventId: string | null;
  eventName: string | null;
  organizerEmail: string | null;
  /** `open` = plată în curs (rezervare); `paid` / `refund_due` = utilizare definitivă. */
  status: string;
  paidAt: string | null;
  createdAt: string;
}

export interface DiscountCodeRow {
  id: string;
  /** Formatat „XXXX-XXXX”. */
  code: string;
  kind: "personal" | "campaign";
  discountType: "fixed" | "percent";
  /** Bani la `fixed`, procent la `percent`. */
  discountValue: number;
  maxUses: number;
  uses: number;
  status: DiscountStatus;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
  redemptions: DiscountRedemption[];
}

interface RawRedemption {
  payment_id: string;
  event_id: string | null;
  event_name: string | null;
  organizer_email: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
}

/** Codurile de reducere cu starea și utilizările lor (005: FR-013); doar administratorii. */
export async function listDiscountCodes(): Promise<DiscountCodeRow[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_discount_codes");
  throwIfDbError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    maxUses: r.max_uses,
    uses: r.uses,
    status: r.status as DiscountStatus,
    expiresAt: r.expires_at,
    note: r.note,
    createdAt: r.created_at,
    redemptions: (r.redemptions as unknown as RawRedemption[]).map((x) => ({
      paymentId: x.payment_id,
      eventId: x.event_id,
      eventName: x.event_name,
      organizerEmail: x.organizer_email,
      status: x.status,
      paidAt: x.paid_at,
      createdAt: x.created_at,
    })),
  }));
}
