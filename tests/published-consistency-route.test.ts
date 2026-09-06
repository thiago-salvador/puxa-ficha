import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, it } from "node:test"

describe("published-consistency route", () => {
  it("passa o seed ao gate para detectar ficha pública fora da coleta", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/internal/published-consistency/route.ts"),
      "utf8",
    )
    assert.match(source, /candidateSeed\.map\(\(candidate\) => candidate\.slug\)/)
    assert.match(source, /analyzePublishedConsistency\(data as PublishedRow\[\], seedSlugs\)/)
  })

  it("falha fechado quando a credencial de service role está ausente", async () => {
    const env = {
      ...process.env,
      CRON_SECRET: "cron-test-secret",
      SUPABASE_URL: "https://example.supabase.co",
    } as NodeJS.ProcessEnv
    delete env.NEXT_PUBLIC_SUPABASE_URL
    delete env.SUPABASE_SERVICE_ROLE_KEY
    const routeUrl = pathToFileURL(
      join(process.cwd(), "src/app/api/internal/published-consistency/route.ts"),
    ).href
    const output = execFileSync(
      process.execPath,
      [
        "--conditions",
        "react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `
          import { NextRequest } from "next/server"
          const { GET } = await import(${JSON.stringify(routeUrl)})
          const response = await GET(new NextRequest("http://localhost/api/internal/published-consistency", {
            headers: { authorization: "Bearer cron-test-secret" },
          }))
          console.log(JSON.stringify({ status: response.status, body: await response.json() }))
        `,
      ],
      { cwd: process.cwd(), env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )

    assert.deepEqual(JSON.parse(output), {
      status: 503,
      body: { ok: false, error: "credentials_missing" },
    })
  })
})
