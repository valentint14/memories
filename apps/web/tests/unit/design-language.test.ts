import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAPER } from "../../lib/ui";

/**
 * Limbajul vizual „Foaie de contact” (docs/propunere-design.md), verificat mecanic: orice clasă,
 * culoare sau font din afara lui oprește CI-ul. Tailwind nu mai generează paleta implicită, deci o
 * clasă greșită n-ar da eroare de build, ci doar un element nestilizat — de aceea acest test.
 */

const WEB = fileURLToPath(new URL("../../", import.meta.url));
const ROOT = join(WEB, "../..");

function sourceFiles(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path, extensions);
    return extensions.some((ext) => name.endsWith(ext)) ? [path] : [];
  });
}

const UI_SOURCES = ["app", "components", "lib"].flatMap((dir) => sourceFiles(join(WEB, dir), [".ts", ".tsx"]));
const EMAIL_SOURCES = [
  ...sourceFiles(join(ROOT, "apps/worker/src/email"), [".ts"]),
  join(ROOT, "supabase/templates/magic_link.html"),
];
const CSS = readFileSync(join(WEB, "app/globals.css"), "utf8");

/** Tokenii de culoare, citiți din `@theme`. */
const TOKENS = Object.fromEntries(
  [...CSS.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1] ?? "", (m[2] ?? "").toLowerCase()]),
);
const TOKEN_HEXES = new Set(Object.values(TOKENS));

function violations(files: string[], pattern: RegExp, allowed: (match: string) => boolean = () => false): string[] {
  return files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(pattern)]
      .map((m) => m[0])
      .filter((match) => !allowed(match))
      .map((match) => `${relative(ROOT, file)}: ${match}`);
  });
}

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black|brand|muted";

describe("tokenii", () => {
  it("globals.css șterge paleta, razele, umbrele și fonturile implicite ale Tailwind", () => {
    for (const reset of ["--color-*: initial", "--radius-*: initial", "--shadow-*: initial", "--font-*: initial"]) {
      expect(CSS).toContain(reset);
    }
    expect(Object.keys(TOKENS).sort()).toEqual(
      ["accent", "danger", "field", "ink", "ink-muted", "paper", "paper-raised", "rule", "success"].sort(),
    );
    expect(TOKENS.paper).toBe(PAPER);
  });

  it("globals.css nu folosește alte culori decât tokenii", () => {
    const hexes = [...CSS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    expect(hexes.filter((h) => !TOKEN_HEXES.has(h))).toEqual([]);
  });

  /** Contrastul WCAG între două culori #rrggbb. */
  function contrast(a: string, b: string): number {
    const luminance = (hex: string) => {
      const [r, g, bl] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
    };
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
  }

  it.each([
    ["ink", "paper", 4.5],
    ["ink", "paper-raised", 4.5],
    ["ink-muted", "paper", 4.5],
    ["ink-muted", "paper-raised", 4.5],
    ["accent", "paper", 4.5],
    ["accent", "paper-raised", 4.5],
    ["danger", "paper-raised", 4.5],
    ["success", "paper-raised", 4.5],
    ["paper-raised", "ink", 4.5],
    ["paper-raised", "danger", 4.5],
    // Bordura câmpurilor: 3:1 pentru componentele interactive (WCAG 1.4.11).
    ["field", "paper-raised", 3],
  ] as const)("%s pe %s are contrast ≥ %f:1", (fg, bg, min) => {
    expect(contrast(TOKENS[fg] ?? "", TOKENS[bg] ?? "")).toBeGreaterThanOrEqual(min);
  });
});

describe("interfața web folosește doar limbajul vizual", () => {
  it("nicio culoare din paleta implicită Tailwind (violet, gri, pasteluri, alb, negru)", () => {
    const pattern = new RegExp(
      `\\b(?:bg|text|border(?:-[trblxy])?|outline|ring(?:-offset)?|fill|stroke|accent|decoration|divide|placeholder|caret|from|via|to|shadow)-(?:${PALETTE})\\b`,
      "g",
    );
    expect(violations(UI_SOURCES, pattern)).toEqual([]);
  });

  it("nicio culoare scrisă direct (hex, rgb, hsl) în afara tokenilor", () => {
    expect(violations(UI_SOURCES, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|\b(?:rgba?|hsla?|oklch)\(/g, (m) => TOKEN_HEXES.has(m.toLowerCase()))).toEqual(
      [],
    );
  });

  it("colțuri de 2 px: doar rounded-xs (plus rounded-full pentru puncte și butoane radio)", () => {
    const allowed = /^rounded(?:-[trblse]{1,2})?-(?:xs|full|none)$/;
    // Doar în contextul unei clase: urmat de spațiu sau de sfârșitul șirului, nu de `=` (variabile).
    expect(violations(UI_SOURCES, /\brounded(?:-[a-z0-9]+)*(?:-\[[^\]]*\])?(?=["'`\s])(?!\s*=)/g, (m) => allowed.test(m))).toEqual([]);
  });

  it("fără umbre, în afara dialogurilor", () => {
    expect(violations(UI_SOURCES, /\bshadow(?:-[a-z0-9]+)*(?:-\[[^\]]*\])?(?![\w-])/g, (m) => m === "shadow-dialog")).toEqual([]);
  });

  it("fără bold greu: Newsreader rămâne 400, Plex Sans cel mult 600", () => {
    expect(violations(UI_SOURCES, /\bfont-(?:thin|extralight|light|bold|extrabold|black)\b/g)).toEqual([]);
  });

  it("fără gradiente, sticlă mată sau blur", () => {
    expect(violations(UI_SOURCES, /\b(?:bg-(?:gradient|linear|radial|conic)|backdrop-|blur-|bg-clip-text)[\w-]*/g)).toEqual([]);
  });

  it("fără fonturi în afara celor trei familii", () => {
    // `font-src` e directiva CSP, nu o clasă.
    const allowed = /^font-(?:serif|sans|mono|normal|medium|semibold|src)$/;
    expect(violations(UI_SOURCES, /\bfontFamily\b|(?<![-\w])font-\[[^\]]*\]|(?<![-\w])font-[a-z]+(?=["'`\s])/g, (m) => allowed.test(m))).toEqual([]);
  });

  it("fără culori sau fonturi în atributele `style`", () => {
    expect(violations(UI_SOURCES, /style=\{\{[^}]*\b(?:color|background|font|border|boxShadow)[^}]*\}\}/g)).toEqual([]);
  });

  it("fără emoji în interfață și în texte", () => {
    expect(violations(UI_SOURCES, /\p{Extended_Pictographic}/gu)).toEqual([]);
  });
});

describe("emailurile folosesc aceiași tokeni", () => {
  it("nicio culoare din afara tokenilor", () => {
    expect(violations(EMAIL_SOURCES, /#[0-9a-fA-F]{6}\b/g, (m) => TOKEN_HEXES.has(m.toLowerCase()))).toEqual([]);
  });

  it("fără emoji", () => {
    expect(violations(EMAIL_SOURCES, /\p{Extended_Pictographic}/gu)).toEqual([]);
  });
});
