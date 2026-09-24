import { buildArchive } from "./build-archive.ts";
import { deleteArchive } from "./delete-archive.ts";
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
  build_archive: buildArchive,
  delete_archive: deleteArchive,
  purge_media: purgeMedia,
  purge_event: purgeEvent,
  expire_event: notImplemented("expire_event"),
  delete_organizer_user: deleteOrganizerUser,
  retention_notice: notImplemented("retention_notice"),
};
