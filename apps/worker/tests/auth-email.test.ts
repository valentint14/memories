import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { config } from "../src/config.ts";
import { query } from "../src/db.ts";
import { resetTransport } from "../src/email/transport.ts";
import { authEmail } from "../src/jobs/auth-email.ts";
import { authRotate } from "../src/jobs/auth-rotate.ts";
import { supabase } from "../src/storage/client.ts";
import { createUser, ctx, randomEmail } from "./support.ts";

// Emailul cu cod și link (002: FR-006, FR-011, FR-013, SC-014; contracts/worker-jobs.md › auth_email).
const MAILPIT = process.env.MAILPIT_URL ?? `http://${process.env.SMTP_HOST ?? "127.0.0.1"}:54324`;

interface Mail {
  ID: string;
  Subject: string;
  Created: string;
}

async function mailsTo(address: string): Promise<Mail[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: Mail[] }).messages;
}

async function mailBody(id: string): Promise<{ Text: string; HTML: string }> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return (await res.json()) as { Text: string; HTML: string };
}

async function createRequest(email: string, name: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    "select public.request_self_service_event($1, $2, current_date + 10, '2026-10-01', '2026-10-01') as id",
    [email, name],
  );
  return row?.id ?? "";
}

async function loginRequest(email: string): Promise<string> {
  const [row] = await query<{ id: string }>("select public.request_login($1) as id", [email]);
  return row?.id ?? "";
}

function verifier() {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authUser(email: string) {
  const [row] = await query<{ id: string; email_confirmed_at: Date | null }>(
    "select id, email_confirmed_at from auth.users where email = $1",
    [email],
  );
  return row;
}

afterEach(() => {
  resetTransport();
});

describe("auth_email — creare (FR-006, FR-013)", () => {
  it("creează utilizatorul neconfirmat și trimite codul și linkul, cu numele escapat", async () => {
    const email = randomEmail("ae-new");
    const requestId = await createRequest(email, "Nunta <script>alert(1)</script>");
    const started = Date.now();

    await authEmail.run({ type: "auth_email", request_id: requestId, email, purpose: "create" }, ctx);

    const user = await authUser(email);
    expect(user?.email_confirmed_at).toBeNull();

    const [mail] = await mailsTo(email);
    expect(mail).toBeDefined();
    // SC-014: emailul ajunge în cel mult 30 s de la punerea jobului în coadă.
    expect(Date.parse(mail?.Created ?? "") - started).toBeLessThan(30_000);
    const code = /\b(\d{6})\b/.exec(mail?.Subject ?? "")?.[1];
    expect(code).toMatch(/^\d{6}$/);

    const body = await mailBody(mail?.ID ?? "");
    expect(body.Text).toContain(code);
    expect(body.Text).toContain(`${config.appUrl}/auth/confirm?request=${requestId}&token_hash=`);
    expect(body.HTML).not.toContain("<script>");
    expect(body.HTML).toContain("&#60;script&#62;");

    const verified = await verifier().auth.verifyOtp({ email, token: code ?? "", type: "email" });
    expect(verified.error).toBeNull();
  });

  it("pentru o adresă existentă nu creează alt utilizator", async () => {
    const email = randomEmail("ae-existing");
    const userId = await createUser(email);
    const requestId = await createRequest(email, "Botez");
    await authEmail.run({ type: "auth_email", request_id: requestId, email, purpose: "create" }, ctx);
    expect((await authUser(email))?.id).toBe(userId);
    expect(await mailsTo(email)).toHaveLength(1);
  });

  it("nu trimite nimic pentru o cerere invalidată sau folosită", async () => {
    const email = randomEmail("ae-stale");
    const first = await createRequest(email, "Primul");
    await createRequest(email, "Al doilea");
    await authEmail.run({ type: "auth_email", request_id: first, email, purpose: "create" }, ctx);
    expect(await mailsTo(email)).toHaveLength(0);
  });
});

describe("auth_email — autentificare (FR-010, FR-011)", () => {
  it("pentru o adresă fără cont nu creează utilizator și nu trimite email", async () => {
    const email = randomEmail("ae-missing");
    const requestId = await loginRequest(email);
    await authEmail.run({ type: "auth_email", request_id: requestId, email, purpose: "login" }, ctx);
    expect(await authUser(email)).toBeUndefined();
    expect(await mailsTo(email)).toHaveLength(0);
  });

  it("pentru o adresă existentă trimite emailul de autentificare", async () => {
    const email = randomEmail("ae-login");
    await createUser(email);
    const requestId = await loginRequest(email);
    await authEmail.run({ type: "auth_email", request_id: requestId, email, purpose: "login" }, ctx);
    const [mail] = await mailsTo(email);
    expect(mail?.Subject).toMatch(/^Codul tău de autentificare Memories: \d{6}$/);
  });
});

describe("auth_rotate (FR-008)", () => {
  it("invalidează codul emis anterior, fără email nou", async () => {
    const email = randomEmail("ae-rotate");
    const requestId = await createRequest(email, "Cununie");
    await authEmail.run({ type: "auth_email", request_id: requestId, email, purpose: "create" }, ctx);
    const [mail] = await mailsTo(email);
    const code = /\b(\d{6})\b/.exec(mail?.Subject ?? "")?.[1] ?? "";

    await authRotate.run({ type: "auth_rotate", email, request_id: requestId }, ctx);

    expect(await mailsTo(email)).toHaveLength(1);
    const verified = await verifier().auth.verifyOtp({ email, token: code, type: "email" });
    expect(verified.error).not.toBeNull();
  });

  it("nu invalidează codul unei cereri mai noi", async () => {
    const email = randomEmail("ae-rotate-newer");
    const old = await createRequest(email, "Veche");
    const fresh = await createRequest(email, "Nouă");
    await authEmail.run({ type: "auth_email", request_id: fresh, email, purpose: "create" }, ctx);
    const [mail] = await mailsTo(email);
    const code = /\b(\d{6})\b/.exec(mail?.Subject ?? "")?.[1] ?? "";

    await authRotate.run({ type: "auth_rotate", email, request_id: old }, ctx);

    const verified = await verifier().auth.verifyOtp({ email, token: code, type: "email" });
    expect(verified.error).toBeNull();
  });

  it("nu face nimic pentru o adresă fără cont", async () => {
    const email = randomEmail("ae-rotate-missing");
    await authRotate.run({ type: "auth_rotate", email, request_id: "00000000-0000-4000-8000-000000000000" }, ctx);
    const { data } = await supabase().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((u) => u.email === email)).toBe(false);
  });
});
