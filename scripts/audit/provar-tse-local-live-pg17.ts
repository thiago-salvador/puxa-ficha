import { createServer } from "node:http"
import { createHash } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { publicFamilyPayloadSha256 } from "./lib/coverage-source-proof"
import { identityRiskSlugsFromArtifacts, parseCliOptions, runReviewedLive } from "../tse-local/ingest-tse-local"
import type { CoverageProfile } from "./audit-cobertura-fichas"
import { planejarFinancas2026, partitionarAcoesPorRiscoDeIdentidade, stableJson } from "../lib/tse-2026-financas-plano"
import { exigirChaveV2 } from "../lib/rehash-doador-cpf-v2"

const safe = { id: "00000000-0000-4000-8000-000000000101", slug: "pf-live-safe" }
const risk = { id: "00000000-0000-4000-8000-000000000102", slug: "pf-live-risk" }
const URL_FIN = "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_contas_2026.zip"
const URL_HIST = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip"
const digest = (v: unknown) => createHash("sha256").update(stableJson(v)).digest("hex")
const bytesSha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")
const root = resolve(process.env.PF_TSE_LIVE_ROOT ?? "/tmp/pf-tse-live-pg17")
const reviewed = join(root, "reviewed")
const out = join(root, "live")
const profilesPath = join(root, "profiles-seed.json")
const candidatesPath = join(root, "candidates.json")
const receiptSnapshot = join(root, "post-round.json")
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const api = (process.env.PF_TSE_PGRST_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/$/, "")

function v2Salt(): string {
  const value = process.env.PF_DOADOR_CPF_HASH_SALT
  if (!value) throw new Error("PG17 proof requires PF_DOADOR_CPF_HASH_SALT in the process environment; value is never printed")
  exigirChaveV2(value)
  return value
}

function demand(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function serve(): Promise<void> {
  demand(api.startsWith("http://127.0.0.1:") || api.startsWith("http://localhost:"), "fixture server refuses a non-loopback PostgREST URL")
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname
      if (path.startsWith("/rest/v1/")) {
        const target = `${api}${(req.url ?? "/").slice("/rest/v1".length)}`
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(Buffer.from(chunk))
        const headers = new Headers()
        for (const [name, value] of Object.entries(req.headers)) {
          if (value && !["host", "connection", "content-length"].includes(name.toLowerCase())) headers.set(name, Array.isArray(value) ? value.join(",") : value)
        }
        const method = req.method ?? "GET"
        const response = await fetch(target, { method, headers, ...(method === "GET" || method === "HEAD" ? {} : { body: Buffer.concat(chunks) }) })
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
        res.end(Buffer.from(await response.arrayBuffer()))
        return
      }
      if (path === "/api/candidato-slugs") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ slugs: [safe.slug, risk.slug] }))
        return
      }
      const match = /^\/api\/candidato-profile\/([^/]+)$/.exec(path)
      if (!match) { res.writeHead(404).end(); return }
      const slug = decodeURIComponent(match[1]!)
      const headers = { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" }
      const response = await fetch(`${api}/candidatos_publico?slug=eq.${encodeURIComponent(slug)}&select=*`, { headers })
      if (!response.ok) throw new Error(`PostgREST readback HTTP ${response.status}`)
      const rows = await response.json() as Array<Record<string, unknown>>
      if (rows.length !== 1) throw new Error(`readback ${slug}: esperado 1 perfil, obtido ${rows.length}`)
      const candidate = rows[0]!
      const rowsFor = async (table: string) => {
        const result = await fetch(`${api}/${table}?candidato_id=eq.${encodeURIComponent(String(candidate.id))}&select=*`, { headers })
        if (!result.ok) throw new Error(`PostgREST ${table} readback HTTP ${result.status}`)
        return await result.json() as Array<Record<string, unknown>>
      }
      const [finances, assets, history] = await Promise.all([rowsFor("financiamento"), rowsFor("patrimonio"), rowsFor("historico_politico")])
      candidate.financiamento = finances
      candidate.financiamento_eleicoes = finances.map((row) => ({ ano: row.ano_eleicao, total_arrecadado: row.total_arrecadado }))
      candidate.patrimonio = assets
      candidate.patrimonio_eleicoes = assets.map((row) => ({ ano: row.ano_eleicao, valor_total: row.valor_total }))
      candidate.historico = history
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ sourceStatus: "live", data: candidate }))
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    }
  })
  server.listen(Number(process.env.PF_TSE_LIVE_SERVER_PORT ?? 43871), "127.0.0.1")
}

async function run(): Promise<void> {
  demand(api.startsWith("http://127.0.0.1:") || api.startsWith("http://localhost:"), "SUPABASE_URL precisa apontar ao PostgREST local")
  demand(key && process.env.PF_TSE_LIVE_SERVER_PORT, "PostgREST key/porta local ausente")
  const salt = v2Salt()
  mkdirSync(join(reviewed, "financas"), { recursive: true, mode: 0o700 })

  const profiles = [safe, risk]
  const candidates = [
    { slug: safe.slug, ids: { tse_sq_candidato: { "2026": "260000000101" } } },
    { slug: risk.slug, ids: { tse_sq_candidato: { "2026": "260000000102" } } },
  ]
  writeFileSync(profilesPath, JSON.stringify(profiles), { mode: 0o600 })
  writeFileSync(candidatesPath, JSON.stringify(candidates), { mode: 0o600 })
  writeFileSync(receiptSnapshot, "[]\n", { mode: 0o600 })

  const publicos = [safe, risk]
  const finRow = (profile: typeof safe, total: number) => ({
    table: "financiamento" as const, slug: profile.slug,
    row: { candidato_id: profile.id, ano_eleicao: 2026, sq_candidato: profile.slug === safe.slug ? "260000000101" : "260000000102",
      uf_candidatura: "SP", cargo_candidatura: "Deputado Federal", total_arrecadado: total,
      total_fundo_partidario: 0, total_fundo_eleitoral: 1000, total_pessoa_fisica: 0, total_recursos_proprios: 0,
      categorias_origem: { fundo_eleitoral: 1000, fundo_partidario: 0, outros_recursos: 0, nao_informado_pelo_tse: 0 },
      maiores_doadores: [{ nome: "PARTIDO SINTÉTICO", valor: 1000, tipo: "fundo_eleitoral" }], fonte: "TSE", receitas: 2 },
  })
  const readTable = async <T>(table: string): Promise<T[]> => {
    const response = await fetch(`${api}/${table}?ano_eleicao=eq.2026&select=*`, { headers: { apikey: key, authorization: `Bearer ${key}` } })
    if (!response.ok) throw new Error(`PostgREST seed read failed for ${table}: ${response.status} ${(await response.text()).slice(0, 500)}`)
    return await response.json() as T[]
  }
  const [financeBefore, patrimoineBefore, verificationBefore] = await Promise.all([
    readTable<never>("financiamento"), readTable<never>("patrimonio"), readTable<never>("financiamento_verificacoes"),
  ])
  const plan0 = planejarFinancas2026({
    publicos,
    planejadas: [finRow(safe, 1250), finRow(risk, 9999)],
    estado: { financiamento: financeBefore as never[], verificacoes: verificationBefore as never[], patrimonio: patrimoineBefore as never[], ausencias: [] },
    pacote: { url_receitas: URL_FIN, url_bens: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip",
      sha256_receitas: "1".repeat(64), sha256_bens: "2".repeat(64) },
  })
  const historyReview = { itens: [{ slug: risk.slug, tipo: "identidade" }] }
  const familySource = { diagnostics: [] }
  const riskSlugs = identityRiskSlugsFromArtifacts(historyReview, candidates, familySource, plan0)
  demand(riskSlugs.has(risk.slug) && !riskSlugs.has(safe.slug), "identity-risk synthetic cohort incorrect")
  const plan = { ...partitionarAcoesPorRiscoDeIdentidade(plan0, riskSlugs).plano, identity_risk_slugs: [...riskSlugs] }
  demand(plan0.acoes.some((action) => action.tipo === "atualizar_financiamento" && action.slug === safe.slug), "safe dry-run did not plan a financing update")
  demand(plan0.acoes.some((action) => action.tipo === "atualizar_financiamento" && action.slug === risk.slug), "risk dry-run did not plan a financing update before partition")
  demand(plan.acoes.some((action) => action.slug === safe.slug) && plan.acoes.every((action) => action.slug !== risk.slug), "finance plan partition failed")
  demand(plan.recibos.some((receipt) => receipt.alvo === risk.slug && receipt.resultado === "indeterminado"), "private risk receipt missing")

  const planSha = digest(plan.acoes)
  const planFile = join(reviewed, "financas", "plano-privado.json")
  writeFileSync(planFile, `${JSON.stringify({ ...plan, plano_sha256: planSha, generated_at: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 })
  const cohortFile = join(reviewed, "coorte-perfis.json")
  writeFileSync(cohortFile, `${JSON.stringify(profiles)}\n`, { mode: 0o600 })
  writeFileSync(join(reviewed, "coorte-candidatos.json"), `${JSON.stringify(candidates)}\n`, { mode: 0o600 })
  writeFileSync(join(reviewed, "historico-revisao.json"), `${JSON.stringify(historyReview)}\n`, { mode: 0o600 })
  writeFileSync(join(reviewed, "recibos-familias-tse.json"), `${JSON.stringify(familySource)}\n`, { mode: 0o600 })
  writeFileSync(join(reviewed, "recibos-familias-aplicaveis.json"), `${JSON.stringify({ receipts: [] })}\n`, { mode: 0o600 })
  const identitySha = null
  const report = {
    generated_at: new Date().toISOString(), mode: "dry-run", historical_scope_complete: true,
    cohort: { selected: profiles.length }, assets_reused_from_verified_cache: [],
    sources: { consulta_cand: { requested: 16, fresh_certifiable: 16, errors: [] },
      bem_candidato_2026: { fresh_certifiable: true, errors: [] }, financiamento_2026: { fresh_certifiable: true, errors: [] } },
    identity_reviewed_sha256: identitySha,
    identity_risk_source_shas: { history_review: bytesSha(join(reviewed, "historico-revisao.json")),
      candidates: bytesSha(join(reviewed, "coorte-candidatos.json")), family_receipts: bytesSha(join(reviewed, "recibos-familias-tse.json")) },
    steps: { history_review_receipts: { ok: true }, coverage_dry_run: { ok: true }, history_coverage_dry_run: { ok: true },
      finance_planner: { ok: true }, apply_projection: { ok: true }, family_receipts: { ok: true }, identity_risk_actions_blocked: 0 },
  }
  const reportPath = join(reviewed, "relatorio.json")
  writeFileSync(reportPath, `${JSON.stringify(report)}\n`, { mode: 0o600 })

  const profile = (slug: string) => fetch(`http://127.0.0.1:${process.env.PF_TSE_LIVE_SERVER_PORT}/api/candidato-profile/${slug}`)
  const before = await profile(safe.slug)
  demand(before.ok, "local public profile server failed before dry-run")
  console.log(`PASS dry-run finance planner: ${plan0.acoes.length} action(s); partition: ${plan.acoes.length} safe action(s), ${plan.recibos.filter((r) => r.alvo === risk.slug).length} private risk receipt(s)`)

  const family = join(reviewed, "recibos-familias-aplicaveis.json")
  const projection = join(reviewed, "recibos-familias-projecao.json")
  const history = join(reviewed, "historico-recibos.json")
  const profileResponse = await profile(safe.slug)
  const profileBody = await profileResponse.json() as { data: Record<string, unknown> }
  const safePublic = profileBody.data as unknown as CoverageProfile
  const safeAction = plan.acoes.find((action) => action.slug === safe.slug && action.tipo === "atualizar_financiamento")
  demand(safeAction?.tipo === "atualizar_financiamento", "safe planned finance update missing for coverage projection")
  const projectedRows = (safePublic.financiamento as Array<Record<string, unknown>>).map((row) =>
    row.id === safeAction.id ? { ...row, ...safeAction.depois } : row)
  const projectedSafePublic = {
    ...safePublic,
    financiamento: projectedRows,
    financiamento_eleicoes: (safePublic.financiamento_eleicoes as Array<Record<string, unknown>>).map((row) =>
      Number(row.ano) === 2026 ? { ...row, total_arrecadado: safeAction.depois.total_arrecadado } : row),
  } as CoverageProfile
  const profileReceipt = (family: "financiamento" | "historico_politico", fonte: string, alvo: string, candidato_id: string, year: number, url: string, publicRows: number) => {
    const proof = {
      family, method: "official-source-to-public-readback", scope_complete: true,
      source_revisions: [{ year, url, sha256: "a".repeat(64) }],
      public_payload_sha256: publicFamilyPayloadSha256(family === "financiamento" ? projectedSafePublic : safePublic, family),
      source_rows: publicRows, public_rows: publicRows, matched_rows: publicRows, unmatched_rows: 0,
      identity: { slug: alvo, candidate_id: candidato_id, source_id: family === "financiamento" ? "260000000101" : "HIST-SYNTH-2018" },
    }
    return { fonte, escopo: "candidato", alvo, candidato_id, resultado: "encontrado", volume: Math.max(1, publicRows), url,
      executado_em: new Date().toISOString(), detalhe: JSON.stringify({ contract_version: 1, family, coverage_proof: proof }) }
  }
  const financeRows = Array.isArray(safePublic.financiamento_eleicoes) ? safePublic.financiamento_eleicoes.length : 0
  const historyRows = Array.isArray(safePublic.historico) ? safePublic.historico.length : 0
  writeFileSync(projection, `${JSON.stringify({ receipts: [
    profileReceipt("financiamento", "tse-financiamento", safe.slug, safe.id, 2026, URL_FIN, financeRows),
    profileReceipt("financiamento", "tse-financiamento", risk.slug, risk.id, 2026, URL_FIN, financeRows),
  ] })}\n`, { mode: 0o600 })
  writeFileSync(history, `${JSON.stringify({ receipts: [
    profileReceipt("historico_politico", "tse-historico", safe.slug, safe.id, 2024, URL_HIST, historyRows),
    profileReceipt("historico_politico", "tse-historico", risk.slug, risk.id, 2024, URL_HIST, historyRows),
  ] })}\n`, { mode: 0o600 })
  const options = parseCliOptions(["--live", `--reviewed-run-dir=${reviewed}`, `--out-dir=${out}`, `--recibos=${receiptSnapshot}`,
    `--expected-plan-sha=${planSha}`, `--expected-plan-file-sha=${bytesSha(planFile)}`, `--expected-family-sha=${bytesSha(family)}`,
    `--expected-history-sha=${bytesSha(history)}`, `--expected-report-sha=${bytesSha(reportPath)}`, `--expected-cohort-sha=${bytesSha(cohortFile)}`,
    `--expected-projection-sha=${bytesSha(projection)}`])
  const localSite = `http://127.0.0.1:${process.env.PF_TSE_LIVE_SERVER_PORT}`
  const runner = (script: string, args: string[], env?: NodeJS.ProcessEnv) => {
    const extra = script.endsWith("exportar-perfis-publicos.ts") ? [`--base-url=${localSite}`]
      : script.endsWith("apply-coverage-receipts.ts") ? [`--base-url=${localSite}`] : []
    const result = spawnSync(process.execPath, ["--import", "tsx", script, ...args, ...extra], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, ...env, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: key,
        PF_DOADOR_CPF_HASH_SALT: salt }, maxBuffer: 8 * 1024 * 1024,
    })
    const stdout = result.stdout ?? ""
    const stderr = result.stderr ?? ""
    if (result.status !== 0) console.error(stderr || stdout)
    else console.log(stdout.trim())
    if (result.status === 0 && script.endsWith("apply-coverage-receipts.ts")) {
      const outDir = args.find((arg) => arg.startsWith("--out-dir="))!.slice("--out-dir=".length)
      const planFile = readdirSync(outDir).filter((name) => name.startsWith("plano-")).sort().at(-1)
      if (planFile) {
        const planned = JSON.parse(readFileSync(join(outDir, planFile), "utf8")) as { planned?: unknown[]; rejected?: Array<{ alvo: string | null; motivo: string }> }
        console.log(`coverage decision: planned=${planned.planned?.length ?? 0} rejected=${JSON.stringify(planned.rejected ?? [])}`)
      }
    }
    return { ok: result.status === 0, code: result.status, reason: result.status === 0 ? undefined : stderr.slice(-2000), stdout }
  }
  demand(await runReviewedLive(options, runner, join(root, "consumed")) === 0, "runReviewedLive returned nonzero")
  console.log("PASS reviewed live flow: finance writer + readback exporter + family/history coverage apply used local PostgREST")
}

async function main(): Promise<void> {
  if (process.argv.includes("--serve")) return serve()
  return run()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1 })
}
