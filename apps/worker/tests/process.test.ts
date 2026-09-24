import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { query } from "../src/db.ts";
import { processMedia } from "../src/jobs/process.ts";
import { hasLocationTags } from "../src/media/sanitize.ts";
import { supabase } from "../src/storage/client.ts";
import { createEvent, ctx, randomEmail } from "./support.ts";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/media/", import.meta.url));

afterAll(async () => {
  await exiftool.end();
});

interface MediaRow {
  status: string;
  kind: string;
  detected_mime: string | null;
  original_path: string | null;
  display_path: string | null;
  thumb_path: string | null;
  playback_path: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  processing_error: string | null;
}

/** Rezervă și încarcă un fixture ca un invitat; întoarce id-ul media, cu jobul gata de procesat. */
async function uploadFixture(
  file: string | Buffer,
  mime: string,
  opts: { maxPhotoBytes?: number } = {},
): Promise<{ mediaId: string; eventId: string }> {
  const event = await createEvent({ organizerEmail: randomEmail("org") });
  if (opts.maxPhotoBytes !== undefined) {
    await query("update public.events set max_photo_bytes = $2 where id = $1", [event.id, opts.maxPhotoBytes]);
  }
  const [{ public_token: token } = { public_token: "" }] = await query<{ public_token: string }>(
    "select public_token from public.events where id = $1",
    [event.id],
  );
  const [{ id: sessionId } = { id: "" }] = await query<{ id: string }>(
    "select public.start_guest_session($1, 'ip-test', 'Ana') as id",
    [token],
  );
  const body = typeof file === "string" ? await readFile(join(FIXTURES, file)) : file;
  const [reservation] = await query<{ media_id: string; path: string }>(
    "select * from public.reserve_upload($1, $2, $3, $4, $5)",
    [sessionId, token, typeof file === "string" ? file : "trunchiat.jpg", mime, Math.min(body.length, opts.maxPhotoBytes ?? body.length)],
  );
  if (!reservation) throw new Error("rezervare eșuată");
  const { error } = await supabase().storage.from("incoming").upload(reservation.path, body, { contentType: mime });
  if (error) throw error;
  return { mediaId: reservation.media_id, eventId: event.id };
}

async function row(mediaId: string): Promise<MediaRow> {
  const [r] = await query<MediaRow>("select * from public.media_items where id = $1", [mediaId]);
  if (!r) throw new Error("rând lipsă");
  return r;
}

async function download(path: string): Promise<string> {
  const { data, error } = await supabase().storage.from("media").download(path);
  if (error) throw error;
  const dir = await mkdtemp(join(tmpdir(), "t-"));
  const file = join(dir, path.split("/").pop() ?? "f");
  await writeFile(file, Buffer.from(await data.arrayBuffer()));
  return file;
}

async function incomingExists(path: string): Promise<boolean> {
  const [dir, name] = [path.split("/")[0] ?? "", path.split("/")[1] ?? ""];
  const { data } = await supabase().storage.from("incoming").list(dir, { search: name });
  return (data ?? []).some((o) => o.name === name);
}

describe("process — poze (FR-023, FR-024, FR-025)", () => {
  it.each([
    ["android.jpg", "image/jpeg", "jpg"],
    ["iphone.heic", "image/heic", "heic"],
  ])("%s: elimină locația, păstrează originalul și generează variante WebP", async (file, mime, ext) => {
    const { mediaId, eventId } = await uploadFixture(file, mime);
    await processMedia.run({ type: "process", media_id: mediaId }, ctx);

    const r = await row(mediaId);
    expect(r.status).toBe("ready");
    expect(r.detected_mime).toBe(mime);
    expect(r.original_path).toBe(`${eventId}/${mediaId}/original.${ext}`);
    expect(r.display_path).toBe(`${eventId}/${mediaId}/display.webp`);
    expect(r.thumb_path).toBe(`${eventId}/${mediaId}/thumb.webp`);
    expect(r.width).toBeGreaterThan(0);

    const original = await download(r.original_path ?? "");
    expect(await hasLocationTags(original)).toBe(false);
    const tags = await exiftool.read(original);
    expect(tags.SerialNumber).toBeUndefined();

    const display = await download(r.display_path ?? "");
    const displayTags = await exiftool.read(display);
    expect(displayTags.MIMEType).toBe("image/webp");
    expect(Math.max(displayTags.ImageWidth ?? 0, displayTags.ImageHeight ?? 0)).toBeLessThanOrEqual(2048);

    const thumb = await exiftool.read(await download(r.thumb_path ?? ""));
    expect(Math.max(thumb.ImageWidth ?? 0, thumb.ImageHeight ?? 0)).toBeLessThanOrEqual(400);

    // Orientarea 6 (portret) a fost aplicată variantelor.
    if (file === "android.jpg") expect(displayTags.ImageHeight).toBeGreaterThan(displayTags.ImageWidth ?? 0);

    expect(await incomingExists(`${eventId}/${mediaId}`)).toBe(false);
  });
});

describe("process — video (FR-026, FR-026a)", () => {
  it("iphone-hevc.mov: elimină locația și produce poster + redare H.264", async () => {
    const { mediaId } = await uploadFixture("iphone-hevc.mov", "video/quicktime");
    await processMedia.run({ type: "process", media_id: mediaId }, ctx);

    const r = await row(mediaId);
    expect(r.status).toBe("ready");
    expect(r.duration_ms).toBeGreaterThan(2000);
    expect(r.thumb_path).toMatch(/poster\.webp$/);
    expect(r.playback_path).toMatch(/playback\.mp4$/);

    expect(await hasLocationTags(await download(r.original_path ?? ""))).toBe(false);

    const playback = await download(r.playback_path ?? "");
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,height", "-of", "csv=p=0", playback], { encoding: "utf8" });
    const [codec, height] = probe.stdout.trim().split(",");
    expect(codec).toBe("h264");
    expect(Number(height)).toBeLessThanOrEqual(1080);
    expect(await hasLocationTags(playback)).toBe(false);
  });
});

describe("process — respingeri și fișiere corupte", () => {
  it("fake.jpg: tipul real nu corespunde → rejected, obiect șters, limita eliberată", async () => {
    const { mediaId, eventId } = await uploadFixture("fake.jpg", "image/jpeg");
    await processMedia.run({ type: "process", media_id: mediaId }, ctx);
    const r = await row(mediaId);
    expect(r.status).toBe("rejected");
    expect(r.processing_error).toBe("TYPE_MISMATCH");
    expect(await incomingExists(`${eventId}/${mediaId}`)).toBe(false);
    const [session] = await query<{ files_reserved: number }>(
      "select s.files_reserved from public.guest_sessions s join public.media_items m on m.guest_session_id = s.id where m.id = $1",
      [mediaId],
    );
    expect(session?.files_reserved).toBe(0);
  });

  it("dimensiunea reală peste limită → rejected", async () => {
    const { mediaId } = await uploadFixture("android.jpg", "image/jpeg", { maxPhotoBytes: 1000 });
    await processMedia.run({ type: "process", media_id: mediaId }, ctx);
    const r = await row(mediaId);
    expect(r.status).toBe("rejected");
    expect(r.processing_error).toBe("TOO_LARGE");
  });

  it("corrupt.jpg cu GPS care nu poate fi curățat → failed, niciodată servit", async () => {
    const { mediaId, eventId } = await uploadFixture("corrupt.jpg", "image/jpeg");
    await processMedia.run({ type: "process", media_id: mediaId }, ctx);
    const r = await row(mediaId);
    expect(r.status).toBe("failed");
    expect(r.processing_error).toBe("LOCATION_NOT_REMOVED");
    expect(r.original_path).toBeNull();
    expect(await incomingExists(`${eventId}/${mediaId}`)).toBe(false);
  });

  it("JPEG trunchiat fără locație → gata, fără previzualizare, cu originalul descărcabil", async () => {
    const whole = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#884488" } }).jpeg().toBuffer();
    const { mediaId } = await uploadFixture(whole.subarray(0, 600), "image/jpeg");
    await processMedia.run({ type: "process", media_id: mediaId }, ctx);
    const r = await row(mediaId);
    expect(r.status).toBe("ready");
    expect(r.thumb_path).toBeNull();
    expect(r.display_path).toBeNull();
    expect(r.original_path).not.toBeNull();
  });

  it("e idempotent: un mesaj repetat pentru un fișier gata nu schimbă nimic", async () => {
    const { mediaId } = await uploadFixture("clip.mp4", "video/mp4");
    await processMedia.run({ type: "process", media_id: mediaId }, ctx);
    const before = await row(mediaId);
    await processMedia.run({ type: "process", media_id: mediaId }, ctx);
    expect(await row(mediaId)).toEqual(before);
  });
});
