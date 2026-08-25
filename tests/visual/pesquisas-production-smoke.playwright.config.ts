import { defineConfig, devices } from "playwright/test"

const baseURL = process.env.PF_BASE_URL ?? "https://puxaficha.com.br"

if (baseURL !== "https://puxaficha.com.br") {
  throw new Error("PF_BASE_URL deve ser exatamente https://puxaficha.com.br")
}

export default defineConfig({
  testDir: ".",
  testMatch: ["pesquisas-production-smoke.spec.ts"],
  outputDir: "../../test-results/pesquisas-production-smoke",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-1440x1000",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-390x844",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
})
