// Local: variabilele scrise de `node scripts/ci-env.mjs --write`; în CI și în Docker vin din mediu.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
