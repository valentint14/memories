"use client";

import { useActionState } from "react";
import { startPaymentForm } from "@/lib/actions/payments";
import type { FormState } from "@/lib/actions/self-service";
import { formatDate, formatMoney, t, tp } from "@/lib/i18n";
import type { ActivationOption } from "@/lib/organizer/activation";
import { ui } from "@/lib/ui";
import { SheetActions } from "../ui/SheetActions";

/**
 * Alegerea perioadei de păstrare și plata activării (003: FR-001, FR-002). Formular nativ: fără
 * JavaScript, serverul ia suma opțiunii alese din câmpul ascuns `amount_{id}` și redirecționează
 * spre Stripe Checkout (CSP `form-action`, research R10).
 */
export function PayActivationForm({ eventId, options }: { eventId: string; options: ActivationOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startPaymentForm, { status: "idle" });
  const preselected = options.find((o) => o.included)?.id ?? options[0]?.id;

  return (
    <form action={action} className={ui.sheetForm}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="purpose" value="activation" />
      <fieldset className="flex flex-col">
        <legend className={`${ui.label} mb-2 w-full border-b border-ink pb-2`}>{t("activation.chooseRetention")}</legend>
        {options.map((o) => (
          <label
            key={o.id}
            className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-rule py-2 last:border-b-0"
          >
            <input type="radio" name="optionId" value={o.id} defaultChecked={o.id === preselected} required className={ui.checkbox} />
            <input type="hidden" name={`amount_${o.id}`} value={o.amountMinor} />
            <span>
              {t(o.included ? "activation.optionIncluded" : "activation.option", {
                months: tp("plural.months", o.months),
                price: formatMoney(o.amountMinor),
                date: formatDate(o.purgeAt),
              })}
            </span>
          </label>
        ))}
      </fieldset>
      <SheetActions
        status={
          state.status === "error" && (
            <p role="alert" className={ui.fieldError}>
              {t(`errors.${state.error}`)}
            </p>
          )
        }
      >
        <button type="submit" disabled={pending || options.length === 0} className={ui.buttonPrimary}>
          {pending ? t("activation.paying") : t("activation.pay")}
        </button>
      </SheetActions>
    </form>
  );
}
