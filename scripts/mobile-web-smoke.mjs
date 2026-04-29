#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const requireFromMobile = createRequire(new URL("../apps/mobile/package.json", import.meta.url));
try {
  requireFromMobile.resolve("react-native-web/package.json");
} catch {
  console.log("Expo web smoke skipped: apps/mobile does not install react-native-web, so Expo web support is not available yet.");
  process.exit(0);
}

const port = Number.parseInt(process.env.MOBILE_WEB_SMOKE_PORT ?? "8099", 10);
const url = `http://127.0.0.1:${port}`;
const child = spawn("pnpm", ["--filter", "@codex/mobile", "exec", "expo", "start", "--web", "--localhost", "--port", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, CI: "1" },
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  const html = await waitForHtml(url, 30_000);
  if (!html.includes("<html") && !html.includes("<!DOCTYPE html")) {
    throw new Error("Expo web response did not look like HTML.");
  }
  if (!html.includes("root")) {
    throw new Error("Expo web HTML did not include a root container.");
  }
  console.log(`Expo web smoke passed at ${url}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(output.trim());
  process.exitCode = 1;
} finally {
  child.kill("SIGINT");
  await new Promise((resolve) => child.once("exit", resolve));
}

async function waitForHtml(targetUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Expo web server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        return await response.text();
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for Expo web at ${targetUrl}: ${lastError}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
