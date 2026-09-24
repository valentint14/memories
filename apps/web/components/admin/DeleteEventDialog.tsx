"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, DialogTrigger, Heading, Input, Label, Modal, ModalOverlay, TextField } from "react-aria-components";
import { deleteEvent } from "@/lib/actions/admin";
import { t } from "@/lib/i18n";

/** Ștergere definitivă, confirmată prin tastarea exactă a numelui (FR-006b). */
export function DeleteEventDialog({ eventId, eventName }: { eventId: string; eventName: string | null }) {
  const router = useRouter();
  const expected = eventName ?? t("admin.delete.anonymizedConfirm");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <DialogTrigger>
      <Button className="min-h-11 self-start rounded-lg bg-danger px-4 font-semibold text-white">
        {t("admin.delete.open")}
      </Button>
      <ModalOverlay isDismissable className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Modal className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className="text-xl font-bold">
                  {t("admin.delete.title")}
                </Heading>
                <p>{t("admin.delete.warning", { name: expected })}</p>
                <TextField value={typed} onChange={setTyped} autoFocus className="flex flex-col gap-1">
                  <Label className="font-medium">{t("admin.delete.typeName")}</Label>
                  <Input className="min-h-11 rounded-lg border border-gray-400 px-3" autoComplete="off" />
                </TextField>
                {error !== null && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-3">
                  <Button onPress={close} className="min-h-11 rounded-lg border border-gray-400 px-4">
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
                    className="min-h-11 rounded-lg bg-danger px-4 font-semibold text-white disabled:opacity-50"
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
