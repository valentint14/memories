import type { JobHandler, JobMessage, Registry } from "./types.ts";

/** Handler provizoriu pentru joburile încă neimplementate: eșuează explicit, fără să piardă mesajul. */
function notImplemented<T extends JobMessage>(type: T["type"]): JobHandler<T> {
  return {
    run() {
      return Promise.reject(new Error(`Jobul ${type} nu este încă implementat`));
    },
  };
}

export const registry: Registry = {
  process: notImplemented("process"),
  build_archive: notImplemented("build_archive"),
  delete_archive: notImplemented("delete_archive"),
  purge_media: notImplemented("purge_media"),
  purge_event: notImplemented("purge_event"),
  expire_event: notImplemented("expire_event"),
  delete_organizer_user: notImplemented("delete_organizer_user"),
  retention_notice: notImplemented("retention_notice"),
};
