import { describe, expect, it } from "vitest";
import { buildCsp, TURNSTILE_ORIGIN } from "../../lib/security/csp";

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split("; ").map((part) => {
      const [name = "", ...rest] = part.split(" ");
      return [name, rest.join(" ")];
    }),
  );
}

describe("CSP", () => {
  const csp = directives(buildCsp({ nonce: "abc", supabaseUrl: "https://x.supabase.co", isDev: false }));

  it("permite scriptul și iframe-ul Turnstile (research R3)", () => {
    expect(csp.get("script-src")).toContain(TURNSTILE_ORIGIN);
    expect(csp.get("script-src")).toContain("'nonce-abc'");
    expect(csp.get("frame-src")).toBe(TURNSTILE_ORIGIN);
  });

  it("păstrează restricțiile din 001", () => {
    expect(csp.get("default-src")).toBe("'self'");
    expect(csp.get("frame-ancestors")).toBe("'none'");
    expect(csp.get("object-src")).toBe("'none'");
    expect(csp.get("script-src")).not.toContain("unsafe-eval");
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
  });
});
