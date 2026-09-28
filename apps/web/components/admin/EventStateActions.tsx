"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, DialogTrigger, Heading, Label, Modal, ModalOverlay, TextArea, TextField } from "react-aria-components";
import { activateEvent, reactivateEvent, suspendEvent } from "@/lib/actions/admin";
import type { ActionResult } from "@/lib/actions/result";
import { t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";

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
      <Button className={danger ? ui.buttonDanger : ui.buttonPrimary}>{t(`admin.state.${action}` as MessageKey)}</Button>
      <ModalOverlay isDismissable className={ui.overlay}>
        <Modal className={ui.dialog}>
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className={ui.dialogTitle}>
                  {t(`admin.state.${action}Title` as MessageKey)}
                </Heading>
                <p className="leading-relaxed">{t(`admin.state.${action}Explain` as MessageKey)}</p>
                <TextField value={reason} onChange={setReason} isRequired maxLength={500} autoFocus className="flex flex-col gap-1.5">
                  <Label className={ui.label}>{t("admin.state.reason")}</Label>
                  <TextArea rows={3} className={ui.textarea} />
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
                    className={danger ? ui.buttonDangerSolid : ui.buttonPrimary}
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
