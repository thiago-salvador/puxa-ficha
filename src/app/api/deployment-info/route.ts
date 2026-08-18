import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function noStoreJson(body: Record<string, unknown>) {
  const response = NextResponse.json(body)
  response.headers.set(
    "cache-control",
    "private, no-store, no-cache, must-revalidate, max-age=0",
  )
  return response
}

/**
 * Public, non-secret deployment metadata used by the cache revalidation workflow
 * to wait until the production alias serves the commit that triggered the deploy.
 */
export function GET() {
  return noStoreJson({
    ok: true,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
  })
}
