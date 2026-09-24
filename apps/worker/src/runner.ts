import { captureError } from "./sentry.ts";
import { log } from "./log.ts";
import { archiveMessage, readMessages, setVisibility, type QueuedMessage } from "./queue.ts";
import { MAX_ATTEMPTS, type JobHandler, type JobMessage, type Registry } from "./jobs/types.ts";

/** Vizibilitatea inițială: joburile lungi (video, arhive) o prelungesc prin ctx.extendVisibility. */
const INITIAL_VISIBILITY_SECONDS = 120;

function idsOf(message: JobMessage): Record<string, string> {
  const { type: _type, ...rest } = message;
  const ids: Record<string, string> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === "string" && key.endsWith("_id")) ids[key] = value;
  }
  return ids;
}

/** Procesează un mesaj: succes → archive; eșec → rămâne în coadă; după 5 încercări → eșec final. */
export async function handleMessage(registry: Registry, queued: QueuedMessage): Promise<void> {
  const { message } = queued;
  const handler = registry[message.type] as JobHandler | undefined;
  const started = Date.now();
  const fields = { job: message.type, attempt: queued.read_ct, ...idsOf(message) };

  if (!handler) {
    log.error({ ...fields, result: "failed", error_code: "UNKNOWN_JOB" }, "job necunoscut");
    await archiveMessage(queued.msg_id);
    return;
  }

  try {
    await handler.run(message, {
      msgId: queued.msg_id,
      readCount: queued.read_ct,
      extendVisibility: (seconds) => setVisibility(queued.msg_id, seconds),
    });
    await archiveMessage(queued.msg_id);
    log.info({ ...fields, result: "ok", duration_ms: Date.now() - started }, "job terminat");
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : "UNKNOWN";
    if (queued.read_ct >= MAX_ATTEMPTS) {
      log.error({ ...fields, result: "failed", error_code: errorCode, duration_ms: Date.now() - started }, "job eșuat definitiv");
      captureError(error, { job: message.type });
      try {
        await handler.onFinalFailure?.(message, error);
      } finally {
        await archiveMessage(queued.msg_id);
      }
    } else {
      // Mesajul redevine vizibil la expirarea vizibilității și se reîncearcă.
      log.warn({ ...fields, result: "retry", error_code: errorCode, duration_ms: Date.now() - started }, "job reîncercat");
    }
  }
}

/** Buclă de polling cu concurență limitată și oprire grațioasă. */
export async function runLoop(registry: Registry, opts: { concurrency: number; signal: AbortSignal }): Promise<void> {
  const inFlight = new Set<Promise<void>>();
  while (!opts.signal.aborted) {
    const free = opts.concurrency - inFlight.size;
    const messages = free > 0 ? await readMessages(INITIAL_VISIBILITY_SECONDS, free) : [];
    for (const queued of messages) {
      const p = handleMessage(registry, queued).finally(() => inFlight.delete(p));
      inFlight.add(p);
    }
    if (messages.length === 0) {
      await Promise.race([new Promise((r) => setTimeout(r, 1000)), ...inFlight]);
    }
  }
  await Promise.allSettled(inFlight);
}
