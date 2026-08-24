import { defineConfig, devices } from "playwright/test"

const baseURL = "http://127.0.0.1:3011"

export default defineConfig({
  testDir: ".",
  testMatch: ["pesquisas-eleitorais.spec.ts"],
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    launchOptions: {
      channel: "chrome",
    },
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npx next start -H 0.0.0.0 -p 3011",
    cwd: process.cwd(),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
