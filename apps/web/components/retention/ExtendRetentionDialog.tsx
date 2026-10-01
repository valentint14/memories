"use client";

import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { formatDateTime, formatMoney, t, tp } from "@/lib/i18n";
import type { RetentionOptionQuote } from "@/lib/organizer/retention";
import { ui } from "@/lib/ui";

/**
 * Revizuirea prelungirii înainte de plată (FR-041; 003: FR-020, FR-022): prețul final nou,
 * diferența de plătit și noua dată de ștergere. Butonul trimite formularul de plată și repetă
 * suma, ca organizatorul să plătească exact ce vede; noua dată se aplică doar după plată.
 */
export function ExtendRetentionDialog({
  eventId,
  option,
  currentPriceMinor,
  isOpen,
  pending,
  priceChanged,
  error,
  action,
  onCancel,
}: {
  eventId: string;
  option: RetentionOptionQuote | null;
  currentPriceMinor: number;
  isOpen: boolean;
  pending: boolean;
  priceChanged: boolean;
  error: string | null;
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  if (!option) return null;
  const difference = option.finalPriceMinor - currentPriceMinor;
  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable={!pending}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      className={ui.overlay}
    >
      <Modal className={ui.dialog}>
        <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
          <Heading slot="title" className={ui.dialogTitle}>
            {t("retention.confirmTitle", { months: tp("plural.months", option.months) })}
          </Heading>
          {priceChanged && (
            <p role="alert" className={ui.caution}>
              {t("errors.PRICE_CHANGED")}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] border-t border-rule">
            <dt className="border-b border-rule py-2 pr-4 text-ink-muted">{t("retention.newPrice")}</dt>
            <dd className={`${ui.data} border-b border-rule py-2`}>{formatMoney(option.finalPriceMinor)}</dd>
            <dt className="border-b border-rule py-2 pr-4 text-ink-muted">{t("retention.difference")}</dt>
            <dd className={`${ui.data} border-b border-rule py-2 font-semibold`}>{formatMoney(difference)}</dd>
            <dt className="border-b border-rule py-2 pr-4 text-ink-muted">{t("retention.newPurgeAt")}</dt>
            <dd className={`${ui.data} border-b border-rule py-2`}>{formatDateTime(option.purgeAt)}</dd>
          </dl>
          <p className={ui.hint}>{t("retention.paymentNote")}</p>
          {error !== null && (
            <p role="alert" className={ui.fieldError}>
              {error}
            </p>
          )}
          <form action={action} className={ui.dialogActions}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="purpose" value="retention_extension" />
            <input type="hidden" name="optionId" value={option.optionId} />
            <input type="hidden" name={`amount_${option.optionId}`} value={difference} />
            <Button onPress={onCancel} isDisabled={pending} className={ui.buttonSecondary}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" isDisabled={pending} className={ui.buttonPrimary}>
              {t("retention.pay", { price: formatMoney(difference) })}
            </Button>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
