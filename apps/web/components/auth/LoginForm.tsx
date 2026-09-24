"use client";

import { useState, useTransition } from "react";
import { Button, FieldError, Form, Input, Label, TextField } from "react-aria-components";
import { requestMagicLink } from "@/lib/actions/auth";
import { t } from "@/lib/i18n";

export function LoginForm({ next }: { next?: string | undefined }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p role="status" className="rounded-lg bg-brand-50 p-4 text-ink">
        {t("login.sent")}
      </p>
    );
  }

  return (
    <Form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get("email");
        const email = typeof value === "string" ? value : "";
        setError(null);
        startTransition(async () => {
          const result = await requestMagicLink({ email, ...(next ? { next } : {}) });
          if (result.ok) setSent(true);
          else setError(t(`errors.${result.error}`));
        });
      }}
    >
      <TextField name="email" type="email" isRequired autoComplete="email" className="flex flex-col gap-1">
        <Label className="font-medium">{t("login.email")}</Label>
        <Input className="min-h-11 rounded-lg border border-gray-400 px-3 text-base" />
        <FieldError className="text-sm text-danger" />
      </TextField>
      {error !== null && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        isDisabled={pending}
        className="min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60"
      >
        {pending ? t("login.sending") : t("login.submit")}
      </Button>
    </Form>
  );
}
