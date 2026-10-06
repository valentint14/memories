"use client";

import { parseDate, parseDateTime, type CalendarDate, type CalendarDateTime } from "@internationalized/date";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  FieldError,
  Group,
  Heading,
  I18nProvider,
  Label,
  Popover,
} from "react-aria-components";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

type Granularity = "day" | "minute";
type Value = CalendarDate | CalendarDateTime;

/** „2027-06-14” (zi) sau „2027-06-14T10:30” (minut, ca un câmp `datetime-local`) → valoare. */
function toValue(value: string | undefined, granularity: Granularity): Value | null {
  if (value === undefined || value === "") return null;
  try {
    return granularity === "minute" ? parseDateTime(value) : parseDate(value.slice(0, 10));
  } catch {
    return null;
  }
}

/** Valoare → același format ca la intrare (fără secunde la minut). */
function toText(value: Value | null, granularity: Granularity): string {
  if (value === null) return "";
  return value.toString().slice(0, granularity === "minute" ? 16 : 10);
}

/**
 * Câmpul de dată al aplicației: zi, lună și an (și ora, la `minute`) pe segmente, plus un calendar
 * propriu, în română, cu săptămâna de luni. Înlocuiește `<input type="date">`, al cărui control
 * nativ arată diferit pe fiecare sistem (pe iOS: câmp turtit și centrat). Cu `name`, formularul
 * primește „AAAA-LL-ZZ” sau „AAAA-LL-ZZTHH:mm:ss”, ca valorile câmpurilor native. Erorile vin de la
 * server (`validationBehavior="aria"`): câmpul nu blochează trimiterea cu mesajele browserului.
 */
export function DateField({
  label,
  name,
  granularity = "day",
  value,
  defaultValue,
  onChange,
  minValue,
  maxValue,
  isRequired = false,
  isInvalid,
  errorMessage,
  labelClassName = ui.label,
  className = "flex flex-col gap-1.5",
}: {
  label: string;
  name?: string;
  granularity?: Granularity;
  /** „AAAA-LL-ZZ” sau „AAAA-LL-ZZTHH:mm”; gol = fără valoare. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  minValue?: string;
  maxValue?: string;
  isRequired?: boolean;
  isInvalid?: boolean;
  errorMessage?: string;
  labelClassName?: string;
  className?: string;
}) {
  const min = toValue(minValue, granularity);
  const max = toValue(maxValue, granularity);
  return (
    <I18nProvider locale="ro-RO">
      <DatePicker
        name={name}
        granularity={granularity}
        hourCycle={24}
        shouldForceLeadingZeros
        firstDayOfWeek="mon"
        validationBehavior="aria"
        isRequired={isRequired}
        {...(isInvalid !== undefined && { isInvalid })}
        {...(min !== null && { minValue: min })}
        {...(max !== null && { maxValue: max })}
        {...(value !== undefined && { value: toValue(value, granularity) })}
        {...(defaultValue !== undefined && { defaultValue: toValue(defaultValue, granularity) })}
        onChange={(next) => onChange?.(toText(next, granularity))}
        className={className}
      >
        <Label className={labelClassName}>{label}</Label>
        <Group className={`${ui.input} flex items-center gap-2 pr-1 data-focus-within:border-ink data-invalid:border-danger`}>
          <DateInput className={`${ui.data} flex min-w-0 flex-1 items-center`}>
            {(segment) => (
              <DateSegment
                segment={segment}
                className="rounded-xs px-0.5 outline-none data-focused:bg-ink data-focused:text-paper-raised data-placeholder:text-ink-muted data-[type=literal]:px-0"
              />
            )}
          </DateInput>
          <Button
            aria-label={t("date.openCalendar")}
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xs text-ink outline-none data-focus-visible:outline-2 data-focus-visible:outline-ink data-hovered:bg-rule/40"
          >
            <CalendarIcon />
          </Button>
        </Group>
        <FieldError className={ui.fieldError}>{errorMessage}</FieldError>
        <Popover className="rounded-xs border border-ink bg-paper-raised p-3 shadow-dialog" placement="bottom start">
          <Dialog className="outline-none">
            <Calendar className="flex flex-col gap-3">
              <header className="flex items-center justify-between gap-2">
                <Button
                  slot="previous"
                  aria-label={t("date.previousMonth")}
                  className="flex size-10 cursor-pointer items-center justify-center rounded-xs outline-none data-focus-visible:outline-2 data-focus-visible:outline-ink data-hovered:bg-rule/40"
                >
                  <ChevronLeftIcon />
                </Button>
                <Heading className="font-medium capitalize" />
                <Button
                  slot="next"
                  aria-label={t("date.nextMonth")}
                  className="flex size-10 cursor-pointer items-center justify-center rounded-xs outline-none data-focus-visible:outline-2 data-focus-visible:outline-ink data-hovered:bg-rule/40"
                >
                  <ChevronRightIcon />
                </Button>
              </header>
              <CalendarGrid className="border-separate border-spacing-0.5">
                <CalendarGridHeader>
                  {(day) => <CalendarHeaderCell className={`${ui.kicker} pb-1 text-ink-muted`}>{day}</CalendarHeaderCell>}
                </CalendarGridHeader>
                <CalendarGridBody>
                  {(date) => (
                    <CalendarCell
                      date={date}
                      className={`${ui.data} flex size-10 cursor-pointer items-center justify-center rounded-xs text-sm outline-none data-disabled:cursor-default data-disabled:text-rule data-focus-visible:outline-2 data-focus-visible:outline-ink data-hovered:bg-rule/40 data-outside-month:hidden data-selected:bg-ink data-selected:text-paper-raised data-today:underline data-today:underline-offset-4`}
                    />
                  )}
                </CalendarGridBody>
              </CalendarGrid>
            </Calendar>
          </Dialog>
        </Popover>
      </DatePicker>
    </I18nProvider>
  );
}
