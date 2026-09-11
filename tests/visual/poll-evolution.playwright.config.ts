import { defineConfig, devices } from "playwright/test"
import path from "node:path"

export default defineConfig({
  testDir: ".", testMatch: "poll-evolution.spec.ts", timeout: 60_000, workers: 1,
  reporter: [["list"]], outputDir: "../../test-results/poll-evolution",
  use: { baseURL: process.env.PF_BASE_URL ?? "http://127.0.0.1:3022", serviceWorkers: "block", actionTimeout: 10_000, trace: "retain-on-failure", launchOptions: { channel: "chrome" } },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: process.env.PF_BASE_URL ? undefined : { cwd: path.resolve(__dirname, "../.."), command: "npx next dev --turbopack -H 127.0.0.1 -p 3022", url: "http://127.0.0.1:3022", reuseExistingServer: !process.env.CI, timeout: 120_000 },
})
