import { describe, expect, it } from "vitest";
import { sessionCookieOptions } from "../../lib/supabase/cookie-options";

describe("sessionCookieOptions", () => {
  const base = { path: "/", sameSite: "lax", httpOnly: false, maxAge: 34_560_000 } as const;

  it("adaugă Secure când aplicația e pe HTTPS", () => {
    expect(sessionCookieOptions(base, "https://memories.example.ro")).toEqual({ ...base, secure: true });
  });

  it("lasă opțiunile neschimbate pe HTTP (local, CI), unde un cookie Secure n-ar mai fi trimis", () => {
    expect(sessionCookieOptions(base, "http://localhost:3000")).toEqual(base);
    expect(sessionCookieOptions(base, undefined)).toEqual(base);
  });

  it("nu schimbă httpOnly: galeria în timp real citește sesiunea din cookie", () => {
    expect(sessionCookieOptions(base, "https://memories.example.ro").httpOnly).toBe(false);
  });
});
