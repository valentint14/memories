"use client";

import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { t, tp } from "@/lib/i18n";
import { ui } from "@/lib/ui";

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
      className={ui.overlay}
    >
      <Modal className={ui.dialog}>
        <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
          <Heading slot="title" className={ui.dialogTitle}>
            {t("delete.title", { files: tp("plural.files", count) })}
          </Heading>
          <p className="leading-relaxed">{t("delete.warning")}</p>
          <div className={ui.dialogActions}>
            <Button onPress={onCancel} isDisabled={pending} className={ui.buttonSecondary}>
              {t("common.cancel")}
            </Button>
            <Button onPress={onConfirm} isDisabled={pending} className={ui.buttonDangerSolid}>
              {t("delete.confirm")}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
