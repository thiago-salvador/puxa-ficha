import { defineConfig, devices } from "playwright/test"

const BASE_URL = process.env.PF_BASE_URL ?? "https://puxa-ficha.vercel.app"

export default defineConfig({
  testDir: "./tests/visual",
  testIgnore: "**/quiz-resultado-og.spec.ts",
  timeout: 30_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Respect animations — tests should be resilient to them
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 14"] },
    },
  ],
})
