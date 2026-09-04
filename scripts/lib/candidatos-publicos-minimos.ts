import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "./supabase"

export interface CandidatoPublicoMinimo {
  readonly slug: string
  readonly nome_completo: string
}

declare const coortePublica: unique symbol
export type CoortePublicaMinima = readonly CandidatoPublicoMinimo[] & {
  readonly [coortePublica]: true
}

// Só seleções emitidas pelo loader podem ser reutilizadas pelo runner. Congelar
// também as linhas impede que o universo auditado seja alterado antes da coleta.
const coortesCarregadas = new WeakSet<object>()

export function exigirCoortePublicaMinima(coorte: CoortePublicaMinima): void {
  if (!coortesCarregadas.has(coorte)) {
    throw new Error("Coorte de sanções deve vir de loadCandidatosPublicosMinimos")
  }
}

interface Opcoes {
  client?: Pick<SupabaseClient, "from">
  signal?: AbortSignal
  /** null lê a coorte inteira; omitido respeita PF_INGEST_SLUGS. */
  escopo?: string | null
}

/** Coorte pública atual, sem depender do seed ou de metadados eleitorais. */
export async function loadCandidatosPublicosMinimos(
  opcoes: Opcoes = {},
): Promise<CoortePublicaMinima> {
  const client = opcoes.client ?? supabase
  const signal = opcoes.signal ?? AbortSignal.timeout(30_000)
  const escopo = opcoes.escopo === undefined ? process.env.PF_INGEST_SLUGS : opcoes.escopo
  const slugs = escopo?.trim() ? escopo.split(",").map((slug) => slug.trim()) : null
  if (slugs?.some((slug) => !slug)) {
    throw new Error("PF_INGEST_SLUGS contém item vazio")
  }

  const candidatos: CandidatoPublicoMinimo[] = []
  const conhecidos = new Set<string>()
  // Avança pelo número recebido, não pelo tamanho pedido: um limite menor do
  // servidor não pode encerrar a leitura cedo. Página vazia encerra a consulta.
  for (let offset = 0; ; ) {
    signal.throwIfAborted()
    const { data, error } = await client
      .from("candidatos_publico")
      .select("slug,nome_completo")
      .order("slug", { ascending: true })
      .range(offset, offset + 199)
      .abortSignal(signal)
    if (error) throw new Error(`candidatos_publico: ${error.message}`)
    if (!Array.isArray(data)) throw new Error("candidatos_publico: resposta sem lista")
    if (data.length === 0) break
    for (const linha of data) {
      if (
        typeof linha.slug !== "string" || !linha.slug.trim() ||
        typeof linha.nome_completo !== "string" || !linha.nome_completo.trim()
      ) {
        throw new Error("candidatos_publico: slug ou nome_completo inválido")
      }
      if (conhecidos.has(linha.slug)) {
        throw new Error("candidatos_publico: slug repetido durante paginação")
      }
      conhecidos.add(linha.slug)
      candidatos.push(Object.freeze({ slug: linha.slug, nome_completo: linha.nome_completo }))
    }
    offset += data.length
  }

  if (slugs?.some((slug) => !conhecidos.has(slug))) {
    throw new Error("PF_INGEST_SLUGS cita slug ausente da coorte candidatos_publico")
  }
  const recorte = slugs ? new Set(slugs) : null
  const selecionados = Object.freeze(
    candidatos.filter((candidato) => !recorte || recorte.has(candidato.slug)),
  ) as CoortePublicaMinima
  coortesCarregadas.add(selecionados)
  return selecionados
}
