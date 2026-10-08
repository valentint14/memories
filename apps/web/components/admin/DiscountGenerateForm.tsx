"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { generateDiscountCodes } from "@/lib/actions/admin";
import { formatDate, formatMoney, t, tp, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { DateField } from "../ui/DateField";
import { SelectField } from "../ui/SelectField";
import { Sheet } from "../ui/Sheet";
import { SheetActions } from "../ui/SheetActions";
import { CheckIcon, CopyIcon } from "../ui/icons";

interface Generated {
  codes: string[];
  /** Reducerea, felul și expirarea, pentru rândul de sub titlu. */
  summary: string;
}

/**
 * Fereastra de după generare: confirmarea, codurile noi (fiecare cu copiere) și „Copiază tot”.
 * Simetrică: rezumat, aceeași distanță, lista încadrată de linii, aceeași distanță, butoanele. La
 * multe coduri lista se derulează, iar butoanele rămân jos. Copierea nu adaugă rânduri: iconița
 * devine bifă și „Copiază tot” devine „Copiat”; anunțul pentru cititoarele de ecran e ascuns vizual.
 */
function GeneratedDialog({ generated, onClose }: { generated: Generated | null; onClose: () => void }) {
  /** Ce s-a copiat ultima dată: un cod sau „all”, plus anunțul. */
  const [copied, setCopied] = useState<{ key: string; message: string } | null>(null);
  const copy = (text: string, key: string, message: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied({ key, message });
    });
  };
  return (
    <ModalOverlay
      isOpen={generated !== null}
      isDismissable
      onOpenChange={(open) => {
        if (!open) {
          setCopied(null);
          onClose();
        }
      }}
      className={ui.overlay}
    >
      <Modal className={`${ui.dialog} flex max-h-[85dvh] flex-col`}>
        <Dialog className="flex min-h-0 flex-col gap-4 outline-none">
          {({ close }) => (
            <>
              <Heading slot="title" className={`${ui.dialogTitle} flex items-center gap-3`}>
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-paper-raised">
                  <CheckIcon className="size-4" />
                </span>
                {tp("plural.generatedCodes", generated?.codes.length ?? 0)}
              </Heading>
              <p className="text-ink-muted">{generated?.summary}</p>
              <ul aria-label={t("admin.discounts.generated")} className="flex min-h-0 flex-col overflow-y-auto border-y border-rule">
                {generated?.codes.map((c) => (
                  <li key={c} className="flex items-center justify-between gap-3 border-b border-rule py-1 last:border-b-0">
                    <span className={`${ui.data} text-lg`}>{c}</span>
                    <Button
                      aria-label={t("admin.discounts.copyCode", { code: c })}
                      onPress={() => {
                        copy(c, c, t("admin.discounts.copiedOne", { code: c }));
                      }}
                      className="flex size-11 cursor-pointer items-center justify-center rounded-xs outline-none data-focus-visible:outline-2 data-focus-visible:outline-ink data-hovered:bg-rule/40"
                    >
                      {copied?.key === c ? <CheckIcon className="size-5 text-success" /> : <CopyIcon />}
                    </Button>
                  </li>
                ))}
              </ul>
              <div className={ui.dialogActionsBare}>
                {/* Anunțul „copiat”, doar pentru cititoarele de ecran: nu ocupă loc. */}
                <p role="status" className="sr-only">
                  {copied?.message ?? ""}
                </p>
                <Button
                  onPress={() => {
                    copy(generated?.codes.join("\n") ?? "", "all", t("admin.discounts.copied"));
                  }}
                  // Lățime fixă: butoanele nu se mută când textul devine „Copiat”.
                  className={`${ui.buttonSecondary} min-w-36`}
                >
                  {copied?.key === "all" ? t("admin.discounts.copiedShort") : t("admin.discounts.copyAll")}
                </Button>
                <Button onPress={close} className={ui.buttonPrimary}>
                  {t("common.close")}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * Generarea codurilor de reducere (005: FR-001–FR-003): felul (personal în lot sau de campanie cu
 * maximul de utilizări), tipul și valoarea reducerii, expirarea și nota. Codurile noi apar sub
 * formular, gata de copiat.
 */
export function DiscountGenerateForm() {
  const [kind, setKind] = useState<"personal" | "campaign">("personal");
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [expiresOn, setExpiresOn] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function field(id: string, name: string, label: MessageKey, props: React.InputHTMLAttributes<HTMLInputElement>, hint?: MessageKey) {
    const message = fields[name];
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className={ui.label}>
          {t(label)}
        </label>
        <input
          id={id}
          name={name}
          aria-invalid={message !== undefined}
          aria-describedby={`${id}-hint ${id}-error`}
          className={ui.input}
          {...props}
        />
        {hint !== undefined && (
          <p id={`${id}-hint`} className={ui.hint}>
            {t(hint)}
          </p>
        )}
        {message !== undefined && (
          <p id={`${id}-error`} className={ui.fieldError}>
            {t(message as MessageKey)}
          </p>
        )}
      </div>
    );
  }

  return (
    <Sheet id="discount-generate-title" title={t("admin.discounts.generate.title")}>
      <form
        ref={formRef}
        noValidate
        className={ui.sheetForm}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const text = (name: string) => {
            const value = data.get(name);
            return typeof value === "string" ? value.trim() : "";
          };
          setError(null);
          setFields({});
          startTransition(async () => {
            const result = await generateDiscountCodes({
              kind,
              discountType,
              value: text("value").replace(",", "."),
              count: kind === "personal" ? text("count") : "1",
              ...(kind === "campaign" && { maxUses: text("maxUses") }),
              ...(expiresOn !== "" && { expiresOn }),
              note: text("note"),
            });
            if (result.ok) {
              const value = Number(text("value").replace(",", "."));
              const reduction = discountType === "fixed" ? formatMoney(Math.round(value * 100)) : t("admin.discounts.percent", { percent: value });
              setGenerated({
                codes: result.data.codes,
                summary: [
                  reduction,
                  t(`admin.discounts.kindShort.${kind}`),
                  expiresOn === "" ? null : t("admin.discounts.expires", { date: formatDate(expiresOn) }),
                ]
                  .filter(Boolean)
                  .join(" · "),
              });
              formRef.current?.reset();
              setExpiresOn("");
              router.refresh();
            } else if (result.fields) {
              setFields(result.fields);
            } else {
              setError(t(`errors.${result.error}`));
            }
          });
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label={t("admin.discounts.kind")}
            value={kind}
            onChange={(v) => {
              setKind(v as "personal" | "campaign");
            }}
            options={[
              { id: "personal", label: t("admin.discounts.kind.personal") },
              { id: "campaign", label: t("admin.discounts.kind.campaign") },
            ]}
          />
          <SelectField
            label={t("admin.discounts.type")}
            value={discountType}
            onChange={(v) => {
              setDiscountType(v as "fixed" | "percent");
            }}
            options={[
              { id: "fixed", label: t("admin.discounts.type.fixed") },
              { id: "percent", label: t("admin.discounts.type.percent") },
            ]}
          />
          {field("dg-value", "value", "admin.discounts.value", {
            type: "number",
            inputMode: "decimal",
            min: discountType === "percent" ? 1 : 0.01,
            max: discountType === "percent" ? 99 : undefined,
            step: discountType === "percent" ? 1 : 0.01,
            required: true,
          })}
          {kind === "personal"
            ? field("dg-count", "count", "admin.discounts.count", { type: "number", inputMode: "numeric", min: 1, max: 100, defaultValue: 1 })
            : field("dg-max", "maxUses", "admin.discounts.maxUses", { type: "number", inputMode: "numeric", min: 2, max: 1000, defaultValue: 10 })}
          <DateField label={t("admin.discounts.expiresOn")} value={expiresOn} onChange={setExpiresOn} />
          {field("dg-note", "note", "admin.discounts.note", { maxLength: 200, autoComplete: "off" }, "admin.discounts.noteHint")}
        </div>
        <SheetActions
          status={
            error !== null && (
              <p role="alert" className={ui.fieldError}>
                {error}
              </p>
            )
          }
        >
          <Button type="submit" isDisabled={pending} className={ui.buttonPrimary}>
            {t("admin.discounts.submit")}
          </Button>
        </SheetActions>
      </form>

      <GeneratedDialog
        generated={generated}
        onClose={() => {
          setGenerated(null);
        }}
      />
    </Sheet>
  );
}
