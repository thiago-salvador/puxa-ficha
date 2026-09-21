/** Issue #388: confirma que nenhuma divergencia de valor cai sobre doador com hash. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeMaioresDoadoresForStorage } from "../../src/lib/financiamento-public"
import { stripAccents } from "../../src/lib/strip-accents"

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length)
}
const WORK = argValue("work") ?? ""
const norm = (v: string) => stripAccents(v).replace(/\s+/g, " ").toUpperCase().trim()
type Raw = { nome: string; valor: number; tipo: string; cnpj?: string; cpf_hash?: string }

async function main(): Promise<void> {
  const rebuilt = JSON.parse(readFileSync(join(WORK, "rebuilt-donors.private.json"), "utf8")) as Record<string, Raw[]>
  const bridge = JSON.parse(readFileSync(join(WORK, "bridge-final.private.json"), "utf8")) as {
    resolved: Array<{ candidato_id: string; slug: string; ano: number; sq: string }>
  }
  const base = process.env.SUPABASE_URL!.replace(/\/+$/, "")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const rows: Array<Record<string, unknown>> = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${base}/rest/v1/financiamento?select=id,candidato_id,ano_eleicao,maiores_doadores&limit=1000&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) })
    const batch = (await res.json()) as Array<Record<string, unknown>>
    rows.push(...batch)
    if (batch.length < 1000) break
  }
  const byKey = new Map(bridge.resolved.map((c) => [`${c.candidato_id}|${c.ano}`, c]))
  let comHash = 0, valorBate = 0
  const divergentes: string[] = []
  for (const row of rows) {
    const donors = Array.isArray(row.maiores_doadores) ? (row.maiores_doadores as Array<Record<string, unknown>>) : []
    const ctx = byKey.get(`${row.candidato_id}|${Number(row.ano_eleicao)}`)
    if (!ctx) continue
    const fonte = normalizeMaioresDoadoresForStorage(rebuilt[ctx.sq] ?? [], Number.MAX_SAFE_INTEGER)
    const porNome = new Map(fonte.map((f) => [norm(f.nome), f]))
    for (const d of donors) {
      if (!(typeof d.cpf_hash === "string" && String(d.cpf_hash).trim())) continue
      comHash += 1
      const f = porNome.get(norm(String(d.nome ?? "")))
      if (f && Math.abs(Number(f.valor) - Number(d.valor)) <= 0.005) valorBate += 1
      else divergentes.push(`${ctx.slug} ${ctx.ano}: ${String(d.nome).slice(0, 20)} armazenado=${d.valor} fonte=${f?.valor ?? "n/d"}`)
    }
  }
  console.log(JSON.stringify({ doadores_com_hash: comHash, valor_confere: valorBate, divergentes }, null, 2))
}
main().catch((e: unknown) => { console.error(e); process.exit(1) })
