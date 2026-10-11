import Link from "next/link";
import { t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/**
 * Bifa de la plată: organizatorul cere ca serviciul să înceapă imediat și recunoaște că pierde
 * dreptul de retragere odată activat evenimentul (termenii, secțiunea „Retragere și rambursări”).
 * Nebifată implicit și obligatorie; serverul o cere și o salvează pe plată.
 */
export function WithdrawalWaiver({ id, label }: { id: string; label: Extract<MessageKey, `payment.withdrawalWaiver${string}`> }) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} name="withdrawalWaiver" type="checkbox" required className={`${ui.checkbox} mt-0.5`} />
      <label htmlFor={id} className="leading-snug">
        {t(label)}{" "}
        <Link href="/terms#retragere-si-rambursari" target="_blank" className={ui.link}>
          {t("payment.withdrawalLink")}
        </Link>
      </label>
    </div>
  );
}
