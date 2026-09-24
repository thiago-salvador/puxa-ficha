import "server-only"

import { createServiceRoleSupabaseClient } from "@/lib/supabase"
import { withSupabaseRetry } from "@/lib/supabase-retry"

/**
 * Trilha pública de correções: linhas de `coleta_log` com `natureza='escrita'`,
 * que a migration 20260808120000 define como "mudança de dado em produção",
 * distinta de `natureza='coleta'` (tentativa de busca numa fonte externa).
 *
 * `coleta_log` não tem GRANT para `anon`/`authenticated` de propósito (ver
 * comentário em `fetchColetaVerificacao` em `src/lib/api.ts`: mudar isso
 * mudaria a postura de segurança do log inteiro por causa de um campo de
 * exibição). Esta trilha lê com o client de service role, no servidor, e
 * expõe só um recorte curado — nunca o `detalhe` bruto.
 *
 * `detalhe` é texto livre por linha: cada migration escreve o JSON que fez
 * sentido para o próprio caso (`resumo`, ou `antes`/`depois`, ou nenhum dos
 * dois). Não há um schema único para "o que mudou" em todas as linhas. Este
 * módulo só promove `detalhe.resumo` quando existe e é string; do contrário,
 * a linha aparece sem resumo em vez de arriscar exibir um campo que não foi
 * pensado para leitor público.
 *
 * `candidato_id` vira `null` quando o candidato saiu da coorte publicável
 * (ON DELETE SET NULL) e também quando a ficha resolvida não está mais em
 * `candidatos_publico` hoje. Nos dois casos a linha aparece sem nome nem
 * link: a trilha de correção existe, a identidade não é reafirmada.
 */

export interface CorrecaoRecente {
  id: number
  executadoEm: string
  fonte: string
  alvo: string
  execucao: string | null
  url: string | null
  resumo: string | null
  candidato: { slug: string; nome: string } | null
}

type ColetaLogRow = {
  id: number
  executado_em: string
  fonte: string
  alvo: string
  candidato_id: string | null
  execucao: string | null
  url: string | null
  detalhe: string | null
}

type CandidatoPublicoRow = {
  id: string
  slug: string
  nome_urna: string | null
}

type CorrecoesRecentesDependencies = {
  loadWrites: (limit: number) => Promise<ColetaLogRow[]>
  loadCandidatos: (ids: string[]) => Promise<CandidatoPublicoRow[]>
}

const DEFAULT_LIMIT = 50

function requireHttps(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

/** Só promove `detalhe.resumo` quando é string; qualquer outro formato vira "sem resumo". */
export function extrairResumo(detalhe: string | null): string | null {
  if (!detalhe) return null
  try {
    const parsed: unknown = JSON.parse(detalhe)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const resumo = (parsed as Record<string, unknown>).resumo
    if (typeof resumo !== "string" || !resumo.trim()) return null
    return resumo.trim().slice(0, 600)
  } catch {
    return null
  }
}

function defaultDependencies(): CorrecoesRecentesDependencies {
  return {
    loadWrites: async (limit) => {
      const client = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
      const result = await withSupabaseRetry("coleta_log(natureza=escrita)", async (signal) =>
        client
          .from("coleta_log")
          .select("id,executado_em,fonte,alvo,candidato_id,execucao,url,detalhe")
          .eq("natureza", "escrita")
          .order("executado_em", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit)
          .abortSignal(signal),
      )
      if (result.error) throw new Error(`coleta_log: ${result.error.message}`)
      if (!Array.isArray(result.data)) throw new Error("coleta_log: resposta inválida")
      return result.data as ColetaLogRow[]
    },
    loadCandidatos: async (ids) => {
      if (!ids.length) return []
      const client = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
      const result = await withSupabaseRetry("candidatos_publico(correcoes)", async (signal) =>
        client.from("candidatos_publico").select("id,slug,nome_urna").in("id", ids).abortSignal(signal),
      )
      if (result.error) throw new Error(`candidatos_publico: ${result.error.message}`)
      if (!Array.isArray(result.data)) throw new Error("candidatos_publico: resposta inválida")
      return result.data as CandidatoPublicoRow[]
    },
  }
}

let testDependencies: CorrecoesRecentesDependencies | null = null

/** Exclusivo para testes direcionados; produção sempre usa as fontes canônicas. */
export function __setCorrecoesRecentesDependenciesForTests(
  dependencies: Partial<CorrecoesRecentesDependencies> | null,
): void {
  if (!dependencies) {
    testDependencies = null
    return
  }
  const defaults = defaultDependencies()
  testDependencies = { ...defaults, ...dependencies }
}

export async function getCorrecoesRecentes(limit: number = DEFAULT_LIMIT): Promise<CorrecaoRecente[]> {
  const deps = testDependencies ?? defaultDependencies()
  const writes = await deps.loadWrites(limit)
  const candidateIds = [...new Set(writes.map((row) => row.candidato_id).filter((id): id is string => Boolean(id)))]
  const candidatos = candidateIds.length ? await deps.loadCandidatos(candidateIds) : []
  const bySlugId = new Map(candidatos.map((candidate) => [candidate.id, candidate]))
  return writes.map((row) => {
    const resolved = row.candidato_id ? bySlugId.get(row.candidato_id) : undefined
    return {
      id: row.id,
      executadoEm: row.executado_em,
      fonte: row.fonte,
      alvo: row.alvo,
      execucao: row.execucao?.trim() || null,
      url: requireHttps(row.url),
      resumo: extrairResumo(row.detalhe),
      candidato:
        resolved && resolved.nome_urna
          ? { slug: resolved.slug, nome: resolved.nome_urna }
          : null,
    }
  })
}
