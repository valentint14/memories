import { describe, expect, it } from "vitest";
import { buildLedger, groupOf, LEDGER_GROUPS, matchesQuery, parseView } from "../../lib/admin/ledger";

type Row = Parameters<typeof groupOf>[0] & Parameters<typeof matchesQuery>[0] & { id: string };

function row(id: string, over: Partial<Row> = {}): Row {
  return { id, status: "active", name: `Eveniment ${id}`, organizerEmail: `${id}@example.test`, anonymizedAt: null, ...over };
}

describe("groupOf", () => {
  it("fără cereri de activare (003: FR-015): neactivatele sunt toate „în așteptare”", () => {
    expect(LEDGER_GROUPS).not.toContain("requested");
    expect(groupOf({ status: "awaiting_activation" })).toBe("awaiting");
  });

  it("pune expiratele (și orice altă stare) la încheiate", () => {
    expect(groupOf({ status: "active" })).toBe("active");
    expect(groupOf({ status: "suspended" })).toBe("suspended");
    expect(groupOf({ status: "expiring" })).toBe("expiring");
    expect(groupOf({ status: "expired" })).toBe("ended");
  });
});

describe("matchesQuery", () => {
  it("caută în nume și email, fără diacritice și majuscule", () => {
    const e = row("a", { name: "Nunta Ștefan și Ioana", organizerEmail: "stefan@example.test" });
    expect(matchesQuery(e, "  nunta stefan ")).toBe(true);
    expect(matchesQuery(e, "STEFAN@")).toBe(true);
    expect(matchesQuery(e, "botez")).toBe(false);
  });

  it("nu găsește evenimentele anonimizate după date personale", () => {
    expect(matchesQuery(row("a", { anonymizedAt: "2026-01-01T00:00:00Z" }), "a@example")).toBe(false);
    expect(matchesQuery(row("a", { anonymizedAt: "2026-01-01T00:00:00Z" }), "")).toBe(true);
  });
});

describe("buildLedger", () => {
  const rows = [
    row("activ"),
    row("cerere", { status: "awaiting_activation" }),
    row("asteptare", { status: "awaiting_activation" }),
    row("expirat", { status: "expired" }),
  ];

  it("pe fila „Toate” arată doar grupele cu evenimente, în ordinea atenției", () => {
    const ledger = buildLedger(rows, { view: "all", query: "" });
    expect(ledger.total).toBe(4);
    expect(ledger.groups.map((g) => g.id)).toEqual(["awaiting", "active", "ended"]);
    expect(ledger.counts).toEqual({ awaiting: 2, active: 1, suspended: 0, expiring: 0, ended: 1 });
  });

  it("pe o filă anume arată grupa chiar dacă e goală", () => {
    expect(buildLedger(rows, { view: "suspended", query: "" }).groups).toEqual([{ id: "suspended", rows: [] }]);
    expect(buildLedger(rows, { view: "awaiting", query: "" }).groups[0]?.rows.map((r) => r.id)).toEqual(["cerere", "asteptare"]);
  });

  it("numărătoarea filelor ține cont de căutare", () => {
    const ledger = buildLedger(rows, { view: "all", query: "cerere" });
    expect(ledger.total).toBe(1);
    expect(ledger.counts.awaiting).toBe(1);
    expect(ledger.counts.active).toBe(0);
  });
});

describe("parseView", () => {
  it("acceptă doar grupele cunoscute", () => {
    expect(parseView("awaiting")).toBe("awaiting");
    expect(parseView("requested")).toBe("all");
    expect(parseView("oricare")).toBe("all");
    expect(parseView(undefined)).toBe("all");
  });
});
