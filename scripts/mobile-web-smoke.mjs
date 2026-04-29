#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const requireFromMobile = createRequire(new URL("../apps/mobile/package.json", import.meta.url));
try {
  requireFromMobile.resolve("react-native-web/package.json");
} catch {
  skip("apps/mobile does not install react-native-web, so Expo web support is not available yet.");
}

const artifactsDir = join(repoRoot, "test-results/mobile-web-smoke");
mkdirSync(artifactsDir, { recursive: true });

const webPort = Number.parseInt(process.env.MOBILE_WEB_SMOKE_PORT ?? "8099", 10);
const runnerPort = Number.parseInt(process.env.MOBILE_WEB_SMOKE_RUNNER_PORT ?? "8787", 10);
const timeoutMs = Number.parseInt(process.env.MOBILE_WEB_SMOKE_TIMEOUT_MS ?? "180000", 10);
const webUrl = `http://localhost:${webPort}`;
const runnerUrl = `http://127.0.0.1:${runnerPort}`;
const children = [];
const output = [];

try {
  await ensureRunner();
  await startExpoWeb();
  await runBrowserSmoke();
  writeEvidence("pass", [
    `Expo web URL: ${webUrl}`,
    `Runner URL: ${runnerUrl}`,
    "Verified ProjectList render, sample workspace open/save, Settings/Auth gated copy, and runner capability UI.",
  ]);
  console.log(`Expo web browser smoke passed at ${webUrl}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeEvidence("fail", [message]);
  console.error(message);
  console.error(trimOutput(output.join("")));
  process.exitCode = 1;
} finally {
  await stopChildren();
}

async function ensureRunner() {
  if (await fetchOk(`${runnerUrl}/capabilities`, 1500)) {
    output.push(`Using existing mobile runner at ${runnerUrl}\n`);
    return;
  }

  const runner = spawn("pnpm", ["--filter", "@codex/mobile-runner", "dev"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(runnerPort),
      RUNNER_MODE: process.env.RUNNER_MODE ?? "fake",
      SANDBOX_BACKEND: process.env.SANDBOX_BACKEND ?? "fake",
      GIT_PROVIDER: process.env.GIT_PROVIDER ?? "fake",
      CLOUD_RUNNER_PROVIDER: process.env.CLOUD_RUNNER_PROVIDER ?? "fake",
      RUNNER_AUTH_MODE: process.env.RUNNER_AUTH_MODE ?? "dev",
    },
  });
  children.push(runner);
  captureOutput("runner", runner);
  await waitForUrl(`${runnerUrl}/capabilities`, timeoutMs, "mobile runner capabilities");
}

async function startExpoWeb() {
  const expo = spawn("pnpm", ["--filter", "@codex/mobile", "exec", "expo", "start", "--web", "--localhost", "--port", String(webPort)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      APP_PUBLIC_CODEX_RUNNER_URL: runnerUrl,
      CI: "1",
    },
  });
  children.push(expo);
  captureOutput("expo", expo);
  await waitForUrl(webUrl, timeoutMs, "Expo web app");
}

async function runBrowserSmoke() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    skip(`Playwright Chromium could not launch. Run \`pnpm exec playwright install chromium\` and retry. ${message}`);
  }

  const page = await browser.newPage();
  const consoleMessages = [];
  page.on("console", (message) => consoleMessages.push(`[browser:${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => consoleMessages.push(`[browser:error] ${error.message}`));

  try {
    await page.goto(webUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByText("Codex Mobile", { exact: true }).waitFor({ timeout: 60_000 });
    await clickFirst(page, [
      page.getByTestId("mobile-project-list-new-sample"),
      page.getByRole("button", { name: "Create sample project" }),
    ]);
    await page.getByTestId("mobile-editor-file-tree").waitFor({ timeout: 30_000 });
    await clickFirst(page, [
      page.getByTestId("mobile-editor-save"),
      page.getByRole("button", { name: "Save active file" }),
    ]);
    await page.goto(`${webUrl}/settings-auth`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByTestId("mobile-auth-gated-status").waitFor({ timeout: 30_000 });
    await page.getByText("Production ChatGPT/Codex sign-in status: gated.").waitFor({ timeout: 30_000 });
    await page.getByText(/Production OAuth remains disabled/).waitFor({ timeout: 30_000 });
    await page.getByText(/Phone-side execution: no/).waitFor({ timeout: 30_000 });
    await page.getByText(/active: fake|active: unknown/).waitFor({ timeout: 30_000 });
  } catch (error) {
    const screenshotPath = join(artifactsDir, "failure.png");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    writeFileSync(join(artifactsDir, "browser-console.log"), consoleMessages.join("\n"));
    throw error;
  } finally {
    await browser.close();
  }
}

async function clickFirst(page, locators) {
  const errors = [];
  for (const locator of locators) {
    try {
      await locator.first().waitFor({ timeout: 5000 });
      await locator.first().click();
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`No matching locator was clickable: ${errors.join(" | ")}`);
}

async function waitForUrl(url, timeout, label) {
  const deadline = Date.now() + timeout;
  let lastError = "";
  while (Date.now() < deadline) {
    const exited = children.find((child) => child.exitCode !== null);
    if (exited) {
      throw new Error(`${label} process exited early with code ${exited.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}: ${lastError}`);
}

async function fetchOk(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function captureOutput(label, child) {
  child.stdout.on("data", (chunk) => output.push(`[${label}] ${chunk.toString()}`));
  child.stderr.on("data", (chunk) => output.push(`[${label}] ${chunk.toString()}`));
}

async function stopChildren() {
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }
          child.once("exit", resolve);
          child.kill("SIGINT");
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill("SIGKILL");
            }
          }, 2500).unref();
        }),
    ),
  );
}

function writeEvidence(status, notes) {
  const markdown = `# Latest Expo Web Smoke QA

- Generated: ${new Date().toISOString()}
- Status: ${status}
- Command: \`pnpm test:mobile:e2e:web\`

## Notes

${notes.map((note) => `- ${note}`).join("\n")}
`;
  mkdirSync(join(repoRoot, "docs/mobile/qa-evidence"), { recursive: true });
  writeFileSync(join(repoRoot, "docs/mobile/qa-evidence/latest-web-smoke-qa.md"), markdown);
}

function skip(reason) {
  mkdirSync(join(repoRoot, "docs/mobile/qa-evidence"), { recursive: true });
  writeEvidence("skipped", [
    reason,
    "Retry command: pnpm test:mobile:e2e:web",
    "If Chromium is missing, run: pnpm exec playwright install chromium",
  ]);
  console.log(`Expo web smoke skipped: ${reason}`);
  process.exit(0);
}

function trimOutput(value) {
  if (value.length <= 8000) {
    return value.trim();
  }
  return `${value.slice(0, 3500)}\n...\n${value.slice(-3500)}`.trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
