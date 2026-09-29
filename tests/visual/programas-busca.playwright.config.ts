import { defineConfig } from "playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "programas-busca.spec.ts",
  timeout: 90_000,
  expect: { timeout: 45_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3122", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: "CI=true PF_VISUAL_FIXTURE_BUILD=1 npm start -- -p 3122",
    url: "http://127.0.0.1:3122/programas",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
