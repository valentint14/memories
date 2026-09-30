import { afterAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, randomEmail, serviceClient, sql } from "../support/clients.ts";

// Linkul invitatului lizibil (FR-004): slug din nume + sufix aleator de 6 caractere.
afterAll(closePool);

async function slug(name: string | null): Promise<string> {
  const [r] = await sql<{ s: string }>("select public.event_slug($1) as s", [name]);
  return r?.s ?? "";
}

describe("event_slug", () => {
  it.each([
    ["Nunta Ana & Mihai", "nunta-ana-mihai"],
    ["Botezul lui Ștefan și al Țiței", "botezul-lui-stefan-si-al-titei"],
    ["  Majorat — Andrei!!! ", "majorat-andrei"],
    ["Aniversare 30 de ani", "aniversare-30-de-ani"],
    ["!!!", "eveniment"],
  ])("%s → %s", async (name, expected) => {
    expect(await slug(name)).toBe(expected);
  });

  it("taie numele lungi la cuvânt, la cel mult 40 de caractere", async () => {
    const s = await slug("Aniversare 30 de ani Ioana și prietenii ei din liceu de la Brașov");
    expect(s).toBe("aniversare-30-de-ani-ioana-si-prietenii");
    expect(s.length).toBeLessThanOrEqual(40);
  });
});

describe("tokenul unui eveniment nou", () => {
  const SUFFIX = "[23456789abcdefghjkmnpqrstuvwxyz]{6}";

  it("e slug-ul numelui plus un sufix aleator; două evenimente cu același nume au linkuri diferite", async () => {
    const email = randomEmail("token");
    const a = await createTestEvent({ organizerEmail: email, name: "Nunta Ana & Mihai" });
    const b = await createTestEvent({ organizerEmail: email, name: "Nunta Ana & Mihai" });
    expect(a.public_token).toMatch(new RegExp(`^nunta-ana-mihai-${SUFFIX}$`));
    expect(b.public_token).toMatch(new RegExp(`^nunta-ana-mihai-${SUFFIX}$`));
    expect(a.public_token).not.toBe(b.public_token);
  });

  it("deschide pagina invitatului", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("token"), name: "Botezul lui Luca" });
    const { data, error } = await serviceClient().rpc("resolve_event_for_guest", { p_token: event.public_token });
    expect(error).toBeNull();
    expect(data?.[0]?.event_id).toBe(event.id);
  });
});
