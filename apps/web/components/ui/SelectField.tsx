"use client";

import type { ReactNode } from "react";
import type { Key } from "react-aria-components";
import { Button, FieldError, Label, ListBox, ListBoxItem, Popover, Select, SelectValue } from "react-aria-components";
import { ui } from "@/lib/ui";
import { ChevronDownIcon } from "./icons";

export type SelectOption = { id: string; label: string };

/**
 * Lista derulantă a aplicației: câmp ca `ui.input`, săgeată proprie, listă pe hârtie cu contur de
 * cerneală. Înlocuiește `<select>`-ul nativ, al cărui aspect diferă de la un browser la altul.
 * Cu `name`, valoarea pleacă odată cu formularul (inclusiv într-un formular GET fără JavaScript).
 */
export function SelectField({
  label,
  labelClassName = ui.label,
  triggerClassName = "",
  compact = false,
  triggerText,
  options,
  errorMessage,
  ...props
}: {
  label: string;
  labelClassName?: string;
  /** Lățimea butonului, unde nu trebuie să urmeze textul ales (de ex. `min-w-48`). */
  triggerClassName?: string;
  /** Înălțimea lui `ui.inputCompact`, pentru barele de instrumente. */
  compact?: boolean;
  /** Text fix pe buton în locul valorii alese (de ex. „Filtrează” pe bara registrului). */
  triggerText?: ReactNode;
  options: SelectOption[];
  errorMessage?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  isInvalid?: boolean;
  className?: string;
}) {
  const { onChange, className = "flex flex-col gap-1.5", ...rest } = props;
  return (
    <Select
      {...rest}
      className={className}
      onChange={(key: Key | null) => {
        if (key !== null) onChange?.(String(key));
      }}
    >
      <Label className={labelClassName}>{label}</Label>
      <Button className={`${compact ? ui.inputCompact : ui.input} flex cursor-pointer items-center justify-between gap-3 text-left ${triggerClassName}`}>
        {/* Cu `triggerText`, butonul arată un text fix; valoarea aleasă rămâne în numele accesibil. */}
        <SelectValue className={triggerText === undefined ? "truncate data-placeholder:text-ink-muted" : "sr-only"} />
        {triggerText !== undefined && <span className="flex min-w-0 items-center gap-2 truncate">{triggerText}</span>}
        <ChevronDownIcon className="size-4 shrink-0" />
      </Button>
      <FieldError className={ui.fieldError}>{errorMessage}</FieldError>
      <Popover className="min-w-(--trigger-width) rounded-xs border border-ink bg-paper-raised shadow-dialog">
        <ListBox className="p-1">
          {options.map((o) => (
            <ListBoxItem
              key={o.id}
              id={o.id}
              textValue={o.label}
              className="min-h-11 cursor-pointer content-center rounded-xs px-3 py-2 outline-none data-focused:bg-rule/40 data-hovered:bg-rule/40 data-selected:font-semibold"
            >
              {o.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
