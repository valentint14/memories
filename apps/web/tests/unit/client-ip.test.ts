import { afterEach, describe, expect, it, vi } from "vitest";
import { ipFromHeaders } from "../../lib/security/ip-hash";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers()) }));

afterEach(() => {
  vi.unstubAllEnvs();
});

// Limitarea per IP (FR-036) depinde de antetul în care proxy-ul din fața aplicației pune IP-ul real.
describe("ipFromHeaders", () => {
  it("implicit (Vercel) folosește prima valoare din x-forwarded-for, apoi x-real-ip", () => {
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(ipFromHeaders(new Headers({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(ipFromHeaders(new Headers())).toBeNull();
  });

  it("în spatele Cloudflare folosește doar antetul de încredere, nu x-forwarded-for trimis de client", () => {
    vi.stubEnv("TRUSTED_IP_HEADER", "cf-connecting-ip");
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 3.3.3.3", "cf-connecting-ip": "3.3.3.3" });
    expect(ipFromHeaders(h)).toBe("3.3.3.3");
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "6.6.6.6" }))).toBeNull();
  });
});
