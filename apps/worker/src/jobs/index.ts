import { adminActivationNotice } from "./admin-activation-notice.ts";
import { authEmail } from "./auth-email.ts";
import { authRotate } from "./auth-rotate.ts";
import { buildArchive } from "./build-archive.ts";
import { deleteArchive } from "./delete-archive.ts";
import { deleteOrganizerUser } from "./delete-organizer-user.ts";
import { expireEvent } from "./expire-event.ts";
import { processMedia } from "./process.ts";
import { purgeEvent } from "./purge-event.ts";
import { purgeMedia } from "./purge-media.ts";
import { retentionNotice } from "./retention-notice.ts";
import type { Registry } from "./types.ts";

/** Toate joburile din coada `media_jobs` (contracts/worker-jobs.md). */
export const registry: Registry = {
  process: processMedia,
  build_archive: buildArchive,
  delete_archive: deleteArchive,
  purge_media: purgeMedia,
  purge_event: purgeEvent,
  expire_event: expireEvent,
  delete_organizer_user: deleteOrganizerUser,
  retention_notice: retentionNotice,
  auth_email: authEmail,
  auth_rotate: authRotate,
  admin_activation_notice: adminActivationNotice,
};
