/**
 * Coada de upload a invitatului (Client). Framework-agnostic: dependențele (acțiunile server
 * și transportul TUS) se injectează, ca tranzițiile de stare să poată fi testate unitar.
 */
import { kindOfMime, type AllowedMime, type ErrorCode } from "@memories/shared";

export type FileStatus = "queued" | "reserving" | "uploading" | "paused" | "done" | "rejected" | "failed";

export interface ItemMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface QueueItem {
  id: string;
  name: string;
  size: number;
  status: FileStatus;
  /** 0–1 */
  progress: number;
  message?: ItemMessage;
}

export interface ReservationResult {
  mediaId: string;
  path: string;
  signedToken: string;
  tusEndpoint: string;
  remainingFiles: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; detail?: Record<string, unknown>; retryAfterSec?: number };

export interface TransferCallbacks {
  onProgress(sent: number, total: number): void;
  onSuccess(): void;
  onError(error: unknown): void;
}

export interface Transfer {
  start(): void;
  abort(): Promise<void>;
}

export interface QueueDeps {
  startSession(displayName: string): Promise<Result<unknown>>;
  reserve(file: { name: string; type: string; size: number }, replaceMediaId?: string): Promise<Result<ReservationResult>>;
  createTransfer(file: File, type: AllowedMime, reservation: ReservationResult, callbacks: TransferCallbacks): Promise<Transfer>;
  /** Formatează o dimensiune pentru mesaje (injectat pentru localizare). */
  formatBytes(bytes: number): string;
}

export interface QueueLimits {
  maxPhotoBytes: number;
  maxVideoBytes: number;
}

const EXTENSION_MIME: Record<string, AllowedMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

/** Tipul declarat: din browser sau, dacă lipsește (ex. HEIC în Chrome pe Windows), din extensie. */
export function mimeOf(file: { name: string; type: string }): AllowedMime | null {
  const fromBrowser = Object.values(EXTENSION_MIME).find((m) => m === file.type);
  if (fromBrowser) return fromBrowser;
  if (file.type !== "" && file.type !== "application/octet-stream") return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[ext] ?? null;
}

let counter = 0;

export class UploadQueue {
  private items: QueueItem[] = [];
  private files = new Map<string, File>();
  private replaces = new Map<string, string>();
  private transfers = new Map<string, Transfer>();
  private listeners = new Set<() => void>();
  private session: Promise<boolean> | null = null;
  private active = 0;

  constructor(
    private readonly deps: QueueDeps,
    private readonly limits: QueueLimits,
    private readonly getDisplayName: () => string,
    private readonly concurrency = 2,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): readonly QueueItem[] => this.items;

  /** Adaugă fișiere; `replaceMediaIds` (nume → id) reia rezervările nefinalizate (FR-016a). */
  add(files: readonly File[], replaceMediaIds?: ReadonlyMap<string, string>): void {
    for (const file of files) {
      counter += 1;
      const id = `f${String(counter)}`;
      this.files.set(id, file);
      const replace = replaceMediaIds?.get(file.name);
      if (replace) this.replaces.set(id, replace);
      this.items = [...this.items, { id, name: file.name, size: file.size, status: "queued", progress: 0 }];
    }
    this.emit();
    this.pump();
  }

  retry(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.status !== "failed") return;
    this.update(id, { status: "queued", progress: 0, message: undefined });
    this.pump();
  }

  /** Suspendă transferurile la pierderea conexiunii; se reiau la `resumeAll` (US6). */
  pauseAll(): void {
    for (const [id, transfer] of this.transfers) {
      void transfer.abort();
      this.update(id, { status: "paused" });
    }
  }

  resumeAll(): void {
    for (const [id, transfer] of this.transfers) {
      const item = this.items.find((i) => i.id === id);
      if (item?.status === "paused") {
        this.update(id, { status: "uploading" });
        transfer.start();
      }
    }
  }

  summary(): { done: number; failed: number; inProgress: number } {
    let done = 0;
    let failed = 0;
    let inProgress = 0;
    for (const i of this.items) {
      if (i.status === "done") done += 1;
      else if (i.status === "failed" || i.status === "rejected") failed += 1;
      else inProgress += 1;
    }
    return { done, failed, inProgress };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private update(id: string, patch: Partial<QueueItem>): void {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    this.emit();
  }

  private pump(): void {
    while (this.active < this.concurrency) {
      const next = this.items.find((i) => i.status === "queued");
      if (!next) return;
      this.active += 1;
      this.update(next.id, { status: "reserving" });
      void this.process(next.id).finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  private ensureSession(): Promise<boolean> {
    this.session ??= this.deps.startSession(this.getDisplayName()).then((r) => {
      if (!r.ok) this.session = null;
      return r.ok;
    });
    return this.session;
  }

  private reject(id: string, message: ItemMessage): void {
    this.update(id, { status: "rejected", message });
  }

  private async process(id: string): Promise<void> {
    const file = this.files.get(id);
    if (!file) return;
    const type = mimeOf(file);
    if (type === null) {
      this.reject(id, { key: "errors.FILE_TYPE_NOT_ALLOWED" });
      return;
    }
    const max = kindOfMime(type) === "photo" ? this.limits.maxPhotoBytes : this.limits.maxVideoBytes;
    if (file.size > max) {
      this.reject(id, { key: "upload.tooLarge", params: { max: this.deps.formatBytes(max) } });
      return;
    }

    if (!(await this.ensureSession())) {
      this.update(id, { status: "failed", message: { key: "upload.sessionFailed" } });
      return;
    }

    const reserved = await this.deps.reserve({ name: file.name, type, size: file.size }, this.replaces.get(id));
    if (!reserved.ok) {
      const limit = reserved.detail?.limit;
      const maxBytes = reserved.detail?.maxBytes;
      if (reserved.error === "FILE_LIMIT_REACHED" && typeof limit === "number") {
        this.reject(id, { key: "upload.limitReached", params: { limit } });
      } else if (reserved.error === "FILE_TOO_LARGE" && typeof maxBytes === "number") {
        this.reject(id, { key: "upload.tooLarge", params: { max: this.deps.formatBytes(maxBytes) } });
      } else if (reserved.error === "RATE_LIMITED" || reserved.error === "INTERNAL") {
        this.update(id, { status: "failed", message: { key: `errors.${reserved.error}` } });
      } else {
        this.reject(id, { key: `errors.${reserved.error}` });
      }
      return;
    }

    this.update(id, { status: "uploading", progress: 0 });
    await new Promise<void>((resolve) => {
      void this.deps
        .createTransfer(file, type, reserved.data, {
          onProgress: (sent, total) => {
            this.update(id, { progress: total > 0 ? sent / total : 0 });
          },
          onSuccess: () => {
            this.transfers.delete(id);
            this.update(id, { status: "done", progress: 1, message: undefined });
            resolve();
          },
          onError: () => {
            this.transfers.delete(id);
            this.update(id, { status: "failed", message: { key: "upload.failed" } });
            resolve();
          },
        })
        .then((transfer) => {
          this.transfers.set(id, transfer);
          transfer.start();
        })
        .catch(() => {
          this.update(id, { status: "failed", message: { key: "upload.failed" } });
          resolve();
        });
    });
  }
}
