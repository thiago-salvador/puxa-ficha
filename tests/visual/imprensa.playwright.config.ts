import { defineConfig, devices } from "playwright/test"

const port = 3118
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: ".",
  testMatch: "imprensa.spec.ts",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 393, height: 851 } } },
  ],
  webServer: {
    command: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx next start -H 127.0.0.1 -p ${port}`,
    cwd: process.cwd(),
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
