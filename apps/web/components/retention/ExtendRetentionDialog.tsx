"use client";

import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { formatDateTime, formatMoney, t, tp } from "@/lib/i18n";
import type { RetentionOptionQuote } from "@/lib/organizer/retention";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <Modal className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
          <Heading slot="title" className="text-xl font-bold">
            {t("retention.confirmTitle", { months: tp("plural.months", option.months) })}
          </Heading>
          {priceChanged && (
            <p role="alert" className="rounded-lg border border-amber-600 bg-amber-50 p-3">
              {t("errors.PRICE_CHANGED")}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted">{t("retention.newPrice")}</dt>
            <dd className="font-semibold">{formatMoney(option.finalPriceMinor)}</dd>
            <dt className="text-muted">{t("retention.difference")}</dt>
            <dd>+{formatMoney(difference)}</dd>
            <dt className="text-muted">{t("retention.newPurgeAt")}</dt>
            <dd>{formatDateTime(option.purgeAt)}</dd>
          </dl>
          <p className="text-sm text-muted">{t("retention.paymentNote")}</p>
          {error !== null && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button onPress={onCancel} isDisabled={pending} className="min-h-11 rounded-lg border border-gray-400 px-4">
              {t("common.cancel")}
            </Button>
            <Button
              onPress={onConfirm}
              isDisabled={pending}
              className="min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-50"
            >
              {t("retention.confirm", { price: formatMoney(option.finalPriceMinor) })}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
