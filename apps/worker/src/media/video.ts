import { join } from "node:path";
import sharp from "sharp";
import { run } from "./exec.ts";

export interface VideoInfo {
  width: number;
  height: number;
  durationMs: number;
}

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string };
}

/** Dimensiunile afișate (cu rotația aplicată) și durata, prin ffprobe. */
export async function probeVideo(path: string): Promise<VideoInfo> {
  const json = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]);
  const parsed = JSON.parse(json) as { streams?: ProbeStream[]; format?: { duration?: string } };
  const video = parsed.streams?.find((s) => s.codec_type === "video");
  if (!video?.width || !video.height) throw new Error("fără flux video");
  const rotation = Math.abs(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? Number(video.tags?.rotate ?? 0));
  const swap = rotation === 90 || rotation === 270;
  return {
    width: swap ? video.height : video.width,
    height: swap ? video.width : video.height,
    durationMs: Math.round(Number(parsed.format?.duration ?? 0) * 1000),
  };
}

/** Cadrul poster (la 1 s, sau la jumătate pentru clipuri scurte) ca WebP de max 800 px. */
export async function makePoster(path: string, workDir: string, durationMs: number): Promise<Buffer> {
  const at = Math.min(1, durationMs / 2000);
  const png = join(workDir, "poster.png");
  await run("ffmpeg", ["-v", "error", "-y", "-ss", at.toFixed(2), "-i", path, "-frames:v", "1", png], { timeoutMs: 120_000 });
  return sharp(png).resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}

/**
 * Versiunea de redare compatibilă cu toate browserele (FR-026a, research.md R8): H.264 High +
 * AAC, latura lungă ≤ 1920 (1080p), CRF 23, `+faststart`, rotația aplicată, fără metadate.
 */
export async function makePlayback(path: string, out: string): Promise<void> {
  await run(
    "ffmpeg",
    [
      "-v", "error", "-y", "-i", path,
      "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1",
      "-vf", "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))',format=yuv420p",
      "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      out,
    ],
    { timeoutMs: 30 * 60_000 },
  );
}
