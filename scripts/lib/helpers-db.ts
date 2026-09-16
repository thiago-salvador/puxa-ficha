import { supabase } from "./supabase"
import { loadCandidatos } from "./helpers"
import { getExplicitCohort } from "./cohort-context"
import type { CandidatoConfig } from "./types"

export async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

/**
 * Slugs que estão no ar agora (view `candidatos_publico`, publicavel=true).
 *
 * Usado pelos ingests/enriches para varrer apenas quem o visitante vê. Sem o
 * filtro, cada execução percorria também os ~86 registros fora do ar:
 * desperdiçava chamadas de API externa e gravava dado em ficha que ninguém
 * alcança (decisão de 2026-08-04). Candidato que voltar à corrida recebe a
 * coleta de novo no momento da republicação — o seed completo
 * (`data/candidatos.json`) continua cobrindo os dois mundos.
 */
export async function slugsPublicos(): Promise<Set<string>> {
  const { data, error } = await supabase.from("candidatos_publico").select("slug")
  if (error) throw new Error(`candidatos_publico: ${error.message}`)
  return new Set((data ?? []).map((linha) => linha.slug as string))
}

/**
 * O roster operacional do seed restrito a quem está no ar. Preferir esta
 * função a `loadCandidatos()` em ingest/enrich: o seed inclui registros
 * fora do ar (ex.: presidenciais arquivados com gêmeo ativo), que não devem
 * receber coleta.
 */
export async function loadCandidatosPublicos(): Promise<CandidatoConfig[]> {
  const explicit = getExplicitCohort()
  if (explicit) return [...explicit]
  const publicos = await slugsPublicos()
  return loadCandidatos().filter((candidato) => publicos.has(candidato.slug))
}

/**
 * Lê os recibos editoriais sem converter falha de banco em "não congelado".
 * Se esta consulta falhar, o ingest para antes de chamar a fonte externa.
 */
export async function loadVerificacaoCampos(
  slugs: string[]
): Promise<Map<string, Record<string, unknown> | null>> {
  if (slugs.length === 0) return new Map()
  const { data, error } = await supabase
    .from("candidatos")
    .select("slug, verificacao_campos")
    .in("slug", slugs)
  if (error) throw new Error(`candidatos.verificacao_campos: ${error.message}`)
  return new Map(
    (data ?? []).map((linha) => [
      linha.slug as string,
      (linha.verificacao_campos as Record<string, unknown> | null) ?? null,
    ])
  )
}

export interface CohortDbCandidateRow {
  id?: string
  slug: string
  nome_completo?: string | null
  nome_urna?: string | null
  cargo_disputado: string
  estado?: string | null
  publicavel?: boolean | null
  sq_candidato_2026?: string | null
  situacao_candidatura?: string | null
  [key: string]: unknown
}

export interface ExplicitCohortSelection {
  ano: number
  sqs: string[]
  ufs?: string[]
  /** A seleção sem esta marca nunca pode cair no caminho de ingestão. */
  explicit: true
}

/**
 * Carrega somente uma coorte expressamente selecionada e ainda não publicada.
 * O filtro público continua sendo consultado separadamente para impedir que o
 * bootstrap passe a enriquecer o acervo público por acidente.
 */
export async function loadCandidatosCohortNaoPublica(
  selection: ExplicitCohortSelection,
): Promise<CohortDbCandidateRow[]> {
  if (!selection?.explicit || selection.ano !== 2026 || selection.sqs.length === 0) {
    throw new Error("coorte inválida: ano, SQs e seleção explícita são obrigatórios")
  }
  const sqs = [...new Set(selection.sqs.map((sq) => String(sq).trim()).filter(Boolean))]
  if (sqs.length !== selection.sqs.length) throw new Error("coorte inválida: SQ vazio ou duplicado")
  const query = supabase
    .from("candidatos")
    .select("id,slug,nome_completo,nome_urna,cargo_disputado,estado,publicavel,sq_candidato_2026,situacao_candidatura")
    .eq("cargo_disputado", "Senador")
    .eq("publicavel", false)
    .in("sq_candidato_2026", sqs)
  const { data, error } = await query
  if (error) throw new Error(`coorte não pública: ${error.message}`)
  const rows = (data ?? []) as CohortDbCandidateRow[]
  const loaded = new Set(rows.map((row) => row.sq_candidato_2026).filter(Boolean))
  if (loaded.size !== sqs.length || rows.length !== sqs.length) {
    throw new Error(`coorte não pública incompleta ou ambígua: esperados ${sqs.length}, recebidos ${rows.length}`)
  }
  const publicQuery = supabase.from("candidatos_publico").select("slug").in("slug", rows.map((row) => row.slug))
  const { data: publicRows, error: publicError } = await publicQuery
  if (publicError) throw new Error(`coorte pública: ${publicError.message}`)
  if ((publicRows ?? []).length > 0) throw new Error("coorte inválida: SQ já exposto em candidatos_publico")
  const terminal = new Set(["CANCELADO", "FALECIDO", "INDEFERIDO", "RENÚNCIA", "RENUNCIA", "PEDIDO NÃO CONHECIDO", "PEDIDO NAO CONHECIDO"])
  for (const row of rows) {
    if (row.cargo_disputado !== "Senador" || !row.estado || !/^[A-Z]{2}$/.test(row.estado) || (selection.ufs?.length && !selection.ufs.includes(row.estado))) {
      throw new Error(`coorte inválida: cargo/UF divergente para ${row.sq_candidato_2026 ?? row.slug}`)
    }
    if (!row.sq_candidato_2026 || terminal.has(String(row.situacao_candidatura ?? "").trim().toUpperCase())) {
      throw new Error(`coorte inválida: SQ ausente ou situação terminal para ${row.slug}`)
    }
  }
  return rows
}
