import type { NextConfig } from "next"

/** Apenas o build E2E local/CI pode resolver a camada de dados para fixtures. */
export function visualFixtureBuildConfig(env: Readonly<Record<string, string | undefined>>): Partial<NextConfig> {
  if (env.PF_VISUAL_FIXTURE_BUILD !== "1") return {}
  const runningOnVercel = env.VERCEL === "1" || Boolean(env.VERCEL_ENV && env.VERCEL_ENV !== "local")
  if (env.CI !== "true" || runningOnVercel) {
    throw new Error("PF_VISUAL_FIXTURE_BUILD exige CI=true e é proibido na Vercel")
  }
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    if (env[key] && env[key] !== "https://placeholder.supabase.co") {
      throw new Error("Build E2E não pode carregar uma conexão real de banco")
    }
  }
  return {
    distDir: ".next-e2e",
    turbopack: {
      resolveAlias: {
        "@/lib/api": "./tests/fixtures/visual/api.ts",
        "@/lib/senado-running-mates": "./tests/fixtures/visual/senado-running-mates.ts",
        "@/lib/senado-polls": "./tests/fixtures/visual/senado-polls.ts",
      },
    },
  }
}
