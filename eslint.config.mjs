// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "packages/shared/src/db.types.ts",
      "apps/web/next-env.d.ts",
      "supabase/**/*.sql",
      // Rulează în runtime-ul k6 (globale __ENV/__VU, module k6/*), nu în Node.
      "tests/load/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Constituția, principiul III: cheia service role nu ajunge niciodată în client.
    files: ["apps/web/components/**/*.tsx", "apps/web/lib/upload/**", "apps/web/lib/realtime/**", "apps/web/lib/gallery/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/lib/supabase/admin", "@/lib/supabase/admin"], message: "Clientul service role este doar pentru server." },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.mjs", "**/*.config.{js,ts,mjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
);
