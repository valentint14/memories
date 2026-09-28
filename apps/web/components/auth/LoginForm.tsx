"use client";

import { useActionState, type ReactNode } from "react";
import { requestLoginForm } from "@/lib/actions/auth";
import type { FormState } from "@/lib/actions/self-service";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/**
 * Formular nativ cu Server Action: funcționează și înainte de hidratare (conexiuni lente). După
 * trimitere, pagina de cod arată la fel pentru orice adresă (002: FR-010, FR-011).
 */
export function LoginForm({ next, turnstile }: { next?: string | undefined; turnstile: ReactNode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestLoginForm, { status: "idle" });
  const emailError = state.status === "error" && state.error === "VALIDATION";
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {next !== undefined && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className={ui.label}>
          {t("login.email")}
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          defaultValue={values.email}
          required
          autoComplete="email"
          aria-invalid={emailError}
          aria-describedby={emailError ? "login-email-error" : undefined}
          className={ui.input}
        />
        {emailError && (
          <p id="login-email-error" className={ui.fieldError}>
            {t("validation.email")}
          </p>
        )}
      </div>
      {turnstile}
      {state.status === "error" && !emailError && (
        <p role="alert" className={ui.fieldError}>
          {t(`errors.${state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className={ui.buttonPrimary}>
        {pending ? t("login.sending") : t("login.submit")}
      </button>
    </form>
  );
}
