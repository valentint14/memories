/** Mesajele din coada `media_jobs` (contracts/worker-jobs.md › Mesaje). */
export type JobMessage =
  | { type: "process"; media_id: string }
  | { type: "build_archive"; archive_job_id: string }
  | { type: "delete_archive"; archive_job_id: string }
  | { type: "purge_media"; media_ids: string[] }
  | { type: "purge_event"; event_id: string }
  | { type: "expire_event"; event_id: string }
  | { type: "delete_organizer_user"; user_id: string }
  | { type: "retention_notice"; event_id: string; threshold: "30d" | "7d" | "1d"; purge_at: string };

export type JobType = JobMessage["type"];

export interface JobContext {
  msgId: number;
  /** Numărul de citiri ale mesajului (1 la prima încercare). */
  readCount: number;
  /** Prelungește invizibilitatea mesajului cât timp jobul lucrează (pgmq.set_vt). */
  extendVisibility(seconds: number): Promise<void>;
}

export interface JobHandler<T extends JobMessage = JobMessage> {
  run(message: T, ctx: JobContext): Promise<void>;
  /** Apelat o singură dată când mesajul a eșuat de prea multe ori (read_ct > 5). */
  onFinalFailure?(message: T, error: unknown): Promise<void>;
}

export type Registry = { [K in JobType]: JobHandler<Extract<JobMessage, { type: K }>> };

export const MAX_ATTEMPTS = 5;
