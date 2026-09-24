"use client";

import { useEffect } from "react";

/** Marchează documentul după hidratare; testele e2e îl așteaptă înainte de a completa formulare. */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
