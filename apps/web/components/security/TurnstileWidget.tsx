"use client";

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Încarcă scriptul Turnstile o singură dată, cu nonce-ul CSP al paginii. */
function loadScript(nonce: string): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    const script = existing instanceof HTMLScriptElement ? existing : document.createElement("script");
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      reject(new Error("Turnstile nu s-a încărcat"));
    });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.nonce = nonce;
      document.head.appendChild(script);
    }
  });
}

/**
 * Widgetul Cloudflare Turnstile în modul „managed”: invizibil pentru majoritatea utilizatorilor;
 * scrie tokenul în câmpul ascuns `cf-turnstile-response` al formularului (research R3).
 */
export function TurnstileWidget({ siteKey, nonce }: { siteKey: string; nonce: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    void loadScript(nonce)
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          language: "ro",
          appearance: "interaction-only",
          "response-field-name": "cf-turnstile-response",
        });
      })
      .catch(() => {
        // Fără token, serverul răspunde cu CAPTCHA_FAILED și utilizatorul poate reîncerca.
      });
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, nonce]);

  return <div ref={container} />;
}
