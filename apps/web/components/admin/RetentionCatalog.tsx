"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { deleteRetentionOption, upsertRetentionOption } from "@/lib/actions/admin";
import { formatMoney, t, tp, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { PlusIcon } from "../ui/icons";

export interface CatalogRow {
  id: string;
  months: number;
  surchargeMinor: number;
  active: boolean;
  usedBy: number;
}

function errorText(result: { error: string; fields?: Record<string, string> }): string {
  const field = result.fields ? Object.values(result.fields)[0] : undefined;
  return field ? t(field as MessageKey) : t(`errors.${result.error}` as MessageKey);
}

/** Lei scriși de administrator (cu virgulă sau punct) în bani; `null` dacă nu e un număr valid. */
function toMinor(lei: string): number | null {
  const value = Number(lei.replace(",", "."));
  return lei.trim() === "" || !Number.isFinite(value) || value < 0 ? null : Math.round(value * 100);
}

/** Coloanele tabelului, comune antetului și rândurilor (pe ecrane late). */
const COLUMNS = "sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_4rem_6rem_minmax(0,1.2fr)] sm:items-center sm:gap-4";

/**
 * O opțiune ca rând de tabel: perioada, suplimentul (editabil pe loc), prețul pentru organizator
 * (pachet + supliment), activarea și câte evenimente o folosesc. „Salvează” apare doar după o
 * modificare, iar „Șterge” doar la o opțiune nefolosită (și care nu e cea inclusă în pachet); ștergerea
 * cere confirmare, iar dacă opțiunea a ajuns între timp folosită, fereastra oferă dezactivarea.
 * Pe telefon, rândul devine un bloc: perioada și cifrele sus, controalele dedesubt.
 */
function OptionRow({ option, basePriceMinor, included }: { option: CatalogRow; basePriceMinor: number; included: boolean }) {
  const router = useRouter();
  const [surcharge, setSurcharge] = useState(String(option.surchargeMinor / 100));
  const [active, setActive] = useState(option.active);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  // Fereastra de ștergere: confirmarea, apoi (dacă opțiunea a ajuns între timp folosită) oferta de dezactivare.
  const [removal, setRemoval] = useState<"confirm" | "inUse" | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const period = tp("plural.months", option.months);
  const labelId = `option-${option.id}`;
  const surchargeMinor = toMinor(surcharge);
  const dirty = surchargeMinor !== option.surchargeMinor || active !== option.active;
  const price = surchargeMinor === null ? "—" : formatMoney(basePriceMinor + surchargeMinor);
  const events = option.usedBy === 0 ? t("admin.retentionPage.unused") : tp("plural.usedByEvents", option.usedBy);

  return (
    <div role="group" aria-labelledby={labelId} className={`flex flex-col gap-3 border-b border-rule px-4 py-3 last:border-b-0 ${COLUMNS}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex flex-col">
          <span id={labelId} className="font-medium">
            {period}
          </span>
          {included && <span className="text-xs text-ink-muted">{t("admin.retentionPage.included")}</span>}
        </span>
        {/* Pe telefon, prețul și evenimentele stau lângă perioadă; pe ecrane late au coloanele lor. */}
        <span className={`${ui.data} text-right text-sm text-ink-muted sm:hidden`}>
          {price} · {option.usedBy}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:contents">
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          aria-label={t("admin.retentionPage.surcharge")}
          aria-invalid={surchargeMinor === null}
          value={surcharge}
          onChange={(e) => {
            setSurcharge(e.target.value);
            setMessage(null);
          }}
          className={`${ui.inputCompact} ${ui.data} w-28 sm:w-full`}
        />
        <span className={`${ui.data} hidden text-sm sm:block`}>{price}</span>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => {
              setActive(e.target.checked);
              setMessage(null);
            }}
            className={ui.checkbox}
          />
          <span className="sm:sr-only">{t("admin.retentionPage.active")}</span>
        </label>
        <span className={`${ui.data} hidden text-sm sm:block`} title={events}>
          {option.usedBy}
        </span>
        {/* Acțiunile rândului: mesajul după salvare, „Șterge” la o opțiune nefolosită, „Salvează” după o modificare. */}
        <div className="ml-auto flex min-h-10 items-center gap-4 sm:ml-0 sm:flex-row-reverse">
          {dirty && (
            <button
              type="button"
              disabled={pending || surchargeMinor === null}
              onClick={() => {
                startTransition(async () => {
                  const result = await upsertRetentionOption({
                    id: option.id,
                    months: option.months,
                    surchargeLei: surcharge.replace(",", "."),
                    active,
                  });
                  setMessage(result.ok ? { text: t("admin.retentionPage.saved"), ok: true } : { text: errorText(result), ok: false });
                  if (result.ok) router.refresh();
                });
              }}
              className={ui.buttonSecondaryCompact}
            >
              {t("admin.retentionPage.save")}
            </button>
          )}
          {!dirty && option.usedBy === 0 && !included && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setRemovalError(null);
                setRemoval("confirm");
              }}
              className={`${ui.buttonText} text-sm text-danger`}
            >
              {t("admin.retentionPage.delete")}
            </button>
          )}
          {message !== null && (
            <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>

      <ModalOverlay
        isOpen={removal !== null}
        isDismissable={!pending}
        onOpenChange={(open) => {
          if (!open) setRemoval(null);
        }}
        className={ui.overlay}
      >
        <Modal className={ui.dialog}>
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            <Heading slot="title" className={ui.dialogTitle}>
              {removal === "inUse" ? t("admin.retentionPage.inUseTitle") : t("admin.retentionPage.deleteTitle", { period })}
            </Heading>
            <p className="leading-relaxed">{t(removal === "inUse" ? "admin.retentionPage.inUseBody" : "admin.retentionPage.deleteBody")}</p>
            {removalError !== null && (
              <p role="alert" className={ui.fieldError}>
                {removalError}
              </p>
            )}
            <div className={ui.dialogActions}>
              <Button
                onPress={() => {
                  setRemoval(null);
                }}
                isDisabled={pending}
                className={ui.buttonSecondary}
              >
                {t("common.cancel")}
              </Button>
              {removal === "inUse" ? (
                <Button
                  isDisabled={pending}
                  className={ui.buttonPrimary}
                  onPress={() => {
                    setRemovalError(null);
                    startTransition(async () => {
                      const result = await upsertRetentionOption({
                        id: option.id,
                        months: option.months,
                        surchargeLei: String(option.surchargeMinor / 100),
                        active: false,
                      });
                      if (result.ok) {
                        setActive(false);
                        setRemoval(null);
                        router.refresh();
                      } else {
                        setRemovalError(errorText(result));
                      }
                    });
                  }}
                >
                  {t("admin.retentionPage.deactivate")}
                </Button>
              ) : (
                <Button
                  isDisabled={pending}
                  className={ui.buttonDangerSolid}
                  onPress={() => {
                    setRemovalError(null);
                    startTransition(async () => {
                      const result = await deleteRetentionOption(option.id);
                      if (result.ok) {
                        setRemoval(null);
                        router.refresh();
                      } else if (result.error === "OPTION_IN_USE") {
                        // Între timp, un eveniment a ales opțiunea: în loc de eroare, oferta de dezactivare.
                        setRemoval("inUse");
                        router.refresh();
                      } else {
                        setRemovalError(errorText(result));
                      }
                    });
                  }}
                >
                  {t("admin.retentionPage.delete")}
                </Button>
              )}
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}

/** Butonul din antet și fereastra pentru o opțiune nouă (durata și suplimentul). */
export function AddRetentionOption() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState("");
  const [surcharge, setSurcharge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        onPress={() => {
          setMonths("");
          setSurcharge("");
          setError(null);
          setOpen(true);
        }}
        className={`${ui.buttonPrimary} shrink-0`}
      >
        <PlusIcon />
        {t("admin.retentionPage.add")}
      </Button>
      <ModalOverlay
        isOpen={open}
        isDismissable={!pending}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
        className={ui.overlay}
      >
        <Modal className={ui.dialog}>
          <Dialog className="flex flex-col gap-5 outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className={ui.dialogTitle}>
                  {t("admin.retentionPage.newTitle")}
                </Heading>
                <form
                  noValidate
                  className="flex flex-col gap-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    startTransition(async () => {
                      const result = await upsertRetentionOption({ months, surchargeLei: surcharge.replace(",", "."), active: true });
                      if (result.ok) {
                        setOpen(false);
                        router.refresh();
                      } else {
                        setError(errorText(result));
                      }
                    });
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="new-months" className={ui.label}>
                        {t("admin.retentionPage.monthsInput")}
                      </label>
                      <input
                        id="new-months"
                        type="number"
                        min={1}
                        max={60}
                        inputMode="numeric"
                        value={months}
                        onChange={(e) => {
                          setMonths(e.target.value);
                        }}
                        className={`${ui.input} ${ui.data}`}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="new-surcharge" className={ui.label}>
                        {t("admin.retentionPage.surcharge")}
                      </label>
                      <input
                        id="new-surcharge"
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={surcharge}
                        onChange={(e) => {
                          setSurcharge(e.target.value);
                        }}
                        className={`${ui.input} ${ui.data}`}
                      />
                    </div>
                  </div>
                  {error !== null && (
                    <p role="alert" className={ui.fieldError}>
                      {error}
                    </p>
                  )}
                  <div className={ui.dialogActions}>
                    <Button onPress={close} isDisabled={pending} className={ui.buttonSecondary}>
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" isDisabled={pending} className={ui.buttonPrimary}>
                      {t("admin.retentionPage.create")}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}

/**
 * Catalogul de retenție (FR-038) ca tabel compact: un antet de coloane pe ecrane late, apoi câte un
 * rând pe opțiune. Opțiunile noi se adaugă din antetul paginii (`AddRetentionOption`).
 */
export function RetentionCatalog({
  options,
  basePriceMinor,
  includedOptionId,
}: {
  options: CatalogRow[];
  basePriceMinor: number;
  includedOptionId: string | null;
}) {
  if (options.length === 0) return <p className={ui.notice}>{t("admin.retentionPage.empty")}</p>;
  return (
    <section aria-labelledby="catalog-title" className={ui.sheet}>
      <h2 id="catalog-title" className="sr-only">
        {t("admin.retentionPage.catalog")}
      </h2>
      <div aria-hidden="true" className={`hidden border-b border-ink px-4 py-3 ${COLUMNS}`}>
        {(
          [
            "admin.retentionPage.col.period",
            "admin.retentionPage.surcharge",
            "admin.retentionPage.col.price",
            "admin.retentionPage.active",
            "admin.retentionPage.col.events",
          ] as MessageKey[]
        ).map((key) => (
          <span key={key} className={`${ui.kicker} text-ink-muted`}>
            {t(key)}
          </span>
        ))}
      </div>
      {options.map((o) => (
        <OptionRow key={o.id} option={o} basePriceMinor={basePriceMinor} included={o.id === includedOptionId} />
      ))}
    </section>
  );
}
