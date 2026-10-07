import { afterAll, describe, expect, it } from "vitest";
import { adminClient, closePool, sql } from "../support/clients.ts";
import { awaitingEvent, discountCode, insertPayment } from "../support/payments.ts";

// Codurile de reducere (005: FR-001–FR-015; data-model.md; contracts/database-functions.md).
afterAll(closePool);

async function insertCode(values: Record<string, unknown>) {
  const v = { code: "ABCDEFGH", kind: "personal", discount_type: "fixed", discount_value: 100, max_uses: 1, ...values };
  return sql(
    `insert into public.discount_codes (code, kind, discount_type, discount_value, max_uses, batch_id)
     values ($1, $2::public.discount_kind, $3::public.discount_type, $4::bigint, $5::int, gen_random_uuid())`,
    [v.code, v.kind, v.discount_type, v.discount_value, v.max_uses],
  );
}

async function amount(codeId: string, full: number): Promise<number> {
  const [row] = await sql<{ amount: string }>(
    "select public.discount_amount(c, $2::bigint) as amount from public.discount_codes c where c.id = $1",
    [codeId, full],
  );
  return Number(row?.amount);
}

describe("discount_codes: constrângeri (data-model.md)", () => {
  it("refuză valori în afara intervalelor, utilizări greșite pe fel și formatul greșit", async () => {
    const bad = [
      { code: "AB0DEFGH" }, // 0 nu e în alfabet
      { code: "ABCDEFG" }, // 7 caractere
      { discount_value: 0 },
      { discount_type: "percent", discount_value: 100 },
      { discount_type: "percent", discount_value: 0 },
      { kind: "personal", max_uses: 2 },
      { kind: "campaign", max_uses: 1 },
      { kind: "campaign", max_uses: 1001 },
    ];
    for (const values of bad) {
      await expect(insertCode({ ...values, code: values.code ?? `Q${crypto.randomUUID().replace(/[^2-9]/g, "").padEnd(7, "2").slice(0, 7)}` })).rejects.toThrow();
    }
  });

  it("o plată cu cod are prețul întreg, reducerea și suma de plată consistente, de cel puțin 3 lei", async () => {
    const { eventId } = await awaitingEvent("dc-pay-constraint");
    const { id: codeId } = await discountCode();
    const paymentId = await insertPayment({ eventId });
    const set = (full: number, discount: number, amountMinor: number) =>
      sql("update public.payments set discount_code_id = $2, full_amount_minor = $3, discount_minor = $4, amount_minor = $5 where id = $1", [
        paymentId,
        codeId,
        full,
        discount,
        amountMinor,
      ]);
    await expect(set(29_900, 5_000, 20_000)).rejects.toThrow(); // sumă inconsecventă
    await expect(set(29_900, 29_700, 200)).rejects.toThrow(); // sub 3 lei
    await expect(set(29_900, 5_000, 24_900)).resolves.toBeDefined();
  });
});

describe("discount_amount (research R4)", () => {
  it("sumă fixă, procent rotunjit la ban și limitarea la 3,00 lei", async () => {
    const fixed = await discountCode({ type: "fixed", value: 5_000 });
    expect(await amount(fixed.id, 29_900)).toBe(5_000);
    const percent = await discountCode({ type: "percent", value: 15 });
    expect(await amount(percent.id, 29_900)).toBe(4_485);
    expect(await amount(percent.id, 33_333)).toBe(5_000); // 4999,95 → 5000
    const huge = await discountCode({ type: "fixed", value: 100_000 });
    expect(await amount(huge.id, 29_900)).toBe(29_600);
    expect(await amount(huge.id, 250)).toBe(0);
  });
});

describe("discount_codes: RLS", () => {
  it("adminii văd codurile; organizatorii nu", async () => {
    const { code } = await discountCode();
    const { client } = await awaitingEvent("dc-rls");
    expect((await client.from("discount_codes").select("id").eq("code", code)).data).toEqual([]);
    const { client: admin } = await adminClient({ aal2: true });
    expect((await admin.from("discount_codes").select("id").eq("code", code)).data).toHaveLength(1);
  });
});

describe("generarea și administrarea (US1: FR-001–FR-005)", () => {
  const gen = (client: Awaited<ReturnType<typeof adminClient>>["client"], args: Record<string, unknown>) =>
    client.rpc("generate_discount_codes", {
      p_kind: "personal",
      p_discount_type: "fixed",
      p_discount_value: 5_000,
      p_count: 1,
      p_max_uses: 1,
      p_expires_at: null,
      p_note: null,
      ...args,
    } as never);

  it("codurile personale: distincte, același lot, formatate XXXX-XXXX", async () => {
    const { client } = await adminClient({ aal2: true });
    const { data, error } = await gen(client, { p_count: 5, p_note: "Târg" });
    expect(error).toBeNull();
    const codes = (data as { id: string; code: string }[]).map((r) => r.code);
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
    for (const c of codes) expect(c).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    const batches = await sql<{ n: number }>(
      "select count(distinct batch_id)::int as n from public.discount_codes where id = any($1::uuid[])",
      [(data as { id: string }[]).map((r) => r.id)],
    );
    expect(batches[0]?.n).toBe(1);
  });

  it("codul de campanie: unul singur, cu maximul ales", async () => {
    const { client } = await adminClient({ aal2: true });
    const { data } = await gen(client, { p_kind: "campaign", p_discount_type: "percent", p_discount_value: 15, p_max_uses: 30 });
    const id = (data as { id: string }[])[0]?.id;
    const [row] = await sql<{ max_uses: number; kind: string }>("select max_uses, kind::text from public.discount_codes where id = $1", [id]);
    expect(row).toEqual({ max_uses: 30, kind: "campaign" });
  });

  it("validările întorc VALIDATION; un organizator primește FORBIDDEN", async () => {
    const { client } = await adminClient({ aal2: true });
    const invalid = [
      { p_count: 0 },
      { p_count: 101 },
      { p_kind: "campaign", p_count: 2, p_max_uses: 10 },
      { p_kind: "campaign", p_max_uses: 1 },
      { p_kind: "campaign", p_max_uses: 1001 },
      { p_discount_type: "percent", p_discount_value: 100 },
      { p_discount_value: 0 },
      { p_expires_at: new Date(Date.now() - 60_000).toISOString() },
      { p_note: "x".repeat(201) },
    ];
    for (const args of invalid) expect((await gen(client, args)).error?.message, JSON.stringify(args)).toBe("VALIDATION");
    const { client: organizer } = await awaitingEvent("dc-forbidden");
    expect((await gen(organizer, {})).error?.message).toBe("FORBIDDEN");
  });

  it("dezactivarea e idempotentă, iar lista arată starea derivată și utilizările", async () => {
    const { client } = await adminClient({ aal2: true });
    const available = await discountCode();
    const disabled = await discountCode();
    const expired = await discountCode({ expiresAt: new Date(Date.now() - 1000) });
    const used = await discountCode();
    expect((await client.rpc("disable_discount_code", { p_id: disabled.id })).error).toBeNull();
    expect((await client.rpc("disable_discount_code", { p_id: disabled.id })).error).toBeNull();
    const { eventId } = await awaitingEvent("dc-list");
    const paymentId = await insertPayment({ eventId });
    await sql(
      `update public.payments set status = 'paid', paid_at = now(), stripe_payment_intent_id = 'pi_dc_' || id,
              discount_code_id = $2, full_amount_minor = 29900, discount_minor = 5000, amount_minor = 24900 where id = $1`,
      [paymentId, used.id],
    );

    const { data, error } = await client.rpc("admin_discount_codes");
    expect(error).toBeNull();
    const rows = data as unknown as { id: string; status: string; uses: number; redemptions: { event_id: string }[] }[];
    const by = (id: string) => rows.find((r) => r.id === id);
    expect(by(available.id)?.status).toBe("available");
    expect(by(disabled.id)?.status).toBe("disabled");
    expect(by(expired.id)?.status).toBe("expired");
    expect(by(used.id)).toMatchObject({ status: "exhausted", uses: 1 });
    expect(by(used.id)?.redemptions[0]?.event_id).toBe(eventId);

    const { client: organizer } = await awaitingEvent("dc-list-forbidden");
    expect((await organizer.rpc("admin_discount_codes")).error?.message).toBe("FORBIDDEN");
  });
});
