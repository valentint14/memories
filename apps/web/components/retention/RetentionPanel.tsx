"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Label, RadioButton, RadioField, RadioGroup } from "react-aria-components";
import { getRetentionQuote } from "@/lib/actions/organizer";
import { startPaymentForm } from "@/lib/actions/payments";
import type { FormState } from "@/lib/actions/self-service";
import { formatDate, formatDateTime, formatMoney, t, tp } from "@/lib/i18n";
import type { RetentionOptionQuote } from "@/lib/organizer/retention";
import { ui } from "@/lib/ui";
import { Sheet } from "../ui/Sheet";
import { SheetActions } from "../ui/SheetActions";
import { ExtendRetentionDialog } from "./ExtendRetentionDialog";

/**
 * „Păstrarea fișierelor” (FR-041): data ștergerii, opțiunea curentă, prețul final și prelungirea
 * spre o opțiune mai lungă (cele mai scurte sau egale sunt dezactivate — FR-042). Prelungirea se
 * plătește online: dialogul arată diferența și duce la Stripe Checkout (003: FR-020–FR-022).
 */
export function RetentionPanel({
  eventId,
  current,
  initialOptions,
}: {
  eventId: string;
  current: { months: number; finalPriceMinor: number; purgeAt: string };
  initialOptions: RetentionOptionQuote[];
}) {
  const state = current;
  const [options, setOptions] = useState(initialOptions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payment, payAction, pending] = useActionState<FormState, FormData>(startPaymentForm, { status: "idle" });
  const priceChanged = payment.status === "error" && payment.error === "PRICE_CHANGED";
  const error = payment.status === "error" && !priceChanged ? t(`errors.${payment.error}`) : null;

  const selected = options.find((o) => o.optionId === selectedId) ?? null;

  // Prețul din catalog s-a schimbat între pregătire și plată: arătăm prețul nou și cerem o nouă confirmare.
  useEffect(() => {
    if (!priceChanged) return;
    void getRetentionQuote(eventId).then((quote) => {
      if (quote.ok) setOptions(quote.data);
    });
  }, [priceChanged, eventId, payment]);


  return (
    <Sheet id="retention-title" title={t("retention.title")}>
      <p className="leading-relaxed">
        {t("retention.current", {
          months: tp("plural.months", state.months),
          price: formatMoney(state.finalPriceMinor),
          date: formatDate(state.purgeAt),
        })}
      </p>

      <RadioGroup value={selectedId} onChange={setSelectedId} className="flex flex-col">
        <Label className={`${ui.label} border-b border-ink pb-2`}>{t("retention.chooseLonger")}</Label>
        {options.map((o) => (
          <RadioField key={o.optionId} value={o.optionId} isDisabled={!o.selectable}>
            <RadioButton className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-rule py-2 data-disabled:cursor-not-allowed data-disabled:text-ink-muted">
              {({ isSelected }) => (
                <>
                  <span
                    aria-hidden="true"
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink"
                  >
                    {isSelected && <span className="size-2.5 rounded-full bg-ink" />}
                  </span>
                  <span>
                    {t("retention.option", {
                      months: tp("plural.months", o.months),
                      price: formatMoney(o.finalPriceMinor),
                      date: formatDate(o.purgeAt),
                    })}
                  </span>
                </>
              )}
            </RadioButton>
          </RadioField>
        ))}
      </RadioGroup>

      <ExtendRetentionDialog
        eventId={eventId}
        option={selected}
        currentPriceMinor={state.finalPriceMinor}
        isOpen={dialogOpen}
        pending={pending}
        priceChanged={priceChanged}
        error={error}
        action={payAction}
        onCancel={() => {
          setDialogOpen(false);
        }}
      />
      <SheetActions status={<p className={ui.hint}>{t("retention.notices", { date: formatDateTime(state.purgeAt) })}</p>}>
        <Button
          isDisabled={selected === null || !selected.selectable}
          onPress={() => {
            setDialogOpen(true);
          }}
          className={ui.buttonSecondary}
        >
          {t("retention.extend")}
        </Button>
      </SheetActions>
    </Sheet>
  );
}
