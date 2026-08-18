import path from "node:path"
import { defineConfig, devices } from "playwright/test"

const baseURL = process.env.PF_BASE_URL?.trim() || "http://127.0.0.1:3100"
const quizShortLinksFile = path.join(process.cwd(), ".tmp", "playwright-launch-quiz-short-links.json")
const doadorReverseFixtureFile = path.join(process.cwd(), "tests", "fixtures", "doador-reverse-sample.json")

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: ["**/alerts-flow.spec.ts", "**/internal-access.spec.ts", "**/quiz-short-link.spec.ts", "**/doadores-page.spec.ts"],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npx next start -H 0.0.0.0 -p 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
      PF_INTERNAL_TOKEN: "launch-internal-token",
      PF_QUIZ_SHORT_LINK_SALT: "launch-quiz-short-link-salt",
      PF_QUIZ_SHORT_LINKS_FILE: quizShortLinksFile,
      PF_DOADOR_REVERSE_FIXTURE_FILE: doadorReverseFixtureFile,
    },
  },
})
