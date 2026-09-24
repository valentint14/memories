import { closeDb } from "./db.ts";
import { registry } from "./jobs/index.ts";
import { log } from "./log.ts";
import { runLoop } from "./runner.ts";
import { initSentry } from "./sentry.ts";

initSentry();

const controller = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    log.info({ signal }, "oprire grațioasă: se așteaptă joburile în curs");
    controller.abort();
  });
}

log.info("worker pornit");
await runLoop(registry, { concurrency: Number(process.env.WORKER_CONCURRENCY ?? 3), signal: controller.signal });
await closeDb();
log.info("worker oprit");
