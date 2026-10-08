"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Form, Input, Label, Text, TextField } from "react-aria-components";
import { useRouter } from "next/navigation";
import { enrollTotp, verifyTotp, type TotpEnrollment } from "@/lib/actions/auth";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { SheetActions } from "../ui/SheetActions";
import { Sheet } from "../ui/Sheet";
import { StepList } from "../ui/StepList";

/**
 * Înrolare TOTP (cod QR + secret ca text) sau verificarea unui factor existent (FR-006a), în două
 * foi egale: la înrolare, configurarea și codul; la verificare, codul și unde se găsește.
 */
export function MfaForm({ factorId: existingFactorId }: { factorId: string | null }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // În dev (Strict Mode) efectul rulează de două ori; a doua înrolare ar șterge factorul primei.
  const enrollStarted = useRef(false);

  useEffect(() => {
    if (existingFactorId !== null || enrollStarted.current) return;
    enrollStarted.current = true;
    void enrollTotp().then((result) => {
      if (result.ok) setEnrollment(result.data);
      else setError(t(`errors.${result.error}`));
    });
  }, [existingFactorId]);

  const enrolling = existingFactorId === null;
  const factorId = existingFactorId ?? enrollment?.factorId ?? null;

  const codeSheet = (
    <Sheet id="mfa-code-title" title={t("mfa.sheet.code")}>
      <Form
        className={ui.sheetForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (factorId === null) return;
          const value = new FormData(e.currentTarget).get("code");
          const code = typeof value === "string" ? value.trim() : "";
          setError(null);
          startTransition(async () => {
            const result = await verifyTotp({ factorId, code });
            if (result.ok) router.replace("/admin/events");
            else setError(t(`errors.${result.error}`));
          });
        }}
      >
        <TextField name="code" isRequired inputMode="numeric" autoComplete="one-time-code" className="flex flex-col gap-1.5">
          <Label className={ui.label}>{t("mfa.codeLabel")}</Label>
          <Input maxLength={6} className={ui.codeInput} />
          {enrolling && (
            <Text slot="description" className={ui.hint}>
              {t("mfa.codeHint")}
            </Text>
          )}
        </TextField>
        <SheetActions
          status={
            error !== null && (
              <p role="alert" className={ui.fieldError}>
                {error}
              </p>
            )
          }
        >
          <Button type="submit" isDisabled={pending || factorId === null} className={ui.buttonPrimary}>
            {t("mfa.verify")}
          </Button>
        </SheetActions>
      </Form>
    </Sheet>
  );

  return (
    <div className="flex flex-col gap-6">
      {enrolling ? (
        <>
          <Sheet id="enroll-title" title={t("mfa.sheet.setup")}>
            <p className="leading-relaxed">{t("mfa.enrollIntro")}</p>
            {enrollment && (
              <>
                {/* Codul QR rămâne pe alb pur, pentru scanare. */}
                <img
                  src={enrollment.qrCodeDataUrl}
                  alt={t("mfa.qrAlt")}
                  width={200}
                  height={200}
                  className="self-center rounded-xs border border-ink p-2"
                />
                {/* Cheia rămâne pe un singur rând; pe ecrane foarte înguste se derulează orizontal. */}
                <p className="flex flex-col gap-1.5">
                  <span className={ui.label}>{t("mfa.secretLabel")}</span>
                  <code
                    data-testid="totp-secret"
                    className={`${ui.data} block overflow-x-auto whitespace-nowrap rounded-xs border border-rule bg-paper px-2 py-1.5 text-center text-sm`}
                  >
                    {enrollment.secret}
                  </code>
                </p>
              </>
            )}
          </Sheet>
          {codeSheet}
        </>
      ) : (
        <>
          {codeSheet}
          <Sheet id="mfa-steps-title" title={t("mfa.sheet.steps")}>
            <StepList steps={[t("mfa.step1"), t("mfa.step2"), t("mfa.step3")]} />
          </Sheet>
        </>
      )}
    </div>
  );
}
