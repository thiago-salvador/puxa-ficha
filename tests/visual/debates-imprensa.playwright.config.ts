import { defineConfig, devices } from "playwright/test"

const PORT = 3117
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: ".",
  testMatch: /debates-imprensa\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev:raw -- --hostname 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
})
