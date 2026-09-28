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
  activate: ({ eventId }) => activateEvent({ eventId }),
  suspend: suspendEvent,
  reactivate: reactivateEvent,
};

/** Doar suspendarea și reactivarea cer motiv; activarea se confirmă după numele evenimentului (FR-028). */
const NEEDS_REASON: Record<StateAction, boolean> = { activate: false, suspend: true, reactivate: true };

/** Evenimentul asupra căruia se face acțiunea, arătat în dialog ca verificare. */
export interface EventSubject {
  name: string;
  organizerEmail: string | null;
}

/** Acțiunile permise de starea curentă (002: FR-022, FR-028). */
function actionsFor(status: string): StateAction[] {
  if (status === "awaiting_activation") return ["activate"];
  if (status === "active") return ["suspend"];
  if (status === "suspended") return ["reactivate"];
  return [];
}

/**
 * Dialog de confirmare, înregistrat în istoric (FR-024). Arată evenimentul asupra căruia se face
 * acțiunea; suspendarea și reactivarea cer în plus un motiv (1–500 de caractere).
 */
function StateActionDialog({
  eventId,
  subject,
  action,
  trigger,
}: {
  eventId: string;
  subject: EventSubject;
  action: StateAction;
  /** Declanșator discret (text subliniat), pentru rândurile din registru. */
  trigger?: { label: string; ariaLabel: string };
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needsReason = NEEDS_REASON[action];
  const valid = !needsReason || (reason.trim().length >= 1 && reason.trim().length <= 500);
  const danger = action === "suspend";

  return (
    <DialogTrigger>
      {trigger ? (
        <Button aria-label={trigger.ariaLabel} className={ui.buttonText}>
          {trigger.label}
        </Button>
      ) : (
        <Button className={danger ? ui.buttonDanger : ui.buttonPrimary}>{t(`admin.state.${action}` as MessageKey)}</Button>
      )}
      <ModalOverlay isDismissable className={ui.overlay}>
        <Modal className={ui.dialog}>
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className={ui.dialogTitle}>
                  {t(`admin.state.${action}Title` as MessageKey)}
                </Heading>
                <div data-testid="state-subject" className={`${ui.notice} flex flex-col gap-1`}>
                  <span className="font-serif text-xl leading-tight">{subject.name}</span>
                  {subject.organizerEmail !== null && <span className="text-sm break-all text-ink-muted">{subject.organizerEmail}</span>}
                </div>
                <p className="leading-relaxed">{t(`admin.state.${action}Explain` as MessageKey)}</p>
                {needsReason && (
                  <TextField value={reason} onChange={setReason} isRequired maxLength={500} autoFocus className="flex flex-col gap-1.5">
                    <Label className={ui.label}>{t("admin.state.reason")}</Label>
                    <TextArea rows={3} className={ui.textarea} />
                  </TextField>
                )}
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

/** Activarea direct din registru, cu același dialog de confirmare ca pe pagina evenimentului. */
export function ActivateFromLedger({ eventId, subject }: { eventId: string; subject: EventSubject }) {
  return (
    <StateActionDialog
      eventId={eventId}
      subject={subject}
      action="activate"
      trigger={{ label: t("admin.ledger.activate"), ariaLabel: t("admin.ledger.activateEvent", { name: subject.name }) }}
    />
  );
}

export function EventStateActions({ eventId, subject, status }: { eventId: string; subject: EventSubject; status: string }) {
  const actions = actionsFor(status);
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => (
        <StateActionDialog key={action} eventId={eventId} subject={subject} action={action} />
      ))}
    </div>
  );
}
