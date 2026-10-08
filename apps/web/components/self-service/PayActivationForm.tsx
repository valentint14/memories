"use client";

import { useActionState, useState } from "react";
import { applyDiscountForm, startPaymentForm, type DiscountState } from "@/lib/actions/payments";
import type { FormState } from "@/lib/actions/self-service";
import { formatDate, formatMoney, t, tp } from "@/lib/i18n";
import type { ActivationOption } from "@/lib/organizer/activation";
import { ui } from "@/lib/ui";
import { SheetActions } from "../ui/SheetActions";
import { CheckIcon, CloseIcon } from "../ui/icons";

/**
 * Alegerea perioadei de păstrare și plata activării (003: FR-001, FR-002), cu un cod de reducere
 * opțional (005: FR-007). Formular nativ: fără JavaScript, „Aplică” trimite formularul la
 * `applyDiscountForm`, iar plata ia suma opțiunii alese din câmpul ascuns `amount_{id}` (redusă,
 * dacă e aplicat un cod) și redirecționează spre Stripe Checkout (CSP `form-action`, research R10).
 */
export function PayActivationForm({ eventId, options }: { eventId: string; options: ActivationOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startPaymentForm, { status: "idle" });
  const [discount, applyAction, applying] = useActionState<DiscountState, FormData>(applyDiscountForm, { status: "idle" });
  const applied = discount.status === "applied" ? discount : null;
  const shown = applied?.options ?? options;
  const preselected = shown.find((o) => o.included)?.id ?? shown[0]?.id;
  const discountMinor = shown.find((o) => o.id === preselected)?.discountMinor ?? 0;
  // Codul schimbat după „Aplică” readuce butonul la neutru, până la următoarea aplicare.
  const [editedFor, setEditedFor] = useState<DiscountState | null>(null);
  const tone = editedFor === discount ? "idle" : discount.status;

  return (
    <form action={action} className={ui.sheetForm}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="purpose" value="activation" />
      <fieldset className="flex flex-col">
        <legend className={`${ui.label} mb-2 w-full border-b border-ink pb-2`}>{t("activation.chooseRetention")}</legend>
        {shown.map((o) => (
          <label key={o.id} className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-rule py-2 last:border-b-0">
            <input type="radio" name="optionId" value={o.id} defaultChecked={o.id === preselected} required className={ui.checkbox} />
            <input type="hidden" name={`amount_${o.id}`} value={o.amountMinor} />
            <span>
              {t(o.included ? "activation.optionIncluded" : "activation.option", {
                months: tp("plural.months", o.months),
                price: formatMoney(o.amountMinor),
                date: formatDate(o.purgeAt),
              })}
              {o.discountMinor > 0 && (
                <>
                  {" "}
                  <span className="sr-only">({t("activation.discount.fullPrice")}</span>
                  <s className={`${ui.data} text-ink-muted`}>{formatMoney(o.fullAmountMinor)}</s>
                  <span className="sr-only">)</span>
                </>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      {/* Codul de reducere: câmpul și „Aplică”. Rezultatul îl arată doar butonul: verde („Aplicat”,
          cu bifă) sau roșu (cu „×”); motivul refuzului și reducerea se anunță cititoarelor de ecran.
          Câmpul golit și „Aplică” elimină codul. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`discount-${eventId}`} className={ui.label}>
          {t("activation.discount.label")}
        </label>
        <div className="flex gap-2">
          <input
            id={`discount-${eventId}`}
            name="discountCode"
            defaultValue={applied?.code ?? (discount.status === "error" ? discount.code : "")}
            key={applied?.code ?? "none"}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={() => {
              setEditedFor(discount);
            }}
            aria-invalid={tone === "error"}
            aria-describedby={`discount-${eventId}-status`}
            // `w-0`: fără lățimea implicită a câmpului (~20 de caractere), care ar lărgi coloana pe telefon.
            className={`${ui.input} ${ui.data} w-0 min-w-0 flex-1 uppercase`}
          />
          <button
            type="submit"
            formAction={applyAction}
            formNoValidate
            disabled={applying}
            // Lățime fixă: câmpul nu se mută când textul devine „Aplicat”.
            className={`${tone === "applied" ? ui.buttonSuccess : tone === "error" ? ui.buttonDanger : ui.buttonSecondary} min-w-32`}
          >
            {tone === "applied" && <CheckIcon />}
            {tone === "error" && <CloseIcon className="size-4" />}
            {t(tone === "applied" ? "activation.discount.appliedShort" : "activation.discount.apply")}
          </button>
        </div>
        <div id={`discount-${eventId}-status`} className="sr-only">
          {discount.status === "error" && <p role="alert">{t(`errors.${discount.error}`)}</p>}
          {applied !== null && <p role="status">{t("activation.discount.applied", { code: applied.code, amount: formatMoney(discountMinor) })}</p>}
        </div>
      </div>

      <SheetActions
        status={
          state.status === "error" && (
            <p role="alert" className={ui.fieldError}>
              {t(`errors.${state.error}`)}
            </p>
          )
        }
      >
        <button type="submit" disabled={pending || shown.length === 0} className={ui.buttonPrimary}>
          {pending ? t("activation.paying") : t("activation.pay")}
        </button>
      </SheetActions>
    </form>
  );
}
