/**
 * Materializa public.financiamento_doador_recorrente a partir de financiamento.
 *
 * Regras em scripts/lib/doador-recorrente.ts. O documento do doador (CNPJ ou
 * cpf_hash) é lido aqui com service role e fica só em memória: nenhuma linha
 * escrita, nenhum log e nenhum relatório carrega documento ou hash.
 *
 * Uso:
 *   npx tsx scripts/materializar-doador-recorrente.ts            # dry-run (padrão)
 *   npx tsx scripts/materializar-doador-recorrente.ts --relatorio caminho.json
 *   npx tsx scripts/materializar-doador-recorrente.ts --apply
 *
 * No --apply, a execução nova entra num insert só (atômico) e as anteriores
 * saem depois. A view pública mostra só a execução de materializado_em mais
 * recente, então a ficha nunca vê as duas ao mesmo tempo nem uma execução
 * pela metade.
 */

import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { getCanonicalPerson } from "../src/lib/canonical-person-map"
import {
  REGRA_DOADOR_RECORRENTE_VERSAO,
  materializarDoadoresRecorrentes,
  type CandidatoPublicoRef,
  type DoadorRecorrenteLinha,
  type FinanciamentoLinhaBruta,
  type ResultadoMaterializacao,
} from "./lib/doador-recorrente"

const PAGE_SIZE = 500
const TABELA = "financiamento_doador_recorrente"

export interface ResumoDoadorRecorrente {
  regra_versao: string
  grupos: number
  linhas: number
  candidatos_com_doador_recorrente: number
  exclusoes: ResultadoMaterializacao["exclusoes"]
  financiamentos_fora_do_publico: number
  /** Só nome público, tipo e contagem de pessoas. Nunca documento. */
  doadores: Array<{ doador_nome: string; doador_tipo: string; pessoas: number; anos: number[] }>
}

export function resumirMaterializacao(resultado: ResultadoMaterializacao): ResumoDoadorRecorrente {
  const porGrupo = new Map<string, DoadorRecorrenteLinha[]>()
  for (const linha of resultado.linhas) {
    const lista = porGrupo.get(linha.doador_grupo) ?? []
    lista.push(linha)
    porGrupo.set(linha.doador_grupo, lista)
  }
  const doadores = [...porGrupo.values()]
    .map((linhas) => ({
      doador_nome: linhas[0].doador_nome,
      doador_tipo: linhas[0].doador_tipo,
      pessoas: new Set(linhas.map((linha) => linha.pessoa_chave)).size,
      anos: [...new Set(linhas.map((linha) => linha.ano_eleicao))].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.pessoas - a.pessoas || a.doador_nome.localeCompare(b.doador_nome))

  return {
    regra_versao: REGRA_DOADOR_RECORRENTE_VERSAO,
    grupos: resultado.grupos,
    linhas: resultado.linhas.length,
    candidatos_com_doador_recorrente: new Set(resultado.linhas.map((linha) => linha.candidato_id)).size,
    exclusoes: resultado.exclusoes,
    financiamentos_fora_do_publico: resultado.financiamentosFora,
    doadores,
  }
}

async function lerPaginado<T>(consulta: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const linhas: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await consulta(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const pagina = (data ?? []) as T[]
    linhas.push(...pagina)
    if (pagina.length < PAGE_SIZE) break
  }
  return linhas
}

async function carregarEntrada() {
  const financiamentos = await lerPaginado<FinanciamentoLinhaBruta>((from, to) =>
    supabase
      .from("financiamento")
      .select("id, candidato_id, ano_eleicao, maiores_doadores, maiores_doadores_publicos")
      .is("despublicado_em", null)
      .order("id")
      .range(from, to),
  )
  const candidatosPublicos = await lerPaginado<CandidatoPublicoRef>((from, to) =>
    supabase
      .from("candidatos_publico")
      .select("id, slug, nome_completo, data_nascimento")
      .order("id")
      .range(from, to),
  )
  const todos = await lerPaginado<{ nome_completo: string | null }>((from, to) =>
    supabase.from("candidatos").select("nome_completo").order("id").range(from, to),
  )
  return { financiamentos, candidatosPublicos, nomesDeCandidatos: todos.map((c) => c.nome_completo) }
}

async function main() {
  const apply = process.argv.includes("--apply")
  const relatorioIndex = process.argv.indexOf("--relatorio")
  const relatorio = relatorioIndex >= 0 ? process.argv[relatorioIndex + 1] : null

  const entrada = await carregarEntrada()
  const resultado = materializarDoadoresRecorrentes({
    ...entrada,
    canonicalSlugDe: (slug) => getCanonicalPerson(slug).canonicalSlug,
    novoGrupo: randomUUID,
  })
  const resumo = resumirMaterializacao(resultado)

  console.log(
    `${apply ? "Aplicação" : "Dry-run"} ${resumo.regra_versao}\n` +
      `  financiamentos lidos: ${entrada.financiamentos.length}\n` +
      `  fora do público (candidato não publicado): ${resumo.financiamentos_fora_do_publico}\n` +
      `  grupos de doador recorrente: ${resumo.grupos}\n` +
      `  linhas a materializar: ${resumo.linhas}\n` +
      `  candidatos com doador recorrente: ${resumo.candidatos_com_doador_recorrente}\n` +
      `  exclusões: ${JSON.stringify(resumo.exclusoes)}`,
  )
  for (const doador of resumo.doadores.slice(0, 15)) {
    console.log(`  ${doador.doador_nome} (${doador.doador_tipo}): ${doador.pessoas} pessoas, anos ${doador.anos.join(", ")}`)
  }
  if (relatorio) {
    writeFileSync(relatorio, `${JSON.stringify(resumo, null, 2)}\n`)
    console.log(`  relatório: ${relatorio}`)
  }

  if (!apply) {
    console.log("Dry-run. Nenhuma escrita aplicada. Use --apply para materializar.")
    return
  }

  const execucao = new Date().toISOString()
  await escreverAuditado(
    {
      script: "materializar-doador-recorrente",
      tabela: TABELA,
      motivo: `materializa doadores recorrentes com a regra ${REGRA_DOADOR_RECORRENTE_VERSAO}`,
      recorte: `${resumo.grupos} grupos, ${resumo.linhas} linhas; substitui a materialização anterior`,
    },
    async () => {
      // Um insert só: o PostgREST roda cada requisição numa transação, então a
      // execução nova aparece inteira ou não aparece. A view mostra só a
      // execução mais recente, e a limpeza abaixo só remove as anteriores.
      const tocadas: Array<{ id: string }> = []
      if (resultado.linhas.length > 0) {
        const linhas = resultado.linhas.map((linha) => ({ ...linha, materializado_em: execucao }))
        const { data, error } = await supabase.from(TABELA).insert(linhas).select("id")
        if (error) return { data: tocadas, error: { message: `insert: ${error.message}` } }
        tocadas.push(...((data ?? []) as Array<{ id: string }>))
      }
      const { data, error } = await supabase
        .from(TABELA)
        .delete()
        .neq("materializado_em", execucao)
        .select("id")
      if (error) return { data: tocadas, error: { message: `limpeza da execução anterior: ${error.message}` } }
      tocadas.push(...((data ?? []) as Array<{ id: string }>))
      return { data: tocadas, error: null }
    },
  )
  console.log("Materialização concluída.")
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
