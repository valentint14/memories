import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./exec.ts";

export interface TempFile {
  path: string;
  cleanup(): Promise<void>;
}

/**
 * Decodează HEIC/HEIF cu `heif-dec` (libheif + libde265) într-un PNG fără pierderi, cu
 * transformările (rotație/oglindire) aplicate — research.md R5 revizuit.
 */
export async function decodeHeicToPng(source: string): Promise<TempFile> {
  const dir = await mkdtemp(join(tmpdir(), "heic-"));
  const out = join(dir, "decoded.png");
  try {
    await run("heif-dec", [source, out], { timeoutMs: 120_000 });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { path: out, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
