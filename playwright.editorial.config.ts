import { defineConfig } from "playwright/test"
import baseConfig from "./playwright.config"

/**
 * Spec editorial isolado + opcional `webServer` (build + next start) para desenvolvimento local
 * com `.env.local` apontando a um Supabase real (sem placeholder — senão a ficha pública não carrega).
 *
 * Uso:
 *   npm run test:visual:editorial:local
 *
 * Só servidor já em execução:
 *   PF_BASE_URL=http://127.0.0.1:3000 npm run test:visual:editorial -- --project=desktop
 */
const LOCAL_DEFAULT = "http://127.0.0.1:3000"
const baseURL = process.env.PF_BASE_URL?.trim() || LOCAL_DEFAULT

export default defineConfig({
  ...baseConfig,
  testMatch: "**/editorial-badges.spec.ts",
  use: {
    ...baseConfig.use,
    baseURL,
  },
  webServer:
    process.env.PF_PLAYWRIGHT_EDITORIAL_WEBSERVER === "1"
      ? {
          command: "npm run build && npx next start -H 0.0.0.0 -p 3000",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        }
      : undefined,
})
