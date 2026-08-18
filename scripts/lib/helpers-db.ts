import { supabase } from "./supabase"
import { loadCandidatos } from "./helpers"
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
