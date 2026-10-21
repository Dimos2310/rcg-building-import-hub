import { defineConfig } from "@playwright/test";

// Runs against the deployed app by default; set E2E_BASE_URL to point at a local preview.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "https://rcg-building-import-hub.web.app",
    channel: "chrome",
    acceptDownloads: true,
  },
});
