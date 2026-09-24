"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Label, RadioButton, RadioField, RadioGroup } from "react-aria-components";
import { extendRetention, getRetentionQuote } from "@/lib/actions/organizer";
import { formatDate, formatDateTime, formatMoney, t, tp } from "@/lib/i18n";
import type { RetentionOptionQuote } from "@/lib/organizer/retention";
import { ExtendRetentionDialog } from "./ExtendRetentionDialog";

/**
 * „Păstrarea fișierelor” (FR-041): data ștergerii, opțiunea curentă, prețul final și prelungirea
 * spre o opțiune mai lungă (cele mai scurte sau egale sunt dezactivate — FR-042).
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
  const router = useRouter();
  const [state, setState] = useState(current);
  const [options, setOptions] = useState(initialOptions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [priceChanged, setPriceChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = options.find((o) => o.optionId === selectedId) ?? null;

  const reloadQuote = async () => {
    const quote = await getRetentionQuote(eventId);
    if (quote.ok) setOptions(quote.data);
  };

  return (
    <section aria-labelledby="retention-title" className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
      <h2 id="retention-title" className="text-lg font-semibold">
        {t("retention.title")}
      </h2>
      <p>
        {t("retention.current", {
          months: tp("plural.months", state.months),
          price: formatMoney(state.finalPriceMinor),
          date: formatDate(state.purgeAt),
        })}
      </p>

      <RadioGroup
        value={selectedId}
        onChange={setSelectedId}
        className="flex flex-col gap-2"
      >
        <Label className="font-medium">{t("retention.chooseLonger")}</Label>
        {options.map((o) => (
          <RadioField key={o.optionId} value={o.optionId} isDisabled={!o.selectable}>
            <RadioButton className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-3 py-2 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-selected:border-brand-600 data-selected:bg-brand-50">
              {({ isSelected }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={`h-5 w-5 shrink-0 rounded-full border-2 ${isSelected ? "border-brand-600 bg-brand-600" : "border-gray-500"}`}
                  />
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

      <Button
        isDisabled={selected === null || !selected.selectable}
        onPress={() => {
          setPriceChanged(false);
          setError(null);
          setDialogOpen(true);
        }}
        className="min-h-11 self-start rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-50"
      >
        {t("retention.extend")}
      </Button>

      <ExtendRetentionDialog
        option={selected}
        currentPriceMinor={state.finalPriceMinor}
        isOpen={dialogOpen}
        pending={pending}
        priceChanged={priceChanged}
        error={error}
        onCancel={() => {
          setDialogOpen(false);
        }}
        onConfirm={() => {
          if (!selected) return;
          setError(null);
          startTransition(async () => {
            const result = await extendRetention(eventId, selected.optionId, selected.finalPriceMinor);
            if (result.ok) {
              setState({ months: selected.months, finalPriceMinor: result.data.finalPriceMinor, purgeAt: result.data.purgeAt });
              setDialogOpen(false);
              setSelectedId(null);
              await reloadQuote();
              router.refresh();
            } else if (result.error === "PRICE_CHANGED") {
              // Prețul din catalog s-a schimbat: arătăm prețul nou și cerem o nouă confirmare.
              await reloadQuote();
              setPriceChanged(true);
            } else {
              setError(t(`errors.${result.error}`));
            }
          });
        }}
      />
      <p className="text-sm text-muted">{t("retention.notices", { date: formatDateTime(state.purgeAt) })}</p>
    </section>
  );
}
