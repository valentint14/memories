"use client";

import { useRouter } from "next/navigation";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

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
      labelClassName={`${ui.kicker} text-ink-muted`}
      className="flex items-center gap-2"
      triggerClassName="min-w-52"
      compact
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
