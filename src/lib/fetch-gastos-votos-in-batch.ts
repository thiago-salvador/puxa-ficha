import type { SupabaseClient } from "@supabase/supabase-js"

import { sumTotalGastoByCandidatoId } from "@/lib/gastos-parlamentares-aggregate"
import type { PatrimonioAnoValor } from "@/lib/evolucao-patrimonial"
import type { LegislacaoMandatoExecutivo, MudancaPartido } from "@/lib/types"
import { legislativeHistoryFlagsFromRows } from "@/lib/legislative-history"

/** PostgREST / Supabase default max rows per request. */
const PAGE_SIZE = 1000
/** Smaller public LME pages avoid statement timeouts on 3k+ inventories during parallel SSG. */
const LEGISLACAO_MANDATO_EXECUTIVO_PAGE_SIZE = 250

/**
 * Quantos atos do Executivo a ficha carrega no caminho de render.
 *
 * O inventario completo (3.600 atos em `ronaldo-caiado`, o maior do site e
 * presidenciável) saiu do render em 2026-08-03 e e buscado sob demanda quando a
 * aba Legislacao abre, pelo mesmo caminho que `projetos_lei` ja usava. Este
 * numero espelha o `.limit(25)` de `projetos_lei` de proposito: os dois recortes
 * aparecem lado a lado na mesma aba, e a previa e substituída pelo inventario
 * inteiro assim que o fetch sob demanda responde.
 */
export const LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT = 25

/** Keep `.in()` lists bounded for URL size and planner stability. */
const CANDIDATO_ID_CHUNK = 100

export const LEGISLACAO_MANDATO_EXECUTIVO_PUBLIC_SELECT =
  "id,candidato_id,tipo_relacao,tipo_norma,numero,ano,data_norma,ementa,signatario,autoridade_papel,fonte_primaria_url,metadata" as const

type GastoRow = { candidato_id: string; total_gasto: number | string | null }
type CargoAtualRow = { id: string; cargo_atual: string | null }
type HistoricoLegislativoRow = {
  candidato_id: string
  cargo: string | null
  cargo_canonico: string | null
}
type PatrimonioRow = {
  candidato_id: string
  ano_eleicao: number
  valor_total: number | string | null
}

/**
 * Soma `total_gasto` por candidato, percorrendo todas as páginas de resultado.
 * Evita truncamento em 1000 linhas quando há muitos registros de gastos.
 */
export async function fetchGastoTotalsByCandidatoIds(
  supabase: SupabaseClient,
  candidatoIds: string[]
): Promise<Map<string, number>> {
  const ids = [...new Set(candidatoIds)].filter(Boolean)
  if (ids.length === 0) {
    return new Map()
  }

  const all: GastoRow[] = []

  for (let c = 0; c < ids.length; c += CANDIDATO_ID_CHUNK) {
    const idChunk = ids.slice(c, c + CANDIDATO_ID_CHUNK)
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from("gastos_parlamentares")
        .select("candidato_id,total_gasto")
        .in("candidato_id", idChunk)
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        throw new Error(`gastos_parlamentares batch: ${error.message}`)
      }

      const rows = (data ?? []) as GastoRow[]
      all.push(...rows)
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return sumTotalGastoByCandidatoId(all)
}

/**
 * `cargo_atual` público por candidato. `v_comparador` não carrega a coluna;
 * o comparador lê da superfície pública, sem migration nova.
 */
export async function fetchCargoAtualByCandidatoIds(
  supabase: SupabaseClient,
  candidatoIds: string[]
): Promise<Map<string, string | null>> {
  const ids = [...new Set(candidatoIds)].filter(Boolean)
  const byId = new Map<string, string | null>()
  if (ids.length === 0) {
    return byId
  }

  for (let c = 0; c < ids.length; c += CANDIDATO_ID_CHUNK) {
    const idChunk = ids.slice(c, c + CANDIDATO_ID_CHUNK)
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from("candidatos_publico")
        .select("id,cargo_atual")
        .in("id", idChunk)
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        throw new Error(`cargo_atual batch: ${error.message}`)
      }

      const rows = (data ?? []) as CargoAtualRow[]
      for (const row of rows) {
        if (!row.id) continue
        const cargo = row.cargo_atual?.trim() || null
        byId.set(row.id, cargo)
      }
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return byId
}

/**
 * Boolean de histórico federal (senador / deputado federal) por candidato,
 * só com cargo e cargo_canonico. Não carrega a ficha. Vereador e deputado
 * estadual/distrital ficam de fora: o comparador usa isso no bloco CEAP.
 */
export async function fetchLegislativeHistoryFlagsByCandidatoIds(
  supabase: SupabaseClient,
  candidatoIds: string[]
): Promise<Map<string, boolean>> {
  const ids = [...new Set(candidatoIds)].filter(Boolean)
  if (ids.length === 0) {
    return new Map()
  }

  const all: HistoricoLegislativoRow[] = []

  for (let c = 0; c < ids.length; c += CANDIDATO_ID_CHUNK) {
    const idChunk = ids.slice(c, c + CANDIDATO_ID_CHUNK)
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from("historico_politico")
        .select("candidato_id,cargo,cargo_canonico")
        .in("candidato_id", idChunk)
        .is("despublicado_em", null)
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        throw new Error(`historico_politico legislativo batch: ${error.message}`)
      }

      const rows = (data ?? []) as HistoricoLegislativoRow[]
      all.push(...rows)
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return legislativeHistoryFlagsFromRows(all)
}

function toNumberOrNull(value: number | string | null): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Série de patrimônio por candidato (ano + valor), paginada.
 * Filtra linhas despublicadas. Só o suficiente para a evolução 2026 vs. ano anterior.
 */
export async function fetchPatrimonioSeriesByCandidatoIds(
  supabase: SupabaseClient,
  candidatoIds: string[]
): Promise<Map<string, PatrimonioAnoValor[]>> {
  const ids = [...new Set(candidatoIds)].filter(Boolean)
  const byId = new Map<string, PatrimonioAnoValor[]>()
  if (ids.length === 0) return byId

  const all: PatrimonioRow[] = []

  for (let c = 0; c < ids.length; c += CANDIDATO_ID_CHUNK) {
    const idChunk = ids.slice(c, c + CANDIDATO_ID_CHUNK)
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from("patrimonio")
        .select("candidato_id,ano_eleicao,valor_total")
        .in("candidato_id", idChunk)
        .is("despublicado_em", null)
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        throw new Error(`patrimonio batch: ${error.message}`)
      }

      const rows = (data ?? []) as PatrimonioRow[]
      all.push(...rows)
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  for (const row of all) {
    const list = byId.get(row.candidato_id) ?? []
    list.push({
      ano_eleicao: row.ano_eleicao,
      valor_total: toNumberOrNull(row.valor_total),
    })
    byId.set(row.candidato_id, list)
  }

  return byId
}

const MUDANCAS_SELECT =
  "id,candidato_id,ano,partido_anterior,partido_novo,data_mudanca,contexto" as const

/** Todas as linhas de `mudancas_partido` para os candidatos (paginado). */
export async function fetchMudancasPartidoRowsPaged(
  supabase: SupabaseClient,
  candidatoIds: string[]
): Promise<MudancaPartido[]> {
  const ids = [...new Set(candidatoIds)].filter(Boolean)
  if (ids.length === 0) {
    return []
  }

  const all: MudancaPartido[] = []

  for (let c = 0; c < ids.length; c += CANDIDATO_ID_CHUNK) {
    const idChunk = ids.slice(c, c + CANDIDATO_ID_CHUNK)
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from("mudancas_partido")
        .select(MUDANCAS_SELECT)
        .in("candidato_id", idChunk)
        .order("ano", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        throw new Error(`mudancas_partido batch: ${error.message}`)
      }

      const rows = (data ?? []) as MudancaPartido[]
      all.push(...rows)
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return all
}

/**
 * Linhas publicas de `legislacao_mandato_executivo` para uma ficha, sem truncar no limite default de 1000.
 * Ingest/readback de curadoria deve consultar a tabela diretamente quando precisar de campos DB-only.
 *
 * `signal` vem do `withSupabaseRetry` do caller e e repassado a CADA pagina: sem
 * isso, o timeout da tentativa abortaria o wrapper mas a paginacao seguiria
 * disparando requests ao Supabase depois que a ficha ja degradou.
 */
export async function fetchLegislacaoMandatoExecutivoRowsPaged(
  supabase: SupabaseClient,
  candidatoId: string,
  signal?: AbortSignal
): Promise<LegislacaoMandatoExecutivo[]> {
  if (!candidatoId) {
    return []
  }

  signal?.throwIfAborted()

  // Uma consulta so de contagem (head: true nao transfere linha) decide quantas
  // faixas existem, para que elas possam ser buscadas EM PARALELO.
  //
  // Antes de 2026-08-03 isto era um `while (true)` com await por pagina. Medido
  // em producao na ficha mais pesada (ronaldo-caiado, 3.600 atos, presidenciavel
  // e portanto trafego alto): 15 round-trips seriais, 7,5s no caminho de cache
  // frio. Como a funcao inteira roda dentro de UM slot do Promise.all de 13
  // consultas da ficha, ela divide o mesmo orcamento de 15s por tentativa do
  // withSupabaseRetry com todas as outras. Sob concorrencia, cada pagina fica
  // mais lenta, o teto e atingido, a ficha degrada, e como resultado degradado e
  // proibido de entrar em cache o proximo visitante repete o custo inteiro: o
  // comportamento se auto-alimenta justamente sob pico de trafego.
  const { count, error: countError } = await (signal
    ? supabase
        .from("legislacao_mandato_executivo")
        .select("id", { count: "exact", head: true })
        .eq("candidato_id", candidatoId)
        .abortSignal(signal)
    : supabase
        .from("legislacao_mandato_executivo")
        .select("id", { count: "exact", head: true })
        .eq("candidato_id", candidatoId))

  if (countError) {
    throw new Error(`legislacao_mandato_executivo count: ${countError.message}`)
  }

  const total = count ?? 0
  if (total === 0) return []

  const ranges: number[] = []
  for (let from = 0; from < total; from += LEGISLACAO_MANDATO_EXECUTIVO_PAGE_SIZE) {
    ranges.push(from)
  }

  signal?.throwIfAborted()

  const pages = await Promise.all(
    ranges.map(async (from) => {
      const query = supabase
        .from("legislacao_mandato_executivo")
        .select(LEGISLACAO_MANDATO_EXECUTIVO_PUBLIC_SELECT)
        .eq("candidato_id", candidatoId)
        .order("id", { ascending: true })
        .range(from, from + LEGISLACAO_MANDATO_EXECUTIVO_PAGE_SIZE - 1)

      const { data, error } = await (signal ? query.abortSignal(signal) : query)

      if (error) {
        throw new Error(`legislacao_mandato_executivo batch: ${error.message}`)
      }

      return (data ?? []) as LegislacaoMandatoExecutivo[]
    }),
  )

  // `order("id")` explicito acima existe porque, sem ordenacao estavel, faixas
  // paralelas podem se sobrepor ou pular linhas: o `range` do PostgREST e um
  // offset sobre a ordem do planner, que nao e garantida entre requests.
  return pages.flat()
}
