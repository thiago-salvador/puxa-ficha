import { defineConfig } from "playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "box-sharing.spec.ts",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  outputDir: "../../output/box-sharing/playwright",
  reporter: [["list"], ["html", { outputFolder: "../../output/box-sharing/report", open: "never" }]],
  use: {
    baseURL: process.env.PF_BASE_URL ?? "http://127.0.0.1:3130",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
  ],
})
