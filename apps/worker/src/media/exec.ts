import { spawn } from "node:child_process";

export class CommandError extends Error {
  readonly command: string;
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(command: string, exitCode: number | null, stderr: string) {
    super(`${command} a eșuat (cod ${String(exitCode)})`);
    this.name = "CommandError";
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/** Rulează un binar de sistem (ffmpeg, ffprobe, heif-dec) fără shell; întoarce stdout. */
export function run(command: string, args: readonly string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out).toString("utf8"));
      else reject(new CommandError(command, code, Buffer.concat(err).toString("utf8").slice(-2000)));
    });
  });
}
