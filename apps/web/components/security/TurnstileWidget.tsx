"use client";

import { useEffect, useRef, useState } from "react";

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
 *
 * Cât timp e invizibil, containerul nu ocupă loc (altfel rămâne un gol de ~70 px, plus distanțele
 * formularului, între câmpuri și butoane). Apare doar când Cloudflare cere o interacțiune
 * (`before-interactive-callback`) și dispare după ea (`after-interactive-callback`).
 */
export function TurnstileWidget({ siteKey, nonce }: { siteKey: string; nonce: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);

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
          // Când apare, ocupă toată lățimea formularului (minimum 300 px), ca butoanele și câmpurile.
          size: "flexible",
          "response-field-name": "cf-turnstile-response",
          "before-interactive-callback": () => {
            setInteractive(true);
          },
          "after-interactive-callback": () => {
            setInteractive(false);
          },
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

  // Invizibil: scos din fluxul formularului (fără înălțime, fără distanțele dintre rânduri).
  return <div ref={container} className={interactive ? "w-full" : "pointer-events-none absolute h-0 w-full overflow-hidden"} />;
}
