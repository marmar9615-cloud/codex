import { test, expect } from "@playwright/test";
import { AUTH_ENABLED, gotoReady } from "./helpers.mjs";

test.describe("Codex Web — live auth UI", () => {
  test("starts ChatGPT device-code auth and shows the code in the web modal", async ({ page }) => {
    test.skip(!AUTH_ENABLED, "set PLAYWRIGHT_AUTH=1 to run auth UI smoke");

    await gotoReady(page);
    await page.locator("#account-btn").click();
    await page.locator("#chatgpt").click();

    const oauthStatus = page.locator("#oauth-status");
    await expect(oauthStatus).toContainText(/Open https:\/\/auth\.openai\.com\/codex\/device/, { timeout: 20_000 });
    await expect(oauthStatus.locator("code")).not.toHaveText("");
  });
});
