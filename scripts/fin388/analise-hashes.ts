/** Issue #388: mede quantos dos hashes armazenados tem CPF recuperavel. */
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
const rebuilt = JSON.parse(readFileSync(join(WORK, "rebuilt-donors.private.json"), "utf8")) as Record<string, Raw[]>
const bridge = JSON.parse(readFileSync(join(WORK, "bridge-final.private.json"), "utf8")) as {
  resolved: Array<{ candidato_id: string; slug: string; ano: number; sq: string; official_uf: string }>
}

async function main(): Promise<void> {
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
  let total = 0, recuperavel = 0, semNome = 0, semCpfNaFonte = 0, ambiguo = 0
  const detalhe: Record<string, number> = {}

  for (const row of rows) {
    const donors = Array.isArray(row.maiores_doadores) ? (row.maiores_doadores as Array<Record<string, unknown>>) : []
    const hashed = donors.filter((d) => typeof d.cpf_hash === "string" && String(d.cpf_hash).trim())
    if (hashed.length === 0) continue
    const ctx = byKey.get(`${row.candidato_id}|${Number(row.ano_eleicao)}`)
    if (!ctx) continue // contexto com atribuicao removida
    // Agrega a fonte com a MESMA funcao, mas sem cortar nos 10 maiores:
    // o objetivo aqui e saber se o doador existe na fonte, nao reproduzir o corte.
    const fonte = normalizeMaioresDoadoresForStorage(rebuilt[ctx.sq] ?? [], Number.MAX_SAFE_INTEGER)
    const porNome = new Map(fonte.map((f) => [norm(f.nome), f]))
    for (const d of hashed) {
      total += 1
      const nome = typeof d.nome === "string" ? norm(d.nome) : ""
      const f = porNome.get(nome)
      if (!f) { semNome += 1; detalhe[`sem_nome:${ctx.slug} ${ctx.ano}`] = (detalhe[`sem_nome:${ctx.slug} ${ctx.ano}`] ?? 0) + 1; continue }
      if (f.cpf_hash) recuperavel += 1
      else if (f.cnpj) { ambiguo += 1; detalhe[`cnpj_no_mesmo_nome:${ctx.slug} ${ctx.ano}`] = 1 }
      else { semCpfNaFonte += 1; detalhe[`sem_cpf:${ctx.slug} ${ctx.ano}`] = (detalhe[`sem_cpf:${ctx.slug} ${ctx.ano}`] ?? 0) + 1 }
    }
  }

  console.log(JSON.stringify({
    hashes_em_contextos_ativos: total,
    com_cpf_unico_recuperavel: recuperavel,
    doador_sem_nome_correspondente_na_fonte: semNome,
    nome_existe_mas_sem_cpf_unico: semCpfNaFonte,
    nome_com_cnpj_na_fonte: ambiguo,
    detalhe,
  }, null, 2))

}

main().catch((e: unknown) => { console.error(e); process.exit(1) })
