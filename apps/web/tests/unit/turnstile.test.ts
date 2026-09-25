import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_TEST_TOKEN, TURNSTILE_VERIFY_URL, verifyTurnstile } from "../../lib/security/turnstile";

vi.mock("server-only", () => ({}));

// Verificarea anti-bot pe server (002: FR-037; research R3).
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubFetch(response: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(response) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("verifyTurnstile", () => {
  it("trimite secretul, tokenul și IP-ul la siteverify și acceptă succesul", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-x");
    const fetchMock = stubFetch({ success: true });
    expect(await verifyTurnstile("tok", "203.0.113.5")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({ secret: "secret-x", response: "tok", remoteip: "203.0.113.5" });
  });

  it("refuză răspunsul `success: false`", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-x");
    stubFetch({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyTurnstile("tok", null)).toBe(false);
  });

  it("refuză la eroare de rețea sau răspuns HTTP invalid", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-x");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await verifyTurnstile("tok", null)).toBe(false);
    stubFetch({}, false);
    expect(await verifyTurnstile("tok", null)).toBe(false);
  });

  it("în modul offline (doar cu secretele de test) emulează răspunsul, fără rețea", async () => {
    const fetchMock = stubFetch({ success: true });
    vi.stubEnv("TURNSTILE_OFFLINE", "1");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    expect(await verifyTurnstile(TURNSTILE_TEST_TOKEN, null)).toBe(true);
    expect(await verifyTurnstile("alt-token", null)).toBe(false);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "2x0000000000000000000000000000000AA");
    expect(await verifyTurnstile(TURNSTILE_TEST_TOKEN, null)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-de-productie");
    await expect(verifyTurnstile(TURNSTILE_TEST_TOKEN, null)).rejects.toThrow("TURNSTILE_OFFLINE");
  });

  it("refuză tokenul lipsă fără să apeleze serviciul", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-x");
    const fetchMock = stubFetch({ success: true });
    expect(await verifyTurnstile("", null)).toBe(false);
    expect(await verifyTurnstile(null, null)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
