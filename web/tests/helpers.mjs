import { expect } from "@playwright/test";

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
export const AUTH_ENABLED = process.env.PLAYWRIGHT_AUTH === "1";

export async function gotoReady(page) {
  await page.goto(BASE_URL);
  await expect(page.locator("#backend-pill")).toContainText("backend: real", { timeout: 15_000 });
  await expect(page.locator("#model-pill")).not.toContainText("model: …", { timeout: 15_000 });
}

export async function sendPrompt(page, text) {
  await page.locator("#input").fill(text);
  await page.locator("#input").press("Enter");
}
