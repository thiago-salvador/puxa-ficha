import { defineConfig } from "playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "programa-governo.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3111",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start -- -p 3111",
    url: "http://127.0.0.1:3111/api/deployment-info",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
