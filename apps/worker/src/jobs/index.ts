import { deleteOrganizerUser } from "./delete-organizer-user.ts";
import { processMedia } from "./process.ts";
import { purgeEvent } from "./purge-event.ts";
import { purgeMedia } from "./purge-media.ts";
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
  process: processMedia,
  build_archive: notImplemented("build_archive"),
  delete_archive: notImplemented("delete_archive"),
  purge_media: purgeMedia,
  purge_event: purgeEvent,
  expire_event: notImplemented("expire_event"),
  delete_organizer_user: deleteOrganizerUser,
  retention_notice: notImplemented("retention_notice"),
};
