import { afterAll, describe, expect, it } from "vitest";
import { adminClient, closePool, serviceClient, sql } from "../support/clients.ts";
import { awaitingEvent, discountCode, insertPayment, optionId, prepareWithCode } from "../support/payments.ts";

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

describe("aplicarea și plata cu cod (US2: FR-006–FR-012)", () => {
  type Client = Awaited<ReturnType<typeof awaitingEvent>>["client"];

  /** `discount_quote` nu ridică erori pentru codurile refuzate (limita de încercări rămâne numărată): motivul vine în `error`. */
  async function quote(client: Client, eventId: string, code: string) {
    const result = await client.rpc("discount_quote", { p_event_id: eventId, p_code: code, p_ip_hash: `ip-${crypto.randomUUID()}` });
    const refused = result.data?.[0]?.error;
    return refused ? { data: null, error: { message: refused } } : { data: result.data, error: result.error };
  }

  /** Plata pregătită cu cod devine încasată, ca după webhook. */
  async function pay(paymentId: string) {
    const sessionId = `cs_test_${paymentId.replaceAll("-", "")}`;
    await serviceClient().rpc("attach_checkout_session", {
      p_payment_id: paymentId,
      p_session_id: sessionId,
      p_checkout_url: "https://checkout.stripe.com/c/pay/x",
    });
    return serviceClient().rpc("complete_payment", { p_session_id: sessionId, p_payment_intent_id: `pi_${sessionId.slice(-14)}`, p_billing: {} });
  }

  it("discount_quote: prețurile reduse per opțiune, codul normalizat și formatat", async () => {
    const { client, eventId } = await awaitingEvent("dq-ok");
    const { code } = await discountCode({ type: "fixed", value: 5_000 });
    const loose = `${code.slice(0, 4).toLowerCase()} ${code.slice(4).toLowerCase()}`;
    const { data, error } = await quote(client, eventId, loose);
    expect(error).toBeNull();
    const three = data?.find((o) => o.months === 3);
    expect(Number(three?.discount_minor)).toBe(5_000);
    expect(Number(three?.amount_minor)).toBe(Number(three?.full_amount_minor) - 5_000);
    expect(three?.code).toBe(`${code.slice(0, 4)}-${code.slice(4)}`);
  });

  it("refuză codurile inexistente, expirate, dezactivate și pe cele folosite", async () => {
    const { client, eventId } = await awaitingEvent("dq-refuse");
    const expired = await discountCode({ expiresAt: new Date(Date.now() - 1000) });
    const disabled = await discountCode({ disabled: true });
    expect((await quote(client, eventId, "ZZZZ-ZZZZ")).error?.message).toBe("DISCOUNT_INVALID");
    expect((await quote(client, eventId, expired.code)).error?.message).toBe("DISCOUNT_INVALID");
    expect((await quote(client, eventId, disabled.code)).error?.message).toBe("DISCOUNT_INVALID");

    // Cod personal: rezervat de plata altui organizator, apoi folosit.
    const used = await discountCode();
    const other = await awaitingEvent("dq-other");
    const prepared = await prepareWithCode(other.client, other.eventId, 3, used.code);
    expect(prepared.error).toBeNull();
    expect((await quote(client, eventId, used.code)).error?.message).toBe("DISCOUNT_RESERVED");
    await pay(prepared.data?.[0]?.payment_id ?? "");
    expect((await quote(client, eventId, used.code)).error?.message).toBe("DISCOUNT_UNAVAILABLE");
  });

  it("codul de campanie: o dată per organizator, până la maxim", async () => {
    const campaign = await discountCode({ kind: "campaign", type: "percent", value: 20, maxUses: 2 });
    const a = await awaitingEvent("dq-camp-a");
    const prepA = await prepareWithCode(a.client, a.eventId, 3, campaign.code);
    expect(prepA.error).toBeNull();
    await pay(prepA.data?.[0]?.payment_id ?? "");
    const second = await a.client.rpc("create_event_as_organizer", {
      p_name: "Al doilea",
      p_event_date: new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10),
    });
    expect((await quote(a.client, second.data ?? "", campaign.code)).error?.message).toBe("DISCOUNT_UNAVAILABLE");

    const b = await awaitingEvent("dq-camp-b");
    const prepB = await prepareWithCode(b.client, b.eventId, 3, campaign.code);
    expect(prepB.error).toBeNull();
    await pay(prepB.data?.[0]?.payment_id ?? "");
    const c = await awaitingEvent("dq-camp-c");
    expect((await quote(c.client, c.eventId, campaign.code)).error?.message).toBe("DISCOUNT_UNAVAILABLE");
  });

  it("prepare_payment îngheață prețul întreg, reducerea și suma; PRICE_CHANGED la suma întreagă", async () => {
    const { client, eventId } = await awaitingEvent("dp-freeze");
    const { code, id } = await discountCode({ type: "percent", value: 10 });
    const { data: q } = await quote(client, eventId, code);
    const three = q?.find((o) => o.months === 3);
    const wrong = await prepareWithCode(client, eventId, 3, code, Number(three?.full_amount_minor));
    expect(wrong.error?.message).toBe("PRICE_CHANGED");
    const { data, error } = await prepareWithCode(client, eventId, 3, code);
    expect(error).toBeNull();
    const [row] = await sql<{ discount_code_id: string; full_amount_minor: string; discount_minor: string; amount_minor: string }>(
      "select discount_code_id, full_amount_minor, discount_minor, amount_minor from public.payments where id = $1",
      [data?.[0]?.payment_id],
    );
    expect(row).toEqual({
      discount_code_id: id,
      full_amount_minor: String(three?.full_amount_minor),
      discount_minor: String(three?.discount_minor),
      amount_minor: String(three?.amount_minor),
    });
  });

  it("codul nu se aplică prelungirii; o plată expirată eliberează codul", async () => {
    const { client, eventId } = await awaitingEvent("dp-release");
    const { code } = await discountCode();
    const ext = await client.rpc("prepare_payment", {
      p_event_id: eventId,
      p_purpose: "retention_extension",
      p_option_id: await optionId(12),
      p_expected_amount_minor: 1,
      p_discount_code: code,
    });
    expect(ext.error?.message).toBe("PAYMENT_NOT_ALLOWED");

    const { data } = await prepareWithCode(client, eventId, 3, code);
    await sql("update public.payments set status = 'expired', checkout_url = null where id = $1", [data?.[0]?.payment_id]);
    const other = await awaitingEvent("dp-release-2");
    expect((await prepareWithCode(other.client, other.eventId, 3, code)).error).toBeNull();
  });

  it("prepare_payment refuză un cod neaplicat anterior pe eveniment (fără ocolirea limitei)", async () => {
    const { client, eventId } = await awaitingEvent("dp-not-applied");
    const { code } = await discountCode();
    const direct = await client.rpc("prepare_payment", {
      p_event_id: eventId,
      p_purpose: "activation",
      p_option_id: await optionId(3),
      p_expected_amount_minor: 1,
      p_discount_code: code,
    });
    expect(direct.error?.message).toBe("DISCOUNT_INVALID");
  });

  it("o nouă pregătire a aceluiași eveniment înlocuiește plata și nu se blochează singură", async () => {
    const { client, eventId } = await awaitingEvent("dp-replace");
    const { code } = await discountCode();
    expect((await prepareWithCode(client, eventId, 3, code)).error).toBeNull();
    expect((await prepareWithCode(client, eventId, 6, code)).error).toBeNull();
  });

  it("două pregătiri simultane cu același cod personal: una reușește, cealaltă e refuzată", async () => {
    const { code } = await discountCode();
    const [a, b] = await Promise.all([awaitingEvent("dp-race-a"), awaitingEvent("dp-race-b")]);
    const amount = Number((await quote(a.client, a.eventId, code)).data?.find((o) => o.months === 3)?.amount_minor);
    const results = await Promise.all([
      prepareWithCode(a.client, a.eventId, 3, code, amount),
      prepareWithCode(b.client, b.eventId, 3, code, amount),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error.message).toBe("DISCOUNT_RESERVED");
  });

  it("plata cu cod activează evenimentul cu prețul de bază neschimbat", async () => {
    const { client, eventId } = await awaitingEvent("dp-activate");
    const { code } = await discountCode({ value: 5_000 });
    const { data } = await prepareWithCode(client, eventId, 3, code);
    expect((await pay(data?.[0]?.payment_id ?? "")).data?.[0]?.outcome).toBe("activated");
    const [event] = await sql<{ status: string; base_price_minor: string }>("select status::text, base_price_minor from public.events where id = $1", [
      eventId,
    ]);
    const [pkg] = await sql<{ price_minor: string }>("select price_minor from public.packages where code = 'complete'");
    expect(event).toEqual({ status: "active", base_price_minor: pkg?.price_minor });
  });

  it("după 10 încercări per organizator, aplicarea e blocată temporar", async () => {
    const { client, eventId } = await awaitingEvent("dq-limit");
    for (let i = 0; i < 10; i++) expect((await quote(client, eventId, "ZZZZ-ZZZZ")).error?.message).toBe("DISCOUNT_INVALID");
    expect((await quote(client, eventId, "ZZZZ-ZZZZ")).error?.message).toBe("RATE_LIMITED");
  });
});
