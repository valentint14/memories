"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Form, Input, Label, TextField } from "react-aria-components";
import { useRouter } from "next/navigation";
import { enrollTotp, verifyTotp, type TotpEnrollment } from "@/lib/actions/auth";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Înrolare TOTP (cod QR + secret ca text) sau verificarea unui factor existent (FR-006a). */
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

  const factorId = existingFactorId ?? enrollment?.factorId ?? null;

  return (
    <div className="flex flex-col gap-8">
      {existingFactorId === null && (
        <section aria-labelledby="enroll-title" className={ui.section}>
          <h2 id="enroll-title" className={ui.kicker}>
            {t("mfa.enrollTitle")}
          </h2>
          <p className="leading-relaxed text-ink-muted">{t("mfa.enrollIntro")}</p>
          {enrollment && (
            <>
              {/* Codul QR rămâne pe alb pur, pentru scanare. */}
              <img
                src={enrollment.qrCodeDataUrl}
                alt={t("mfa.qrAlt")}
                width={200}
                height={200}
                className="rounded-xs border border-ink p-2"
              />
              <p>
                {t("mfa.secretLabel")}{" "}
                <code data-testid="totp-secret" className={`${ui.data} break-all border border-rule bg-paper-raised px-2 py-1`}>
                  {enrollment.secret}
                </code>
              </p>
            </>
          )}
        </section>
      )}

      <Form
        className="flex flex-col gap-5"
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
        </TextField>
        {error !== null && (
          <p role="alert" className={ui.fieldError}>
            {error}
          </p>
        )}
        <Button type="submit" isDisabled={pending || factorId === null} className={ui.buttonPrimary}>
          {t("mfa.verify")}
        </Button>
      </Form>
    </div>
  );
}
