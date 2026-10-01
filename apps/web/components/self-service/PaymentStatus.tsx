"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { paymentState } from "@/lib/actions/payments";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

const POLL_MS = 3_000;
const MAX_WAIT_MS = 120_000;

/**
 * Starea plății după întoarcerea din Stripe (003: FR-009): „se confirmă” se actualizează singură
 * până la confirmare (cel mult 2 minute), apoi pagina se reîncarcă; „nu a reușit” rămâne afișată.
 */
export function PaymentStatus({ eventId, notice }: { eventId: string; notice: "confirming" | "failed" }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (notice !== "confirming") return;
    const started = Date.now();
    const timer = setInterval(() => {
      void paymentState(eventId).then((result) => {
        if (result.ok && result.data !== null && result.data.status !== "open") {
          clearInterval(timer);
          router.refresh();
        } else if (Date.now() - started > MAX_WAIT_MS) {
          clearInterval(timer);
          setSlow(true);
        }
      });
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [eventId, notice, router]);

  if (notice === "failed") {
    return (
      <p role="status" className={ui.caution}>
        {t("payment.failed")}
      </p>
    );
  }
  return (
    <p role="status" className={`${ui.notice} flex items-center gap-2`}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
      {slow ? t("payment.slow") : t("payment.confirming")}
    </p>
  );
}
