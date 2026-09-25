"use client";

import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { browserSupabase } from "../supabase/browser";
import { authorizeRealtime } from "./auth";

export type ChannelStatus = "connecting" | "subscribed" | "offline";

/**
 * Abonarea la schimbările fișierelor unui eveniment (research.md R10). La fiecare schimbare și
 * la fiecare (re)abonare se apelează `onResync`, care cere diferența de la ultimul `updatedAt`
 * văzut — astfel o reconectare recuperează tot ce a apărut între timp, fără duplicate (FR-033).
 */
export function useEventChannel(
  eventId: string,
  handlers: { onResync: () => void; onDelete: (id: string) => void },
  /** Fals pentru un eveniment suspendat: fără actualizări în timp real (002/FR-028a). */
  enabled = true,
): ChannelStatus {
  const [status, setStatus] = useState<ChannelStatus>(enabled ? "connecting" : "offline");
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const supabase = browserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Mai multe evenimente apropiate (INSERT + UPDATE-uri) → o singură resincronizare.
    const scheduleResync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        handlersRef.current.onResync();
      }, 250);
    };

    const channel = supabase
      .channel(`event:${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "media_items", filter: `event_id=eq.${eventId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: unknown }).id;
            if (typeof id === "string") handlersRef.current.onDelete(id);
            return;
          }
          scheduleResync();
        },
      );
    let cancelled = false;
    void authorizeRealtime(supabase).then(() => {
      if (cancelled) return;
      channel.subscribe((state) => {
        if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          setStatus("subscribed");
          scheduleResync();
        } else {
          setStatus("offline");
        }
      });
    });

    // Revenirea rețelei: resincronizare imediată, chiar înainte ca Realtime să se reconecteze.
    const onOnline = () => {
      scheduleResync();
    };
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [eventId, enabled]);

  return status;
}
