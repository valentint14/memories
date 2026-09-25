import { describe, expect, it, vi } from "vitest";
import {
  UploadQueue,
  mimeOf,
  type QueueDeps,
  type ReservationResult,
  type Transfer,
  type TransferCallbacks,
} from "../../lib/upload/queue";

interface FakeTransfer extends Transfer {
  callbacks: TransferCallbacks;
  starts: number;
  aborts: number;
}

function setup(overrides: Partial<QueueDeps> = {}, getName: () => string = () => "") {
  const transfers: FakeTransfer[] = [];
  let n = 0;
  const reserve = vi.fn<QueueDeps["reserve"]>((_file, replace) => {
    n += 1;
    const data: ReservationResult = {
      mediaId: replace ?? `m${String(n)}`,
      path: "p",
      signedToken: "t",
      tusEndpoint: "e",
      remainingFiles: 10,
    };
    return Promise.resolve({ ok: true as const, data });
  });
  const deps: QueueDeps = {
    startSession: vi.fn(() => Promise.resolve({ ok: true as const, data: {} })),
    reserve,
    createTransfer: (_file, _type, _reservation, callbacks) => {
      const t: FakeTransfer = {
        callbacks,
        starts: 0,
        aborts: 0,
        start() {
          this.starts += 1;
        },
        abort() {
          this.aborts += 1;
          return Promise.resolve();
        },
      };
      transfers.push(t);
      return Promise.resolve(t);
    },
    formatBytes: (b) => `${String(b)} B`,
    ...overrides,
  };
  const queue = new UploadQueue(deps, { maxPhotoBytes: 1000, maxVideoBytes: 5000 }, getName);
  return { queue, transfers, reserve };
}

const file = (name: string, size: number, type = "image/jpeg") => new File([new Uint8Array(size)], name, { type });
const flush = () => new Promise((r) => setTimeout(r, 0));
const statusOf = (queue: UploadQueue) => queue.getSnapshot().map((i) => i.status);

describe("UploadQueue — tranziții de stare (US6)", () => {
  it("rezervă, încarcă, raportează progresul și termină", async () => {
    const { queue, transfers } = setup();
    queue.add([file("a.jpg", 100)]);
    await flush();
    expect(statusOf(queue)).toEqual(["uploading"]);
    transfers[0]?.callbacks.onProgress(50, 100);
    expect(queue.getSnapshot()[0]?.progress).toBe(0.5);
    transfers[0]?.callbacks.onSuccess();
    expect(statusOf(queue)).toEqual(["done"]);
  });

  it("trece în pauză la pierderea rețelei și reia același transfer la revenire (FR-016)", async () => {
    const { queue, transfers } = setup();
    queue.add([file("a.jpg", 100)]);
    await flush();
    queue.pauseAll();
    expect(statusOf(queue)).toEqual(["paused"]);
    expect(transfers[0]?.aborts).toBe(1);
    queue.resumeAll();
    expect(statusOf(queue)).toEqual(["uploading"]);
    // Același obiect TUS: reluarea continuă de la offset-ul confirmat de server.
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.starts).toBe(2);
  });

  it("după epuizarea reîncercărilor automate trece în `failed`; reîncercarea manuală refolosește rezervarea", async () => {
    const { queue, transfers, reserve } = setup();
    queue.add([file("a.jpg", 100)]);
    await flush();
    transfers[0]?.callbacks.onError(new Error("rețea"));
    expect(statusOf(queue)).toEqual(["failed"]);

    const id = queue.getSnapshot()[0]?.id ?? "";
    queue.retry(id);
    await flush();
    expect(statusOf(queue)).toEqual(["uploading"]);
    expect(reserve).toHaveBeenCalledTimes(2);
    // A doua rezervare reia fișierul `m1`, fără a consuma din nou limita.
    expect(reserve.mock.calls[1]?.[1]).toBe("m1");
  });

  it("respinge local tipurile nepermise și fișierele prea mari, fără a contacta serverul", async () => {
    const { queue, reserve } = setup();
    queue.add([file("a.txt", 10, "text/plain"), file("b.jpg", 2000)]);
    await flush();
    expect(statusOf(queue)).toEqual(["rejected", "rejected"]);
    expect(queue.getSnapshot()[1]?.message).toEqual({ key: "upload.tooLarge", params: { max: "1000 B" } });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("reia rezervările nefinalizate la reselectarea după reîncărcare (FR-016a)", async () => {
    const { queue, reserve } = setup();
    queue.add([file("IMG_1.jpg", 100)], new Map([["IMG_1.jpg", "vechi"]]));
    await flush();
    expect(reserve.mock.calls[0]?.[1]).toBe("vechi");
  });

  it("afișează limita atinsă cu valoarea ei", async () => {
    const { queue } = setup({
      reserve: () => Promise.resolve({ ok: false, error: "FILE_LIMIT_REACHED", detail: { limit: 5 } }),
    });
    queue.add([file("a.jpg", 10)]);
    await flush();
    expect(queue.getSnapshot()[0]?.message).toEqual({ key: "upload.limitReached", params: { limit: 5 } });
  });
});

describe("mimeOf", () => {
  it("deduce tipul din extensie când browserul nu îl dă (HEIC în Chrome pe Windows)", () => {
    expect(mimeOf({ name: "IMG_0001.HEIC", type: "" })).toBe("image/heic");
    expect(mimeOf({ name: "clip.mov", type: "" })).toBe("video/quicktime");
    expect(mimeOf({ name: "x.pdf", type: "application/pdf" })).toBeNull();
  });
});

describe("UploadQueue — numele invitatului", () => {
  it("trimite numele completat sau schimbat după primul fișier", async () => {
    let name = "";
    const startSession = vi.fn<QueueDeps["startSession"]>(() => Promise.resolve({ ok: true as const, data: {} }));
    const { queue } = setup({ startSession }, () => name);
    queue.add([file("a.jpg", 100)]);
    await flush();
    name = "Ana";
    queue.add([file("b.jpg", 100)]);
    await flush();
    queue.add([file("c.jpg", 100)]);
    await flush();
    expect(startSession.mock.calls).toEqual([[""], ["Ana"]]);
  });
});
