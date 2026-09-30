"use client";

import { useRouter } from "next/navigation";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { t } from "@/lib/i18n";

/**
 * Filtrul registrului: grupa aleasă se aplică imediat. Stă în formularul de căutare, deci fără
 * JavaScript pleacă odată cu „Caută” (câmpul `view`).
 */
export function LedgerViewSelect({ view, query, options }: { view: string; query: string; options: SelectOption[] }) {
  const router = useRouter();
  return (
    <SelectField
      name="view"
      label={t("admin.ledger.filter")}
      labelClassName="sr-only"
      className="flex min-w-0 sm:w-48"
      triggerClassName="w-full"
      compact
      triggerText={
        <>
          {t("admin.ledger.filterButton")}
          {/* O grupă aleasă (alta decât „Toate”) se vede printr-un punct teracotă. */}
          {view !== "all" && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />}
        </>
      }
      value={view}
      onChange={(next) => {
        const params = new URLSearchParams();
        if (next !== "all") params.set("view", next);
        if (query !== "") params.set("q", query);
        const search = params.toString();
        router.push(search === "" ? "/admin/events" : `/admin/events?${search}`);
      }}
      options={options}
    />
  );
}
