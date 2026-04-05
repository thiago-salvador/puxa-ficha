import { defineConfig, devices } from "playwright/test"

/**
 * Testes da rota GET /quiz/resultado/og (ImageResponse).
 * Exige build previo: npm run build && npm run test:visual:quiz-og
 */
export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "**/quiz-resultado-og.spec.ts",
  timeout: 30_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PF_QUIZ_OG_BASE_URL?.trim() ?? "http://127.0.0.1:3001",
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  webServer: process.env.PF_QUIZ_OG_BASE_URL?.trim()
    ? undefined
    : {
        command: "npx next start -p 3001",
        url: "http://127.0.0.1:3001",
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
})
