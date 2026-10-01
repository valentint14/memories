// Server Stripe fals pentru e2e (003, research R9 — abatere justificată în raportul de
// implementare): stripe-mock e fără stare și întoarce mereu același id de sesiune, iar plățile
// cer id-uri unice și sesiuni care se pot „plăti”. Implementează doar ce folosește aplicația:
//   POST /v1/checkout/sessions, GET /v1/checkout/sessions/:id, POST /v1/checkout/sessions/:id/expire
// plus rute de control pentru teste:
//   POST /__test/sessions/:id/pay   → sesiunea devine plătită (payment_status = "paid")
//   GET  /__test/sessions?payment_id=…  → sesiunea creată pentru o plată
//   GET  /health
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.STRIPE_FAKE_PORT ?? 12111);
const sessions = new Map();
const byIdempotencyKey = new Map();

/** `a[b][0][c]=x` (form-urlencoded, ca stripe-node) → obiect imbricat. */
function parseForm(body) {
  const root = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const path = key.replace(/\]/g, "").split("[");
    let node = root;
    path.forEach((part, index) => {
      if (index === path.length - 1) node[part] = value;
      else node = node[part] ??= {};
    });
  }
  return root;
}

function send(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function notFound(res, id) {
  send(res, 404, { error: { type: "invalid_request_error", code: "resource_missing", message: `No such checkout.session: '${id}'` } });
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/health") return send(res, 200, { ok: true });

    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      const key = req.headers["idempotency-key"];
      if (typeof key === "string" && byIdempotencyKey.has(key)) return send(res, 200, sessions.get(byIdempotencyKey.get(key)));
      const params = parseForm(body);
      const id = `cs_test_${randomBytes(12).toString("hex")}`;
      const item = params.line_items?.["0"] ?? {};
      const session = {
        id,
        object: "checkout.session",
        mode: params.mode,
        status: "open",
        payment_status: "unpaid",
        url: `https://checkout.stripe.com/c/pay/${id}`,
        amount_total: Number(item.price_data?.unit_amount ?? 0),
        currency: item.price_data?.currency ?? "ron",
        customer_email: params.customer_email ?? null,
        expires_at: Number(params.expires_at ?? 0),
        metadata: params.metadata ?? {},
        payment_intent: null,
        customer_details: null,
        success_url: params.success_url,
        cancel_url: params.cancel_url,
      };
      sessions.set(id, session);
      if (typeof key === "string") byIdempotencyKey.set(key, id);
      return send(res, 200, session);
    }

    if (parts[0] === "v1" && parts[1] === "checkout" && parts[2] === "sessions" && parts[3]) {
      const session = sessions.get(parts[3]);
      if (!session) return notFound(res, parts[3]);
      if (req.method === "GET" && parts.length === 4) return send(res, 200, session);
      if (req.method === "POST" && parts[4] === "expire") {
        if (session.status !== "open") {
          return send(res, 400, { error: { type: "invalid_request_error", message: "Only Checkout Sessions with a status in [\"open\"] can be expired." } });
        }
        session.status = "expired";
        session.url = null;
        return send(res, 200, session);
      }
    }

    if (parts[0] === "__test" && parts[1] === "sessions") {
      if (req.method === "GET" && parts.length === 2) {
        const match = [...sessions.values()].filter((s) => s.metadata?.payment_id === url.searchParams.get("payment_id"));
        return send(res, 200, { data: match });
      }
      const session = sessions.get(parts[2] ?? "");
      if (!session) return notFound(res, parts[2]);
      if (req.method === "POST" && parts[3] === "pay") {
        Object.assign(session, {
          status: "complete",
          payment_status: "paid",
          payment_intent: `pi_test_${randomBytes(10).toString("hex")}`,
          customer_details: {
            email: session.customer_email,
            name: "Ana Pop",
            address: { line1: "Str. Florilor 1", line2: null, city: "Cluj-Napoca", postal_code: "400000", state: "CJ", country: "RO" },
            business_name: null,
            tax_ids: [],
          },
        });
        return send(res, 200, session);
      }
    }

    send(res, 404, { error: { type: "invalid_request_error", message: `Unrecognized request URL (${req.method}: ${url.pathname})` } });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`stripe-fake pe http://127.0.0.1:${port}`);
});
