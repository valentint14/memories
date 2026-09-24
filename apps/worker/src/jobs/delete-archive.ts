import { query } from "../db.ts";
import { removePaths } from "../storage/purge-prefix.ts";
import type { JobHandler } from "./types.ts";

/** Șterge obiectul unei arhive expirate sau invalidate (idempotent). */
export const deleteArchive: JobHandler<{ type: "delete_archive"; archive_job_id: string }> = {
  async run({ archive_job_id: jobId }) {
    const [job] = await query<{ event_id: string; archive_path: string | null; status: string }>(
      "select event_id, archive_path, status from public.archive_jobs where id = $1",
      [jobId],
    );
    if (!job || job.status !== "expired") return;
    await removePaths("archives", [job.archive_path ?? `${job.event_id}/${jobId}.zip`]);
  },
};
