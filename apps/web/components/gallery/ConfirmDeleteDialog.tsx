"use client";

import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { t, tp } from "@/lib/i18n";

/** Confirmarea explicită a ștergerii, cu numărul de fișiere și avertizarea „ireversibil” (US5-1). */
export function ConfirmDeleteDialog({
  count,
  isOpen,
  pending,
  onCancel,
  onConfirm,
}: {
  count: number;
  isOpen: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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
            {t("delete.title", { files: tp("plural.files", count) })}
          </Heading>
          <p>{t("delete.warning")}</p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button onPress={onCancel} isDisabled={pending} className="min-h-11 rounded-lg border border-gray-400 px-4">
              {t("common.cancel")}
            </Button>
            <Button
              onPress={onConfirm}
              isDisabled={pending}
              className="min-h-11 rounded-lg bg-danger px-4 font-semibold text-white disabled:opacity-50"
            >
              {t("delete.confirm")}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
