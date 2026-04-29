#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const flowsDir = ".maestro";
if (!existsSync(flowsDir)) {
  console.error("missing .maestro flow directory");
  process.exit(1);
}

const flows = readdirSync(flowsDir).filter((file) => file.endsWith(".yml")).sort();
if (flows.length === 0) {
  console.error("no Maestro flows found");
  process.exit(1);
}

const maestroInstalled = spawnSync("sh", ["-lc", "command -v maestro >/dev/null 2>&1"]).status === 0;
console.log(`Maestro flows: ${flows.map((file) => `${flowsDir}/${file}`).join(", ")}`);

if (!maestroInstalled) {
  console.log("Maestro CLI not installed; skipping device E2E run.");
  process.exit(0);
}

if (!process.env.MAESTRO_APP_ID) {
  console.log("MAESTRO_APP_ID is not set; skipping device E2E run.");
  process.exit(0);
}

if (process.env.RUN_MAESTRO_E2E !== "1") {
  console.log("RUN_MAESTRO_E2E is not 1; flows are present but not executed.");
  process.exit(0);
}

const result = spawnSync("maestro", ["test", ...flows.map((flow) => `${flowsDir}/${flow}`)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
