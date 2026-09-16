import { defineConfig } from "playwright/test"

const browserExecutable = process.env.PF_BROWSER_EXECUTABLE_PATH

export default defineConfig({
  testDir: ".",
  testMatch: "senado.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3112",
    trace: "retain-on-failure",
    ...(browserExecutable ? { launchOptions: { executablePath: browserExecutable } } : {}),
  },
  webServer: [
    {
      command: "CI=true VERCEL= VERCEL_ENV=local SUPABASE_URL=https://placeholder.supabase.co SENTRY_AUTH_TOKEN= PF_VISUAL_FIXTURE_BUILD=1 SENADO_ENABLED=true npm start -- -p 3112",
      url: "http://127.0.0.1:3112/api/deployment-info",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    // Mesmo build com a flag desligada: as specs de ON/OFF comparam as duas portas.
    {
      command: "CI=true VERCEL= VERCEL_ENV=local SUPABASE_URL=https://placeholder.supabase.co SENTRY_AUTH_TOKEN= PF_VISUAL_FIXTURE_BUILD=1 SENADO_ENABLED= npm start -- -p 3113",
      url: "http://127.0.0.1:3113/api/deployment-info",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
