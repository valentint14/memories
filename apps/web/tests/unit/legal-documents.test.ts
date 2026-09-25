import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Un text legal schimbat fără versiune nouă trebuie să pice în CI (002: FR-039, research R9).
const root = join(import.meta.dirname, "../../../..");
const contentDir = join(root, "apps/web/content/legal");
const migrationsDir = join(root, "supabase/migrations");

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex");
}

function registeredHashes(): Map<string, string> {
  const hashes = new Map<string, string>();
  const row = /\('(terms|privacy)', '(\d{4}-\d{2}-\d{2})', '[^']+', '([0-9a-f]{64})'\)/g;
  for (const file of readdirSync(migrationsDir)) {
    for (const match of readFileSync(join(migrationsDir, file), "utf8").matchAll(row)) {
      hashes.set(`${match[1] ?? ""}/${match[2] ?? ""}`, match[3] ?? "");
    }
  }
  return hashes;
}

describe("documentele legale", () => {
  const registered = registeredHashes();
  const files = (["terms", "privacy"] as const).flatMap((kind) =>
    readdirSync(join(contentDir, kind)).map((name) => ({ kind, version: name.replace(/\.md$/, ""), path: join(contentDir, kind, name) })),
  );

  it("fiecare versiune din repository e înregistrată într-o migrație", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) expect(registered.has(`${file.kind}/${file.version}`), `${file.kind}/${file.version}`).toBe(true);
  });

  it("conținutul corespunde hash-ului înregistrat", () => {
    for (const file of files) expect(sha256(file.path), `${file.kind}/${file.version}`).toBe(registered.get(`${file.kind}/${file.version}`));
  });
});
