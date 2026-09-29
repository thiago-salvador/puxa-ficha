import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

import { FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS } from "../src/lib/financiamento-despesas-contrato"

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
  // Tabelas internas: RLS ligado E sem grant nenhum para anon/authenticated.
  //
  // O linter do Supabase marca as 14 como `rls_enabled_no_policy` em nivel INFO,
  // porque ele olha policy e nao olha grant. A postura real e mais forte do que o
  // linter enxerga: o privilegio nem existe, entao nao ha o que a policy liberar.
  // Conferido em 23/08/2026 com a chave anon contra producao: as 14 devolvem 401.
  //
  // Este gate existe para impedir o conserto ERRADO. Quem olhar 14 lints INFO e
  // quiser zerar o painel pode ser tentado a criar `POLICY ... USING (true)`, o
  // que abriria e-mail de inscrito em alerta, hash de IP e o log interno de
  // proveniencia. Se isso acontecer, o check abaixo fica vermelho.
  const TABELAS_INTERNAS = [
    "alert_subscribers",
    "alert_subscriptions",
    "analytics_launch_events",
    "candidate_changes",
    "coleta_log",
    "compromisso_evidencia",
    "financiamento_quarentena",
    "financiamento_doador_search",
    "financiamento_verificacoes",
    "identidade_timeline_quarentena_snapshot",
    "link_check_url_observacao",
    "news_refresh_lotes",
    "notification_log",
    "patrimonio_quarentena",
    "quiz_result_short_links",
  ] as const

  const cases = [
    { name: "view-candidates-readable", method: "GET", path: "candidatos_publico?select=slug&limit=1", allowed: [200] },
    { name: "view-finance-readable", method: "GET", path: "financiamento_publico?select=id,maiores_doadores&limit=1", allowed: [200] },
    { name: "raw-cpf-denied", method: "GET", path: "candidatos?select=cpf&limit=1", allowed: [401, 403] },
    { name: "raw-donors-denied", method: "GET", path: "financiamento?select=maiores_doadores&limit=1", allowed: [401, 403] },
    { name: "anon-update-denied", method: "PATCH", path: `patrimonio?id=eq.${impossibleId}`, body: "{\"ano_eleicao\":1900}", allowed: [401, 403] },
    { name: "anon-delete-denied", method: "DELETE", path: `patrimonio?id=eq.${impossibleId}`, allowed: [401, 403] },
    { name: "anon-insert-denied", method: "POST", path: "patrimonio", body: JSON.stringify({ candidato_id: impossibleId, ano_eleicao: 1900, valor_total: 0, bens: [] }), allowed: [401, 403] },
  ] as const

  const todos = [
    ...cases,
    ...TABELAS_INTERNAS.map((tabela) => ({
      name: `interna-negada-${tabela}`,
      method: "GET" as const,
      path: `${tabela}?select=*&limit=1`,
      allowed: [401, 403, 404] as const,
    })),
  ]

  return Promise.all(
    todos.map(async (check) => {
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

export interface DespesasSurfaceResult extends SecuritySurfaceResult {
  pendingApply: boolean
}

/** Colunas que a view `financiamento_despesas_publico` expõe, direto do contrato. */
export const DESPESAS_COLUNAS_PUBLICAS_GATE = FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS.join(",")

/**
 * Superfície das despesas de campanha (migration 20260929100000).
 *
 * Antes do apply em produção, a tabela e a view não existem e o PostgREST
 * responde 404 em todas as rotas: isso é "aplicação pendente", não falha. Assim
 * que qualquer rota responder diferente de 404, a migration está aplicada e o
 * 404 deixa de ser aceito em todas as outras (tabela sem view, ou o contrário,
 * é estado quebrado).
 *
 * A tabela base mantém colunas operacionais sem grant: select=* e leitura
 * direta dessas colunas precisam ser negadas, e a escrita também, na tabela e
 * na view (a view é atualizável automaticamente).
 */
export async function auditFinanciamentoDespesasSurface(
  env: SecuritySurfaceEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<DespesasSurfaceResult[]> {
  const impossibleId = "00000000-0000-0000-0000-000000000000"
  const headers = {
    apikey: env.anonKey,
    Authorization: `Bearer ${env.anonKey}`,
    "content-type": "application/json",
    Prefer: "return=minimal",
  }
  const negado = [401, 403] as const
  const escrita = JSON.stringify({
    candidato_id: impossibleId,
    ano_eleicao: 1900,
    sq_candidato: "0",
    estado_coleta: "declarado",
    fonte: "gate",
    coletado_em: "1900-01-01T00:00:00Z",
  })
  const checks: { name: string; method: string; path: string; body?: string; allowed: readonly number[] }[] = [
    { name: "despesas-view-readable", method: "GET", path: `financiamento_despesas_publico?select=${DESPESAS_COLUNAS_PUBLICAS_GATE}&limit=1`, allowed: [200] },
    { name: "despesas-base-colunas-publicas-readable", method: "GET", path: `financiamento_despesas?select=${DESPESAS_COLUNAS_PUBLICAS_GATE}&limit=1`, allowed: [200] },
    { name: "despesas-base-select-star-denied", method: "GET", path: "financiamento_despesas?select=*&limit=1", allowed: negado },
    ...["updated_at", "created_at", "id_ultima_entrega", "tipo_entrega"].map((coluna) => ({
      name: `despesas-base-${coluna}-denied`,
      method: "GET",
      path: `financiamento_despesas?select=${coluna}&limit=1`,
      allowed: negado,
    })),
    ...["financiamento_despesas", "financiamento_despesas_publico"].flatMap((relacao) => [
      { name: `despesas-insert-denied-${relacao}`, method: "POST", path: relacao, body: escrita, allowed: negado },
      { name: `despesas-update-denied-${relacao}`, method: "PATCH", path: `${relacao}?id=eq.${impossibleId}`, body: "{\"fonte\":\"gate\"}", allowed: negado },
      { name: `despesas-delete-denied-${relacao}`, method: "DELETE", path: `${relacao}?id=eq.${impossibleId}`, allowed: negado },
    ]),
  ]

  const statuses = await Promise.all(
    checks.map(async (check) => {
      const response = await fetchImpl(`${env.url}/rest/v1/${check.path}`, {
        method: check.method,
        headers,
        body: check.body,
      })
      return response.status
    }),
  )
  const pendente = statuses.every((status) => status === 404)
  return checks.map((check, index) => ({
    name: check.name,
    status: statuses[index]!,
    pendingApply: pendente,
    passed: pendente || check.allowed.includes(statuses[index]!),
  }))
}

async function main() {
  const env = loadEnv()
  const results: SecuritySurfaceResult[] = await auditPublicSecuritySurface(env)
  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}: HTTP ${result.status}`)
  }
  const despesas = await auditFinanciamentoDespesasSurface(env)
  for (const result of despesas) {
    const rotulo = result.pendingApply ? "PENDING (migration 20260929100000 ainda nao aplicada)" : result.passed ? "PASS" : "FAIL"
    console.log(`${rotulo} ${result.name}: HTTP ${result.status}`)
  }
  results.push(...despesas)
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
