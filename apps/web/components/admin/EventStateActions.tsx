"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, DialogTrigger, Heading, Label, Modal, ModalOverlay, TextArea, TextField } from "react-aria-components";
import { activateEvent, reactivateEvent, suspendEvent } from "@/lib/actions/admin";
import type { ActionResult } from "@/lib/actions/result";
import { t, type MessageKey } from "@/lib/i18n";

type StateAction = "activate" | "suspend" | "reactivate";

const RUN: Record<StateAction, (input: { eventId: string; reason: string }) => Promise<ActionResult<unknown>>> = {
  activate: activateEvent,
  suspend: suspendEvent,
  reactivate: reactivateEvent,
};

/** Acțiunile permise de starea curentă (002: FR-022, FR-028). */
function actionsFor(status: string): StateAction[] {
  if (status === "awaiting_activation") return ["activate"];
  if (status === "active") return ["suspend"];
  if (status === "suspended") return ["reactivate"];
  return [];
}

/** Dialog de confirmare cu motiv obligatoriu (1–500 de caractere), înregistrat în istoric (FR-024). */
function StateActionDialog({ eventId, action }: { eventId: string; action: StateAction }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = reason.trim().length >= 1 && reason.trim().length <= 500;
  const danger = action === "suspend";

  return (
    <DialogTrigger>
      <Button
        className={`min-h-11 rounded-lg px-4 font-semibold text-white ${danger ? "bg-danger" : "bg-brand-600"}`}
      >
        {t(`admin.state.${action}` as MessageKey)}
      </Button>
      <ModalOverlay isDismissable className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Modal className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className="text-xl font-bold">
                  {t(`admin.state.${action}Title` as MessageKey)}
                </Heading>
                <p>{t(`admin.state.${action}Explain` as MessageKey)}</p>
                <TextField value={reason} onChange={setReason} isRequired maxLength={500} autoFocus className="flex flex-col gap-1">
                  <Label className="font-medium">{t("admin.state.reason")}</Label>
                  <TextArea rows={3} className="rounded-lg border border-gray-400 p-3" />
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
                    isDisabled={!valid || pending}
                    onPress={() => {
                      setError(null);
                      startTransition(async () => {
                        const result = await RUN[action]({ eventId, reason });
                        if (result.ok) {
                          close();
                          router.refresh();
                        } else {
                          setError(t(`errors.${result.error}`));
                        }
                      });
                    }}
                    className={`min-h-11 rounded-lg px-4 font-semibold text-white disabled:opacity-50 ${danger ? "bg-danger" : "bg-brand-600"}`}
                  >
                    {t(`admin.state.${action}Confirm` as MessageKey)}
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

export function EventStateActions({ eventId, status }: { eventId: string; status: string }) {
  const actions = actionsFor(status);
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => (
        <StateActionDialog key={action} eventId={eventId} action={action} />
      ))}
    </div>
  );
}
