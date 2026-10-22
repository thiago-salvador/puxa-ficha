import { defineConfig, devices } from "playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "second-round-polls.spec.ts",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../../test-results/second-round-polls",
  use: {
    baseURL: process.env.PF_BASE_URL ?? "http://127.0.0.1:3037",
    serviceWorkers: "block",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    launchOptions: { channel: "chrome" },
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } } }],
  webServer: process.env.PF_BASE_URL ? undefined : {
    command: "npm run dev:raw -- --hostname 127.0.0.1 --port 3037",
    env: { VERCEL: "" },
    url: "http://127.0.0.1:3037",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
