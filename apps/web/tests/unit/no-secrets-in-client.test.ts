import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Constituția, principiul III: niciun secret în bundle-ul trimis browserului.
const WEB = fileURLToPath(new URL("../..", import.meta.url));
const STATIC = join(WEB, ".next", "static");

function loadEnv(): Record<string, string> {
  const file = join(WEB, ".env.local");
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1] ?? "", m[2] ?? ""]),
  );
}

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|css|json|map|html)$/.test(name)) yield path;
  }
}

describe("bundle-ul client", () => {
  it("nu conține cheia service role, secretul IP, secretul Turnstile sau numele variabilelor secrete", { timeout: 600_000 }, () => {
    if (!existsSync(STATIC)) execSync("npx next build", { cwd: WEB, stdio: "ignore" });
    const env = { ...loadEnv(), ...process.env };
    const needles = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "IP_HASH_SECRET",
      "TURNSTILE_SECRET_KEY",
      env.SUPABASE_SERVICE_ROLE_KEY,
      env.IP_HASH_SECRET,
      env.TURNSTILE_SECRET_KEY,
    ].filter((n): n is string => typeof n === "string" && n.length > 0);
    expect(needles.length).toBeGreaterThanOrEqual(3);

    const leaks: string[] = [];
    for (const file of files(STATIC)) {
      const content = readFileSync(file, "utf8");
      for (const needle of needles) if (content.includes(needle)) leaks.push(`${file}: ${needle.slice(0, 12)}…`);
    }
    expect(leaks).toEqual([]);
  });
});
