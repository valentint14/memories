"use client";

import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { formatDateTime, formatMoney, t, tp } from "@/lib/i18n";
import type { RetentionOptionQuote } from "@/lib/organizer/retention";
import { ui } from "@/lib/ui";

/**
 * Confirmarea prelungirii (FR-041): prețul final nou, diferența și noua dată de ștergere; butonul
 * repetă prețul, ca organizatorul să confirme exact suma pe care o vede.
 */
export function ExtendRetentionDialog({
  option,
  currentPriceMinor,
  isOpen,
  pending,
  priceChanged,
  error,
  onCancel,
  onConfirm,
}: {
  option: RetentionOptionQuote | null;
  currentPriceMinor: number;
  isOpen: boolean;
  pending: boolean;
  priceChanged: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
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
            <dd className={`${ui.data} border-b border-rule py-2 font-semibold`}>{formatMoney(option.finalPriceMinor)}</dd>
            <dt className="border-b border-rule py-2 pr-4 text-ink-muted">{t("retention.difference")}</dt>
            <dd className={`${ui.data} border-b border-rule py-2`}>+{formatMoney(difference)}</dd>
            <dt className="border-b border-rule py-2 pr-4 text-ink-muted">{t("retention.newPurgeAt")}</dt>
            <dd className={`${ui.data} border-b border-rule py-2`}>{formatDateTime(option.purgeAt)}</dd>
          </dl>
          <p className={ui.hint}>{t("retention.paymentNote")}</p>
          {error !== null && (
            <p role="alert" className={ui.fieldError}>
              {error}
            </p>
          )}
          <div className={ui.dialogActions}>
            <Button onPress={onCancel} isDisabled={pending} className={ui.buttonSecondary}>
              {t("common.cancel")}
            </Button>
            <Button onPress={onConfirm} isDisabled={pending} className={ui.buttonPrimary}>
              {t("retention.confirm", { price: formatMoney(option.finalPriceMinor) })}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
