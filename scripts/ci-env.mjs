// Construiește variabilele de mediu din instanța Supabase locală.
//   node scripts/ci-env.mjs           → KEY=VALUE pe stdout (CI: >> $GITHUB_ENV)
//   node scripts/ci-env.mjs --write   → scrie apps/web/.env.local și apps/worker/.env
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const raw = execFileSync("npx", ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
const status = Object.fromEntries(
  raw
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const need = (k) => {
  const v = status[k];
  if (!v) throw new Error(`supabase status nu a întors ${k}`);
  return v;
};

const apiUrl = need("API_URL");
const env = {
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: need("ANON_KEY"),
  SUPABASE_URL: apiUrl,
  SUPABASE_SERVICE_ROLE_KEY: need("SERVICE_ROLE_KEY"),
  DATABASE_URL: need("DB_URL"),
  S3_ENDPOINT: status.STORAGE_S3_URL ?? `${apiUrl}/storage/v1/s3`,
  S3_REGION: status.S3_PROTOCOL_REGION ?? "local",
  S3_ACCESS_KEY_ID: need("S3_PROTOCOL_ACCESS_KEY_ID"),
  S3_SECRET_ACCESS_KEY: need("S3_PROTOCOL_ACCESS_KEY_SECRET"),
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "54325",
  SMTP_FROM: "Memories <no-reply@example.test>",
  APP_URL: "http://localhost:3000",
  IP_HASH_SECRET: process.env.IP_HASH_SECRET ?? randomBytes(32).toString("hex"),
  // Cheile de test Cloudflare Turnstile (research R3): trec mereu; producția are cheile proprii.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000BB",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  // Fără scriptul extern în teste; acceptat doar împreună cu secretul de test (server-env.ts).
  TURNSTILE_OFFLINE: "1",
  ADMIN_NOTIFY_EMAILS: "",
  MAILPIT_URL: status.MAILPIT_URL ?? status.INBUCKET_URL ?? "http://127.0.0.1:54324",
};

const lines = (keys) => keys.map((k) => `${k}=${env[k]}`).join("\n") + "\n";

if (process.argv.includes("--write")) {
  writeFileSync(
    "apps/web/.env.local",
    lines([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "APP_URL",
      "IP_HASH_SECRET",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "TURNSTILE_SECRET_KEY",
      "TURNSTILE_OFFLINE",
    ]),
  );
  writeFileSync(
    "apps/worker/.env",
    lines(["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "APP_URL", "ADMIN_NOTIFY_EMAILS"]),
  );
  // Varianta pentru containerul worker-ului: Supabase local se vede prin host.docker.internal.
  writeFileSync(
    "apps/worker/.env.docker",
    lines(["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "APP_URL", "ADMIN_NOTIFY_EMAILS"]).replaceAll("127.0.0.1", "host.docker.internal"),
  );
  console.log("Scris: apps/web/.env.local, apps/worker/.env, apps/worker/.env.docker");
} else {
  process.stdout.write(lines(Object.keys(env)));
}
