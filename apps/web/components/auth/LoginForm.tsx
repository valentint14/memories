"use client";

import { useActionState, type ReactNode } from "react";
import { requestLoginForm } from "@/lib/actions/auth";
import type { FormState } from "@/lib/actions/self-service";
import { t } from "@/lib/i18n";

/**
 * Formular nativ cu Server Action: funcționează și înainte de hidratare (conexiuni lente). După
 * trimitere, pagina de cod arată la fel pentru orice adresă (002: FR-010, FR-011).
 */
export function LoginForm({ next, turnstile }: { next?: string | undefined; turnstile: ReactNode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestLoginForm, { status: "idle" });
  const emailError = state.status === "error" && state.error === "VALIDATION";

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
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
          aria-invalid={emailError}
          aria-describedby={emailError ? "login-email-error" : undefined}
          className="min-h-11 rounded-lg border border-gray-400 px-3 text-base"
        />
        {emailError && (
          <p id="login-email-error" className="text-sm text-danger">
            {t("validation.email")}
          </p>
        )}
      </div>
      {turnstile}
      {state.status === "error" && !emailError && (
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
