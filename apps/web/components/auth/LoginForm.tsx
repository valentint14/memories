"use client";

import { useActionState } from "react";
import { requestMagicLinkForm, type LoginFormState } from "@/lib/actions/auth";
import { t } from "@/lib/i18n";

/**
 * Formular nativ cu Server Action: funcționează și înainte de hidratare (conexiuni lente),
 * iar mesajul de confirmare e identic pentru orice adresă (FR-008).
 */
export function LoginForm({ next }: { next?: string | undefined }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(requestMagicLinkForm, { status: "idle" });

  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-lg bg-brand-50 p-4 text-ink">
        {t("login.sent")}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {next !== undefined && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-1">
        <label htmlFor="login-email" className="font-medium">
          {t("login.email")}
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="min-h-11 rounded-lg border border-gray-400 px-3 text-base"
        />
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60"
      >
        {pending ? t("login.sending") : t("login.submit")}
      </button>
    </form>
  );
}
