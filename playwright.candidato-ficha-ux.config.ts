// fallow-ignore-file unused-file
import { defineConfig } from "playwright/test"
import baseConfig from "./playwright.config"

export default defineConfig({
  ...baseConfig,
  testDir: "./tests/visual",
  testMatch: "candidato-ficha-ux.spec.ts",
  webServer: {
    command: "VERCEL=0 npx --yes node@24 node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
