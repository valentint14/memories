"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, DialogTrigger, Heading, Input, Label, Modal, ModalOverlay, TextField } from "react-aria-components";
import { deleteEvent } from "@/lib/actions/admin";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Ștergere definitivă, confirmată prin tastarea exactă a numelui (FR-006b). */
export function DeleteEventDialog({ eventId, eventName }: { eventId: string; eventName: string | null }) {
  const router = useRouter();
  const expected = eventName ?? t("admin.delete.anonymizedConfirm");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <DialogTrigger>
      <Button className={`${ui.buttonDanger} self-start`}>{t("admin.delete.open")}</Button>
      <ModalOverlay isDismissable className={ui.overlay}>
        <Modal className={ui.dialog}>
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className={ui.dialogTitle}>
                  {t("admin.delete.title")}
                </Heading>
                <p className="leading-relaxed">{t("admin.delete.warning", { name: expected })}</p>
                <TextField value={typed} onChange={setTyped} autoFocus className="flex flex-col gap-1.5">
                  <Label className={ui.label}>{t("admin.delete.typeName")}</Label>
                  <Input className={ui.input} autoComplete="off" />
                </TextField>
                {error !== null && (
                  <p role="alert" className={ui.fieldError}>
                    {error}
                  </p>
                )}
                <div className={ui.dialogActions}>
                  <Button onPress={close} className={ui.buttonSecondary}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    isDisabled={typed !== expected || pending}
                    onPress={() => {
                      setError(null);
                      startTransition(async () => {
                        const result = await deleteEvent(eventId, typed);
                        if (result.ok) {
                          router.push("/admin/events");
                          router.refresh();
                        } else {
                          setError(t(`errors.${result.error}`));
                        }
                      });
                    }}
                    className={ui.buttonDangerSolid}
                  >
                    {t("admin.delete.confirm")}
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
