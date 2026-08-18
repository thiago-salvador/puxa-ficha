import { defineConfig, devices } from "playwright/test"

const BASE_URL = process.env.PF_BASE_URL ?? "http://127.0.0.1:3000"
const useLocalWebServer = !process.env.PF_BASE_URL

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
  ...(useLocalWebServer
    ? {
        webServer: {
          command: "npx next start -H 0.0.0.0 -p 3000",
          url: BASE_URL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            PF_INTERNAL_TOKEN: "launch-internal-token",
            PF_QUIZ_SHORT_LINK_SALT: "launch-quiz-short-link-salt",
            PF_QUIZ_SHORT_LINKS_FILE: ".tmp/playwright-visual-quiz-short-links.json",
            PF_DOADOR_REVERSE_FIXTURE_FILE: "tests/fixtures/doador-reverse-sample.json",
          },
        },
      }
    : {}),
})
