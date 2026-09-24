// Test de încărcare SC-006: 200 de invitați pe același eveniment, de pe aceeași adresă IP
// (Wi-Fi-ul sălii), fiecare cu 5 rezervări + upload TUS de 3 MB. Rulat pe mediul preview:
//
//   k6 run -e APP_URL=https://preview... -e SUPABASE_URL=... -e SERVICE_KEY=... -e TOKEN=<token eveniment> \
//     tests/load/guest-upload.k6.js
//
// Server Actions din Next.js nu au un endpoint public stabil (id-uri generate la build), așa că
// scriptul încarcă pagina invitatului prin aplicație și exercită exact backend-ul folosit de
// acțiuni: funcțiile SQL `start_guest_session` / `reserve_upload` (prin PostgREST, cu cheia
// service role a mediului preview) și uploadul TUS semnat direct în Storage.
import encoding from "k6/encoding";
import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

const APP_URL = __ENV.APP_URL;
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SERVICE_KEY = __ENV.SERVICE_KEY;
const TOKEN = __ENV.TOKEN;
const GUESTS = Number(__ENV.GUESTS ?? 200);
const FILES = Number(__ENV.FILES ?? 5);
const SIZE = Number(__ENV.SIZE ?? 3 * 1024 * 1024);

const reserveDuration = new Trend("reserve_upload_duration", true);

export const options = {
  scenarios: {
    guests: { executor: "per-vu-iterations", vus: GUESTS, iterations: 1, maxDuration: "10m" },
  },
  thresholds: {
    http_req_failed: ["rate==0"],
    reserve_upload_duration: ["p(95)<1000"],
    "http_req_duration{name:guest_page}": ["p(95)<2500"],
  },
};

const payload = new Uint8Array(SIZE);
payload.set([0xff, 0xd8, 0xff, 0xe0]);

function rpc(name, body) {
  return http.post(`${SUPABASE_URL}/rest/v1/rpc/${name}`, JSON.stringify(body), {
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    tags: { name },
  });
}

export default function () {
  const page = http.get(`${APP_URL}/e/${TOKEN}`, { tags: { name: "guest_page" } });
  check(page, { "pagina invitatului 200": (r) => r.status === 200 });

  // Același IP pentru toți invitații (hash constant), ca la o nuntă pe Wi-Fi-ul sălii.
  const session = rpc("start_guest_session", { p_token: TOKEN, p_ip_hash: "load-test-same-ip", p_display_name: `Invitat ${__VU}` });
  check(session, { "sesiune creată": (r) => r.status === 200 });
  const sessionId = session.json();

  for (let i = 0; i < FILES; i++) {
    const started = Date.now();
    const reserved = rpc("reserve_upload", {
      p_session_id: sessionId,
      p_token: TOKEN,
      p_filename: `poza-${__VU}-${i}.jpg`,
      p_mime: "image/jpeg",
      p_bytes: SIZE,
    });
    reserveDuration.add(Date.now() - started);
    if (!check(reserved, { "rezervare reușită": (r) => r.status === 200 })) continue;
    const { path } = reserved.json()[0];

    const signed = http.post(`${SUPABASE_URL}/storage/v1/object/upload/sign/incoming/${path}`, null, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      tags: { name: "sign_upload" },
    });
    // k6 nu are URLSearchParams: tokenul se extrage direct din URL-ul semnat.
    const signedToken = (/[?&]token=([^&]+)/.exec(signed.json().url) ?? [])[1];

    const metadata = [
      ["bucketName", "incoming"],
      ["objectName", path],
      ["contentType", "image/jpeg"],
      ["cacheControl", "3600"],
    ]
      .map(([k, v]) => `${k} ${encoding.b64encode(v)}`)
      .join(",");
    const created = http.post(`${SUPABASE_URL}/storage/v1/upload/resumable/sign`, payload.buffer, {
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(SIZE),
        "Upload-Metadata": metadata,
        "Content-Type": "application/offset+octet-stream",
        "x-signature": signedToken,
      },
      tags: { name: "tus_upload" },
    });
    check(created, { "upload TUS finalizat": (r) => r.status === 201 || r.status === 200 });
  }
}
