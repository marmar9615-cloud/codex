#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const commands = [
  ["pnpm", ["--filter", "@codex/mobile-protocol", "build"]],
  ["pnpm", ["--filter", "@codex/mobile-protocol", "test"]],
  ["pnpm", ["--filter", "@codex/mobile-runner", "build"]],
  ["pnpm", ["--filter", "@codex/mobile-runner", "test"]],
  ["pnpm", ["--filter", "@codex/mobile", "test"]],
  ["pnpm", ["--filter", "@codex/mobile", "typecheck"]],
  ["pnpm", ["--filter", "@codex/mobile", "exec", "expo", "config", "--type", "public", "--json"]],
  ["node", ["-e", "JSON.parse(require('fs').readFileSync('apps/mobile/eas.json','utf8')); console.log('eas.json valid')"]],
  ["node", ["scripts/mobile-docs-sanity.mjs"]],
  ["git", ["diff", "--check"]],
];

for (const [command, args] of commands) {
  const label = `${command} ${args.join(" ")}`;
  console.log(`\n$ ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`mobile verification failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nmobile verification passed");
