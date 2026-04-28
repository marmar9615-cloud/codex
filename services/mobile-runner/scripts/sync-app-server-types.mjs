import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const codexBin = process.env.CODEX_APP_SERVER_BIN;
if (!codexBin) {
  console.error("CODEX_APP_SERVER_BIN must point to the Codex CLI binary.");
  process.exit(1);
}

const outDir = resolve("src/generated/app-server");
mkdirSync(outDir, { recursive: true });

const result = spawnSync(codexBin, ["app-server", "generate-ts", "--out", outDir], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
