// End-to-end test for Codex Web. Run with:
//
//   cd web
//   npm install --no-save @playwright/test
//   npx playwright install chromium
//   BASE_URL=http://localhost:5000 npx playwright test tests/e2e.spec.mjs
//
// This test exercises the canonical app-server-protocol JSON-RPC flow as a
// browser would: it signs in (API key in mock mode, ChatGPT in any mode),
// starts a thread, sends a turn that triggers an approval-required tool
// call, and verifies the streamed agent message arrives.

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";

test.describe("Codex Web — JSON-RPC end-to-end", () => {
  test("sign in with ChatGPT, approve a command, see streamed reply", async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for the status bar to populate from /api/whoami.
    await expect(page.locator("#backend-pill")).toContainText(/backend:/, { timeout: 10_000 });

    // Open the login modal and start the ChatGPT (device-code) flow.
    await page.click("#account-btn");
    await page.click("#chatgpt");
    // The mock backend resolves the device code in ~2s; wait for the
    // signed-in state propagated via the `account/updated` notification.
    await expect(page.locator("#account-status")).toContainText(/ChatGPT/, { timeout: 10_000 });

    // Send a prompt that triggers both an exec approval and a patch approval.
    const composer = page.locator("#input");
    await composer.fill("please run a command and apply a patch to demonstrate the approval flow");
    await composer.press("Enter");

    // First approval: exec
    const exec = page.locator(".approval-card").filter({ hasText: "Run command?" }).first();
    await expect(exec).toBeVisible({ timeout: 10_000 });
    await exec.locator("button[data-decision='approve']").click();

    // Second approval: apply_patch
    const patch = page.locator(".approval-card").filter({ hasText: "Apply patch?" }).first();
    await expect(patch).toBeVisible({ timeout: 10_000 });
    await patch.locator("button[data-decision='approve']").click();

    // Streaming agent message arrives (mock echoes the prompt).
    await expect(page.locator(".cell.assistant .bubble").last())
      .toContainText(/Mock backend echo/i, { timeout: 15_000 });

    // Status pills reflect a successful turn.
    await expect(page.locator(".cell.system").last()).toContainText(/Turn complete/i, { timeout: 10_000 });
  });

  test("MCP server panel lists configured servers", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator("#backend-pill")).toContainText(/backend:/, { timeout: 10_000 });

    // Use the slash command surface to open the MCP panel — exercises the
    // canonical `mcpServerStatus/list` JSON-RPC method.
    const composer = page.locator("#input");
    await composer.fill("/mcp");
    await composer.press("Enter");

    await expect(page.locator(".modal h2")).toContainText("MCP servers", { timeout: 5_000 });
    await expect(page.locator("#mcp-list")).toContainText("demo-fs", { timeout: 5_000 });
  });
});
