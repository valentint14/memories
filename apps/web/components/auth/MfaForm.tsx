"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Form, Input, Label, TextField } from "react-aria-components";
import { useRouter } from "next/navigation";
import { enrollTotp, verifyTotp, type TotpEnrollment } from "@/lib/actions/auth";
import { t } from "@/lib/i18n";

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
    <div className="flex flex-col gap-6">
      {existingFactorId === null && (
        <section aria-labelledby="enroll-title" className="flex flex-col gap-3">
          <h2 id="enroll-title" className="text-lg font-semibold">
            {t("mfa.enrollTitle")}
          </h2>
          <p className="text-muted">{t("mfa.enrollIntro")}</p>
          {enrollment && (
            <>
              <img
                src={enrollment.qrCodeDataUrl}
                alt={t("mfa.qrAlt")}
                width={200}
                height={200}
                className="rounded-lg border border-gray-300 bg-white p-2"
              />
              <p>
                {t("mfa.secretLabel")}{" "}
                <code data-testid="totp-secret" className="break-all rounded bg-gray-100 px-2 py-1 font-mono">
                  {enrollment.secret}
                </code>
              </p>
            </>
          )}
        </section>
      )}

      <Form
        className="flex flex-col gap-4"
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
        <TextField name="code" isRequired inputMode="numeric" autoComplete="one-time-code" className="flex flex-col gap-1">
          <Label className="font-medium">{t("mfa.codeLabel")}</Label>
          <Input maxLength={6} className="min-h-11 rounded-lg border border-gray-400 px-3 font-mono text-lg tracking-widest" />
        </TextField>
        {error !== null && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          isDisabled={pending || factorId === null}
          className="min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60"
        >
          {t("mfa.verify")}
        </Button>
      </Form>
    </div>
  );
}
