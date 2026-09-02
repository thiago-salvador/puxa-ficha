/**
 * Matriz universal candidatura x eleição x patrimônio (SOMENTE LEITURA).
 *
 * Execução: pf-patrimonio-20260807T170643Z
 * Nenhuma escrita no banco. Saídas e cache de API em /tmp/pf-patrimonio-20260807T170643Z.
 *
 * Mede, para os 194 candidatos públicos:
 *  - candidaturas oficiais do seed (ids.tse_sq_candidato por ano) vs trajetória
 *    pública (API) e vs banco (historico_politico);
 *  - patrimônio por eleição: publicado (API), lacuna (candidatura aplicável sem
 *    dado), ausência confirmada (coleta_log) e divergência banco/API.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { supabase } from "../lib/supabase"

const OUT_DIR = "/tmp/pf-patrimonio-20260807T170643Z"
const API_CACHE = resolve(OUT_DIR, "api-cache")
const SITE = "https://puxaficha.com.br"
// Série bem_candidato nos dados abertos do TSE começa em 2006.
const BENS_MIN_YEAR = 2006

interface SeedEntry {
  slug: string
  nome_completo?: string
  cargo_disputado?: string
  ids?: { tse_sq_candidato?: Record<string, string> }
}

interface HistoricoRow {
  candidato_id: string
  cargo: string | null
  periodo_inicio: number | null
  periodo_fim: number | null
  partido: string | null
  proveniencia: string | null
  despublicacao_motivo: string | null
}

interface LogRow {
  fonte: string
  escopo: string | null
  alvo: string | null
  candidato_id: string | null
  resultado: string | null
  executado_em: string | null
}

interface ApiHistoricoRow {
  cargo?: string | null
  periodo_inicio?: number | null
  periodo_fim?: number | null
  proveniencia?: string | null
}

function jparse<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function loadBaselineSlugs(): string[] {
  const raw = jparse<unknown>("/tmp/pf-slugs-baseline.json")
  if (Array.isArray(raw)) return raw as string[]
  const obj = raw as Record<string, unknown>
  for (const key of ["slugs", "data", "candidatos"]) {
    if (Array.isArray(obj[key])) return obj[key] as string[]
  }
  throw new Error("formato de /tmp/pf-slugs-baseline.json não reconhecido")
}

async function fetchApiProfile(slug: string): Promise<Record<string, unknown>> {
  const cachePath = resolve(API_CACHE, `${slug}.json`)
  if (existsSync(cachePath)) return jparse(cachePath)
  const res = await fetch(`${SITE}/api/candidato-profile/${slug}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`API ${res.status} para ${slug}`)
  const body = (await res.json()) as { data?: Record<string, unknown> }
  const data = body.data ?? {}
  writeFileSync(cachePath, JSON.stringify(data))
  return data
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

async function main(): Promise<void> {
  mkdirSync(API_CACHE, { recursive: true })

  const seed = jparse<SeedEntry[]>(resolve(process.cwd(), "data/candidatos.json"))
  const seedBySlug = new Map<string, SeedEntry>()
  for (const entry of seed) seedBySlug.set(entry.slug, entry)

  const baselineSlugs = loadBaselineSlugs()
  const baselineSet = new Set(baselineSlugs)

  const { data: pubs, error: pubErr } = await supabase
    .from("candidatos")
    .select("id, slug, cargo_disputado")
    .eq("publicavel", true)
  if (pubErr) throw new Error(`candidatos: ${pubErr.message}`)
  const publicados = pubs ?? []
  const dbSlugSet = new Set(publicados.map((p) => p.slug as string))
  const divergenciaRoster = {
    api_sem_db: baselineSlugs.filter((s) => !dbSlugSet.has(s)),
    db_sem_api: publicados.filter((p) => !baselineSet.has(p.slug)).map((p) => p.slug),
  }

  const ids = publicados.map((p) => p.id as string)
  const idBySlug = new Map(publicados.map((p) => [p.slug as string, p.id as string]))

  let historico: HistoricoRow[] = []
  const { data: histData, error: histErr } = await supabase
    .from("historico_politico")
    .select("candidato_id, cargo, periodo_inicio, periodo_fim, partido, proveniencia, despublicacao_motivo")
    .in("candidato_id", ids)
  if (histErr) {
    // Fallback defensivo se a coluna despublicacao_motivo não existir no remoto.
    const retry = await supabase
      .from("historico_politico")
      .select("candidato_id, cargo, periodo_inicio, periodo_fim, partido, proveniencia")
      .in("candidato_id", ids)
    if (retry.error) throw new Error(`historico_politico: ${retry.error.message}`)
    historico = (retry.data ?? []).map((r) => ({ ...(r as HistoricoRow), despublicacao_motivo: null }))
  } else {
    historico = (histData ?? []) as HistoricoRow[]
  }

  const { data: patData, error: patErr } = await supabase
    .from("patrimonio")
    .select("candidato_id, ano_eleicao, valor_total, fonte")
    .in("candidato_id", ids)
  if (patErr) throw new Error(`patrimonio: ${patErr.message}`)

  const { data: logData, error: logErr } = await supabase
    .from("coleta_log_ultima")
    .select("fonte, escopo, alvo, candidato_id, resultado, executado_em")
    .in("candidato_id", ids)
  const logs: LogRow[] = logErr ? [] : ((logData ?? []) as LogRow[])

  const histByCand = new Map<string, HistoricoRow[]>()
  for (const row of historico) {
    const list = histByCand.get(row.candidato_id) ?? []
    list.push(row)
    histByCand.set(row.candidato_id, list)
  }
  const patYearsByCand = new Map<string, Set<number>>()
  for (const row of patData ?? []) {
    const set = patYearsByCand.get(row.candidato_id as string) ?? new Set<number>()
    set.add(Number(row.ano_eleicao))
    patYearsByCand.set(row.candidato_id as string, set)
  }
  const logsByCand = new Map<string, LogRow[]>()
  for (const row of logs) {
    if (!row.candidato_id) continue
    const list = logsByCand.get(row.candidato_id) ?? []
    list.push(row)
    logsByCand.set(row.candidato_id, list)
  }

  interface LinhaMatriz {
    slug: string
    ano: number
    sq: string
    na_trajetoria_api: boolean
    row_db: "publicada" | "despublicada" | "ausente"
    patrimonio_api: boolean
    patrimonio_db: boolean
    log_tse_patrimonio: string | null
    aplicavel_bens: boolean
  }

  const linhas: LinhaMatriz[] = []
  const errosApi: string[] = []

  const slugs = baselineSlugs
  await mapPool(slugs, 6, async (slug) => {
    let profile: Record<string, unknown> = {}
    try {
      profile = await fetchApiProfile(slug)
    } catch (err) {
      errosApi.push(`${slug}: ${(err as Error).message}`)
      return
    }
    const candId = idBySlug.get(slug) ?? ""
    const apiHist = (profile.historico ?? []) as ApiHistoricoRow[]
    const apiPat = (profile.patrimonio ?? []) as Array<{ ano_eleicao?: number | null }>
    const apiPatYears = new Set(
      apiPat.map((p) => Number(p.ano_eleicao)).filter((n) => Number.isFinite(n)),
    )
    const dbRows = histByCand.get(candId) ?? []
    const dbPatYears = patYearsByCand.get(candId) ?? new Set<number>()
    const candLogs = logsByCand.get(candId) ?? []
    const tsePatLogs = candLogs.filter((l) => l.fonte === "tse")

    const seedEntry = seedBySlug.get(slug)
    const sqByYear = seedEntry?.ids?.tse_sq_candidato ?? {}

    for (const [anoStr, sq] of Object.entries(sqByYear)) {
      const ano = Number(anoStr)
      const apiRow = apiHist.some((r) => Number(r.periodo_inicio) === ano)
      const dbMatches = dbRows.filter((r) => Number(r.periodo_inicio) === ano)
      const rowDb: LinhaMatriz["row_db"] = dbMatches.length === 0
        ? "ausente"
        : dbMatches.every((r) => r.despublicacao_motivo)
          ? "despublicada"
          : "publicada"
      const logResultado = tsePatLogs
        .filter((l) => (l.escopo ?? "").toLowerCase().includes("patrimonio"))
        .map((l) => l.resultado ?? "")
        .join(";")
      linhas.push({
        slug,
        ano,
        sq,
        na_trajetoria_api: apiRow,
        row_db: rowDb,
        patrimonio_api: apiPatYears.has(ano),
        patrimonio_db: dbPatYears.has(ano),
        log_tse_patrimonio: logResultado || null,
        aplicavel_bens: ano >= BENS_MIN_YEAR,
      })
    }
  })

  // ---- agregações ----
  const foraTrajetoria = linhas.filter((l) => !l.na_trajetoria_api)
  const foraTrajetoriaPorAno = new Map<number, number>()
  for (const l of foraTrajetoria) {
    foraTrajetoriaPorAno.set(l.ano, (foraTrajetoriaPorAno.get(l.ano) ?? 0) + 1)
  }
  const foraDb = foraTrajetoria.filter((l) => l.row_db === "ausente")
  const foraApiMasNoDb = foraTrajetoria.filter((l) => l.row_db !== "ausente")

  const lacunasPatrimonio = linhas.filter(
    (l) => l.aplicavel_bens && !l.patrimonio_api,
  )
  const lacunasComLogVazio = lacunasPatrimonio.filter((l) =>
    (l.log_tse_patrimonio ?? "").includes("vazio_confirmado"),
  )
  const fichasComLacuna = new Set(lacunasPatrimonio.map((l) => l.slug))
  const divergenciasDbApi = linhas.filter(
    (l) => l.patrimonio_db !== l.patrimonio_api,
  )
  const patrimonioAlemDaCandidatura = new Map<string, Set<number>>()
  for (const row of patData ?? []) {
    const slug = publicados.find((p) => p.id === row.candidato_id)?.slug as string
    const set = patrimonioAlemDaCandidatura.get(slug) ?? new Set<number>()
    set.add(Number(row.ano_eleicao))
    patrimonioAlemDaCandidatura.set(slug, set)
  }

  const resumo = {
    execution_id: "pf-patrimonio-20260807T170643Z",
    gerado_em: new Date().toISOString(),
    roster: {
      api: baselineSlugs.length,
      db_publicavel: publicados.length,
      divergencia: divergenciaRoster,
    },
    erros_api: errosApi,
    seed: {
      total_candidaturas_seed: linhas.length,
      candidatos_publicos_com_seed: new Set(linhas.map((l) => l.slug)).size,
      candidatos_publicos_sem_seed: slugs.filter((s) => !seedBySlug.get(s)?.ids?.tse_sq_candidato || Object.keys(seedBySlug.get(s)!.ids!.tse_sq_candidato!).length === 0),
    },
    candidaturas: {
      fora_da_trajetoria_api: foraTrajetoria.length,
      fora_da_trajetoria_por_ano: Object.fromEntries(
        [...foraTrajetoriaPorAno.entries()].sort((a, b) => a[0] - b[0]),
      ),
      fora_da_trajetoria_2014: foraTrajetoriaPorAno.get(2014) ?? 0,
      sem_row_no_db: foraDb.length,
      com_row_no_db_mas_fora_da_api: foraApiMasNoDb.length,
      amostra_fora_trajetoria: foraTrajetoria.slice(0, 40).map((l) => `${l.slug} ${l.ano} (${l.row_db})`),
    },
    patrimonio: {
      janela_aplicavel: `>= ${BENS_MIN_YEAR}`,
      eleicoes_aplicaveis: linhas.filter((l) => l.aplicavel_bens).length,
      eleicoes_aplicaveis_com_patrimonio_publicado: linhas.filter(
        (l) => l.aplicavel_bens && l.patrimonio_api,
      ).length,
      lacunas_total: lacunasPatrimonio.length,
      lacunas_com_log_vazio_confirmado: lacunasComLogVazio.length,
      fichas_com_lacuna: fichasComLacuna.size,
      divergencias_db_vs_api: divergenciasDbApi.length,
      amostra_divergencias: divergenciasDbApi.slice(0, 20).map((l) => `${l.slug} ${l.ano} db=${l.patrimonio_db} api=${l.patrimonio_api}`),
      amostra_lacunas_rui: linhas.filter((l) => l.slug.includes("rui") ).map((l) => l),
    },
    logs_tse_escopos: [...new Set(logs.filter((l) => l.fonte === "tse").map((l) => l.escopo))].slice(0, 30),
  }

  writeFileSync(resolve(OUT_DIR, "matrix.json"), JSON.stringify(linhas, null, 2))
  writeFileSync(resolve(OUT_DIR, "matrix-resumo.json"), JSON.stringify(resumo, null, 2))
  console.log(JSON.stringify(resumo, null, 2))
}

main().catch((err) => {
  console.error("FALHA:", (err as Error).message)
  process.exitCode = 1
})
