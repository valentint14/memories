"use client";

import { useState, useTransition } from "react";
import { Button } from "react-aria-components";
import { generateDiscountCodes } from "@/lib/actions/admin";
import { t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { DateField } from "../ui/DateField";
import { SelectField } from "../ui/SelectField";
import { Sheet } from "../ui/Sheet";
import { SheetActions } from "../ui/SheetActions";

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
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

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
          setCopied(false);
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
              setCodes(result.data.codes);
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

      {codes.length > 0 && (
        <section aria-labelledby="discount-generated-title" className="flex flex-col gap-3 border-t border-rule pt-4">
          <h3 id="discount-generated-title" className={ui.label}>
            {t("admin.discounts.generated")}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {codes.map((c) => (
              <li key={c} className={`${ui.data} border border-rule px-3 py-2 text-center`}>
                {c}
              </li>
            ))}
          </ul>
          <SheetActions
            status={
              <p role="status" className="text-sm text-success">
                {copied ? t("admin.discounts.copied") : ""}
              </p>
            }
          >
            <Button
              onPress={() => {
                void navigator.clipboard.writeText(codes.join("\n")).then(() => { setCopied(true); });
              }}
              className={ui.buttonSecondary}
            >
              {t("admin.discounts.copyAll")}
            </Button>
          </SheetActions>
        </section>
      )}
    </Sheet>
  );
}
