import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

interface SecuritySurfaceEnv {
  url: string
  anonKey: string
}

interface SecuritySurfaceResult {
  name: string
  status: number
  passed: boolean
}

function loadEnv(): SecuritySurfaceEnv {
  let url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  let anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  if (!url || !anonKey) {
    const env = readFileSync(".env.local", "utf8")
    const read = (name: string) =>
      env.match(new RegExp(`^(?:NEXT_PUBLIC_)?${name}=(.+)$`, "m"))?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, "") ?? ""
    url ||= read("SUPABASE_URL")
    anonKey ||= read("SUPABASE_ANON_KEY")
  }
  if (!url || !anonKey) throw new Error("Supabase URL/anon key ausentes")
  return { url: url.replace(/\/$/, ""), anonKey }
}

export async function auditPublicSecuritySurface(
  env: SecuritySurfaceEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<SecuritySurfaceResult[]> {
  const impossibleId = "00000000-0000-0000-0000-000000000000"
  const headers = {
    apikey: env.anonKey,
    Authorization: `Bearer ${env.anonKey}`,
    "content-type": "application/json",
    Prefer: "return=minimal",
  }
  const cases = [
    { name: "view-candidates-readable", method: "GET", path: "candidatos_publico?select=slug&limit=1", allowed: [200] },
    { name: "view-finance-readable", method: "GET", path: "financiamento_publico?select=id,maiores_doadores&limit=1", allowed: [200] },
    { name: "raw-cpf-denied", method: "GET", path: "candidatos?select=cpf&limit=1", allowed: [401, 403] },
    { name: "raw-donors-denied", method: "GET", path: "financiamento?select=maiores_doadores&limit=1", allowed: [401, 403] },
    { name: "anon-update-denied", method: "PATCH", path: `patrimonio?id=eq.${impossibleId}`, body: "{\"ano_eleicao\":1900}", allowed: [401, 403] },
    { name: "anon-delete-denied", method: "DELETE", path: `patrimonio?id=eq.${impossibleId}`, allowed: [401, 403] },
    { name: "anon-insert-denied", method: "POST", path: "patrimonio", body: JSON.stringify({ candidato_id: impossibleId, ano_eleicao: 1900, valor_total: 0, bens: [] }), allowed: [401, 403] },
  ] as const

  return Promise.all(
    cases.map(async (check) => {
      const response = await fetchImpl(`${env.url}/rest/v1/${check.path}`, {
        method: check.method,
        headers,
        body: "body" in check ? check.body : undefined,
      })
      return {
        name: check.name,
        status: response.status,
        passed: (check.allowed as readonly number[]).includes(response.status),
      }
    }),
  )
}

async function main() {
  const results = await auditPublicSecuritySurface(loadEnv())
  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}: HTTP ${result.status}`)
  }
  const failed = results.filter((result) => !result.passed)
  if (failed.length > 0) {
    console.error(`audit:public-security-surface:gate FAILED: ${failed.length} check(s)`)
    process.exit(1)
  }
  console.log(`audit:public-security-surface:gate PASSED: ${results.length}/${results.length}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
