/**
 * Carregador da coorte de atualização para as rotinas de coleta.
 *
 * O predicado é `naCoorteAtualizacao` (src/lib/coorte-atualizacao.ts). Aqui
 * fica só a leitura de `candidaturas_fase_2026_publico` e o filtro que toda rotina de
 * atualização aplica sobre a lista de candidatos que ela vai percorrer.
 *
 * Chave de segurança, em três camadas:
 *  1. Tabela vazia: nenhuma migration de resultado foi aplicada, ninguém saiu
 *     da coorte e as rotinas se comportam exatamente como antes.
 *  2. Tabela ausente (banco antes da migration de schema): mesmo efeito.
 *  3. Qualquer outro erro de leitura derruba a rotina (fail-closed). Depois do
 *     corte, seguir sem a lista faria a rotina voltar a atualizar ficha
 *     congelada e desmentir a nota pública "Dados atualizados até".
 *
 * `tests/coorte-atualizacao-rotinas.test.ts` reprova rotina de atualização que
 * seleciona candidatos sem passar por este módulo.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { naCoorteAtualizacao } from "@/lib/coorte-atualizacao"

const TABELA_FASE_ELEITORAL = "candidaturas_fase_2026"
const VIEW_FASE_ELEITORAL = "candidaturas_fase_2026_publico"

interface EncerramentoAtualizacao {
  candidato_id: string
  slug: string
  fase_eleitoral: string
  fase_turno: number | null
  atualizacao_encerrada_em: string
}

export interface CoorteAtualizacao {
  readonly origem: "banco" | "tabela_ausente" | "injetada"
  /** Só as candidaturas com atualização encerrada, por slug. */
  readonly encerradas: ReadonlyMap<string, EncerramentoAtualizacao>
  /** Mesmo conteúdo, por id de candidato. */
  readonly encerradasPorId: ReadonlyMap<string, EncerramentoAtualizacao>
}

function coorteAtualizacaoDe(encerramentos: readonly EncerramentoAtualizacao[], origem: CoorteAtualizacao["origem"] = "injetada"): CoorteAtualizacao {
  const encerradas = new Map<string, EncerramentoAtualizacao>()
  const encerradasPorId = new Map<string, EncerramentoAtualizacao>()
  for (const e of encerramentos) {
    if (naCoorteAtualizacao(e)) continue
    encerradas.set(e.slug, e)
    encerradasPorId.set(e.candidato_id, e)
  }
  return { origem, encerradas, encerradasPorId }
}

/** Erro de PostgREST/Postgres que significa "a tabela ainda não existe". */
function isTabelaFaseAusente(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  const message = String(error.message ?? "")
  if (code === "42P01" || code === "PGRST205") return true
  return message.includes(TABELA_FASE_ELEITORAL)
    && /does not exist|could not find the (table|relation)|schema cache/i.test(message)
}

type ClienteLeitura = Pick<SupabaseClient, "from">

let cache: Promise<CoorteAtualizacao> | null = null

async function lerDoBanco(client: ClienteLeitura): Promise<CoorteAtualizacao> {
  // A view pública serve tanto o service role quanto os coletores que só têm
  // a chave anon (falas, checagens). Ela já traz o slug.
  const { data, error } = await client
    .from(VIEW_FASE_ELEITORAL)
    .select("candidato_id, slug, fase_eleitoral, fase_turno, atualizacao_encerrada_em")
    .not("atualizacao_encerrada_em", "is", null)
  if (error) {
    if (isTabelaFaseAusente(error)) return coorteAtualizacaoDe([], "tabela_ausente")
    throw new Error(`coorte-atualizacao: leitura de ${VIEW_FASE_ELEITORAL} falhou: ${error.message}`)
  }
  return coorteAtualizacaoDe((data ?? []) as EncerramentoAtualizacao[], "banco")
}

/**
 * Lê a coorte uma vez por processo. `client` padrão é o service role de
 * `src/lib/supabase.ts`, carregado sob demanda para que testes e rotinas
 * sem banco não exijam credencial só por importar este módulo.
 */
export async function carregarCoorteAtualizacao(client?: ClienteLeitura): Promise<CoorteAtualizacao> {
  if (client) return lerDoBanco(client)
  if (!cache) {
    cache = import("@/lib/supabase").then(({ createServiceRoleSupabaseClient }) =>
      lerDoBanco(createServiceRoleSupabaseClient({ cacheMode: "no-store" })),
    ).catch((error: unknown) => {
      cache = null
      throw error
    })
  }
  return cache
}

/** Exclui candidaturas encerradas por ID ou slug. */
function estaNaCoorteAtualizacao(coorte: CoorteAtualizacao, candidato: { slug?: string | null; id?: string | null }): boolean {
  if (candidato.id && coorte.encerradasPorId.has(candidato.id)) return false
  if (candidato.slug && coorte.encerradas.has(candidato.slug)) return false
  return true
}

/**
 * Filtro que toda rotina de atualização aplica à lista que vai percorrer.
 * Loga quantas candidaturas ficaram de fora para o resumo do run.
 */
export function filtrarCoorteAtualizacao<T extends { slug?: string | null; id?: string | null }>(
  linhas: readonly T[],
  coorte: CoorteAtualizacao,
  rotina: string,
): T[] {
  const dentro = linhas.filter((linha) => estaNaCoorteAtualizacao(coorte, linha))
  const fora = linhas.length - dentro.length
  if (fora > 0) {
    console.log(`[coorte-atualizacao] ${rotina}: ${fora} candidatura(s) com atualização encerrada ignorada(s)`)
  }
  return dentro
}
