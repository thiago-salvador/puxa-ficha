/**
 * Gate: a superfície pública de verificação está íntegra? (2026-08-15)
 *
 * Nasceu do incidente Augusto Cury (15/08): todos os gates de código verdes e a
 * ficha no ar com selo de 09/06, zero destaques e cards "não foi possível
 * verificar", porque o recibo existia no ledger e não nas chaves que o site lê.
 * A regra virou norma (GUIA seção 3): célula só fecha com recibo MATERIALIZADO
 * no banco E superfície exibindo. Este script é a versão mecânica dessa norma,
 * para o furo não depender de auditoria manual na ficha 47 da Onda G.
 *
 * Onze invariantes por candidato, cada um ancorado num incidente:
 *
 *   R1 selo        `verificacao_campos` resolve data de perfil: TSE completo
 *                  (as três frentes, `resolverFrescorTsePerfil`) OU o agregado
 *                  curado (`existing_profile_aggregate`) com data válida.
 *                  Sem isso o selo cai em fallback frágil (Cury: junho).
 *   R2 destaques   >= 1 ponto de atenção visível OU vazio editorial deliberado,
 *                  provado por item verificado e despublicado com motivo/data.
 *                  Zero sem essa trilha continua sendo falha de materialização.
 *   R3 coletas     As DUAS fontes que a ficha consulta em `coleta_log_ultima`
 *                  (`transparencia-sanctions`, `processos-curadoria`) têm linha
 *                  com resultado válido. Sem linha o card vira "não foi
 *                  possível verificar" em produção.
 *   R4 frescor     `ultima_atualizacao` presente (fallback documentado do selo
 *                  curado em `buildSectionFreshness`).
 *   R5 abas        Votos e Trajetória têm linha publicada ou recibo de estado.
 *   R6 TSE         Nenhum marcador técnico cru chega aos textos servidos.
 *   R7 vocabulário Nenhum carimbo de lote ou curadoria chega ao leitor.
 *   R8 reversão    A->B e B->A no mesmo ano em linhas visíveis reprova.
 *   R9 cadeia      O destino da troca anterior precisa ser a origem da próxima.
 *   R10 suporte    Partido sustentado só por trajetória despublicada gera aviso.
 *   R11 foto       Placeholder persistido reprova globalmente; foto nula gera
 *                  aviso nominal até a regra de fechamento exigir cobertura.
 *
 * Não escreve em banco. Entrada: snapshot de `superficie-snapshot.sql`, buscado
 * pela Management API (somente leitura, mesmo caminho do audit:cobertura) ou
 * fornecido com `--from-snapshot` (modo do CI via psql e dos testes, sem rede).
 *
 * Uso:
 *   npm run audit:superficie
 *   tsx scripts/audit/audit-superficie.ts --from-snapshot=snap.json
 *   tsx scripts/audit/audit-superficie.ts --from-snapshot=snap.json --strict-all
 *   tsx scripts/audit/audit-superficie.ts --json=relatorio.json
 *
 * Sai != 0 em qualquer violação. Sai != 0 com snapshot vazio: zero candidato
 * público significa consulta cega, nunca sucesso.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  CHAVE_AGREGADO_CURADO,
  CHAVE_ESTADO_HISTORICO,
  CHAVE_ESTADO_VOTACOES,
  lerEstadoCelulaSuperficie,
  resolverFrescorTsePerfil,
  validarDataDeVerificacao,
  type VerificacaoCampos,
} from "../../src/lib/verificacao-campos"
import {
  containsTseTechnicalMarker,
  PUBLIC_INTERNAL_VOCABULARY_RE,
} from "../../src/lib/public-text-markers"
import { isPhotoPlaceholder } from "../../src/lib/photo-placeholder"
import {
  hasSameYearPartyReversal,
  isInitialPartyAnchorToken,
  normalizePartyTimelineForDisplay,
  partiesMatchForTimeline,
  rankPartyTimelineRow,
} from "../../src/lib/party-switches"
import type { MudancaPartido } from "../../src/lib/types"
import { PROJECT_REF_PADRAO, consultar, resolverToken } from "./lib/snapshot-fetch"

/** Espelho de COLETA_RESULTADOS_VALIDOS em src/lib/api.ts (estados que a UI aceita). */
const RESULTADOS_COLETA_VALIDOS = new Set([
  "encontrado",
  "vazio_confirmado",
  "sem_achado_no_escopo",
  "nao_aplicavel",
  "erro",
  "indeterminado",
])

const FONTES_DA_FICHA = ["transparencia-sanctions", "processos-curadoria"] as const

export interface LinhaSuperficie {
  slug: string
  publica: boolean | null
  foto_url: string | null
  verificacao_campos: Record<string, unknown> | null
  ultima_atualizacao: string | null
  pontos_visiveis: number
  destaques_totais?: number
  destaques_ocultos_revisados?: number
  coletas: Record<string, { resultado?: unknown; executado_em?: unknown }>
  linhas_abas: {
    votacoes_chave: number
    historico_politico: number
  }
  textos_publicos: Array<{ campo: string; texto: string }>
  integridade_partidaria: {
    mudancas_visiveis: Array<
      Pick<
        MudancaPartido,
        "id" | "ano" | "partido_anterior" | "partido_novo" | "data_mudanca" | "contexto"
      >
    >
    partidos_historico_visivel: string[]
    partidos_historico_despublicado: string[]
  }
}

export interface Violacao {
  slug: string
  regra:
    | "R1_selo"
    | "R2_destaques"
    | "R3_coletas"
    | "R4_frescor"
    | "R5_materializacao_abas"
    | "R6_marcador_tse"
    | "R7_vocabulario_interno"
    | "R8_reversao_mesmo_ano"
    | "R9_cadeia_quebrada"
    | "R11_foto_placeholder"
  detalhe: string
}

export interface AvisoIntegridade {
  slug: string
  regra:
    | "R8_reversao_mesmo_ano"
    | "R9_cadeia_quebrada"
    | "R10_partido_so_despublicado"
    | "R11_foto_ausente"
  detalhe: string
}

function valorTextual(bruto: unknown): string | null {
  return typeof bruto === "string" ? bruto : null
}

function registrarFalhaOuBacklog(
  linha: LinhaSuperficie,
  regra: "R8_reversao_mesmo_ano" | "R9_cadeia_quebrada",
  detalhe: string,
  violacoes: Violacao[],
  avisos: AvisoIntegridade[],
) {
  if (linha.publica !== true) {
    avisos.push({ slug: linha.slug, regra, detalhe: `ficha não pública: ${detalhe}` })
  } else {
    violacoes.push({ slug: linha.slug, regra, detalhe })
  }
}

type MudancaVisivel = LinhaSuperficie["integridade_partidaria"]["mudancas_visiveis"][number]

function normalizarMudancasVisiveis(rows: readonly MudancaVisivel[]): MudancaPartido[] {
  return normalizePartyTimelineForDisplay(
    rows.map((row) => ({ ...row, candidato_id: "audit-superficie" })) as MudancaPartido[],
  )
}

function endpointsContinuosDoGrupo(
  rows: readonly MudancaPartido[],
  partidoAnterior: string | null,
): string[] {
  const endpoints = new Set<string>()

  function visitar(restantes: MudancaPartido[], partidoAtual: string | null) {
    if (restantes.length === 0) {
      if (partidoAtual) endpoints.add(partidoAtual)
      return
    }

    for (const [index, row] of restantes.entries()) {
      const podeComecar = partidoAtual == null || isInitialPartyAnchorToken(row.partido_anterior)
      if (!podeComecar && !partiesMatchForTimeline(partidoAtual, row.partido_anterior)) continue
      visitar(
        restantes.filter((_, candidateIndex) => candidateIndex !== index),
        row.partido_novo,
      )
    }
  }

  visitar([...rows], partidoAnterior)
  return [...endpoints]
}

export function temCadeiaCronologicaPartidariaIntegra(rows: readonly MudancaVisivel[]): boolean {
  const normalized = normalizarMudancasVisiveis(rows)
  if (normalized.length < 2) return true

  const groups = new Map<number, MudancaPartido[]>()
  for (const row of normalized) {
    const rank = rankPartyTimelineRow(row)
    groups.set(rank, [...(groups.get(rank) ?? []), row])
  }
  const orderedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => group)

  function completar(groupIndex: number, partidoAnterior: string | null): boolean {
    if (groupIndex >= orderedGroups.length) return true
    return endpointsContinuosDoGrupo(orderedGroups[groupIndex]!, partidoAnterior).some((endpoint) =>
      completar(groupIndex + 1, endpoint),
    )
  }

  return completar(0, null)
}

function descreverQuebraCronologica(rows: readonly MudancaVisivel[]): string {
  const normalized = normalizarMudancasVisiveis(rows)
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1]!
    const current = normalized[index]!
    if (rankPartyTimelineRow(previous) === rankPartyTimelineRow(current)) continue
    if (isInitialPartyAnchorToken(current.partido_anterior)) continue
    if (partiesMatchForTimeline(previous.partido_novo, current.partido_anterior)) continue
    return `cadeia quebrada: ${previous.partido_novo} não encaixa em ${current.partido_anterior} antes da linha ${current.id}`
  }
  return `cadeia cronológica sem ordenação contínua entre as linhas ${normalized.map((row) => row.id).join(", ")}`
}

export function contarFichasPublicas(linhas: readonly LinhaSuperficie[]): number {
  return linhas.filter((linha) => linha.publica === true).length
}

export function avaliarFotosSuperficie(
  linhas: LinhaSuperficie[],
): { violacoes: Violacao[]; avisos: AvisoIntegridade[] } {
  const violacoes: Violacao[] = []
  const avisos: AvisoIntegridade[] = []

  for (const linha of linhas) {
    if (linha.publica !== true) continue
    if (isPhotoPlaceholder(linha.foto_url)) {
      violacoes.push({
        slug: linha.slug,
        regra: "R11_foto_placeholder",
        detalhe: "foto_url aponta para gerador de avatar ou imagem placeholder",
      })
    } else if (!linha.foto_url) {
      avisos.push({
        slug: linha.slug,
        regra: "R11_foto_ausente",
        detalhe: "foto_url nula; backlog de foto oficial ainda aberto",
      })
    }
  }

  return { violacoes, avisos }
}

export function avaliarIntegridadePartidaria(
  linhas: LinhaSuperficie[],
): { violacoes: Violacao[]; avisos: AvisoIntegridade[] } {
  const violacoes: Violacao[] = []
  const avisos: AvisoIntegridade[] = []

  for (const linha of linhas) {
    const integridade = linha.integridade_partidaria ?? {
      mudancas_visiveis: [],
      partidos_historico_visivel: [],
      partidos_historico_despublicado: [],
    }
    const mudancas = integridade.mudancas_visiveis ?? []

    const byYear = new Map<
      number,
      Array<
        Pick<
          MudancaPartido,
          "id" | "ano" | "partido_anterior" | "partido_novo" | "data_mudanca" | "contexto"
        >
      >
    >()
    for (const row of mudancas) {
      if (typeof row.ano !== "number") continue
      const rows = byYear.get(row.ano) ?? []
      rows.push(row)
      byYear.set(row.ano, rows)
    }
    for (const [ano, rows] of byYear) {
      if (!hasSameYearPartyReversal(rows)) continue
      const pares = rows
        .map((row) => `${row.partido_anterior ?? "?"}->${row.partido_novo ?? "?"}`)
        .join(", ")
      registrarFalhaOuBacklog(
        linha,
        "R8_reversao_mesmo_ano",
        `reversão no mesmo ano ${ano}: ${pares}`,
        violacoes,
        avisos,
      )
    }

    if (!temCadeiaCronologicaPartidariaIntegra(mudancas)) {
      registrarFalhaOuBacklog(
        linha,
        "R9_cadeia_quebrada",
        descreverQuebraCronologica(mudancas),
        violacoes,
        avisos,
      )
    }

    const visibleParties = integridade.partidos_historico_visivel ?? []
    const hiddenParties = integridade.partidos_historico_despublicado ?? []
    const partiesInChanges = new Set(
      mudancas.flatMap((row) => [row.partido_anterior, row.partido_novo]).filter((party): party is string => !!party),
    )
    for (const party of partiesInChanges) {
      if (isInitialPartyAnchorToken(party)) continue
      const visible = visibleParties.some((candidate) => partiesMatchForTimeline(candidate, party))
      const hidden = hiddenParties.some((candidate) => partiesMatchForTimeline(candidate, party))
      if (!visible && hidden) {
        avisos.push({
          slug: linha.slug,
          regra: "R10_partido_so_despublicado",
          detalhe: `${party} só existe em linha despublicada da trajetória`,
        })
      }
    }
  }

  return { violacoes, avisos }
}

/** Regras puras; testadas sem banco em tests/audit-superficie.test.ts. */
export function avaliarSuperficie(linhas: LinhaSuperficie[]): Violacao[] {
  const violacoes = [
    ...avaliarIntegridadePartidaria(linhas).violacoes,
    ...avaliarFotosSuperficie(linhas).violacoes,
  ]

  for (const linha of linhas) {
    if (linha.publica !== true) continue
    const vc = (linha.verificacao_campos ?? {}) as VerificacaoCampos

    const tse = resolverFrescorTsePerfil(vc)
    const curado = validarDataDeVerificacao(valorTextual(vc[CHAVE_AGREGADO_CURADO]))
    if (tse.tipo !== "completa" && curado == null) {
      violacoes.push({
        slug: linha.slug,
        regra: "R1_selo",
        detalhe: `perfil sem data resolvível (TSE ${tse.tipo}, ${CHAVE_AGREGADO_CURADO} ausente ou inválido)`,
      })
    }

    const destaquesTotais = linha.destaques_totais ?? 0
    const ocultosRevisados = linha.destaques_ocultos_revisados ?? 0
    const vazioEditorialAuditado =
      linha.pontos_visiveis === 0 &&
      destaquesTotais >= 1 &&
      ocultosRevisados === destaquesTotais
    if (!(linha.pontos_visiveis >= 1) && !vazioEditorialAuditado) {
      violacoes.push({
        slug: linha.slug,
        regra: "R2_destaques",
        detalhe: "nenhum destaque visível nem despublicação editorial auditável",
      })
    }

    for (const fonte of FONTES_DA_FICHA) {
      const coleta = linha.coletas?.[fonte]
      const resultado = coleta?.resultado
      if (typeof resultado !== "string" || !RESULTADOS_COLETA_VALIDOS.has(resultado)) {
        violacoes.push({
          slug: linha.slug,
          regra: "R3_coletas",
          detalhe: `coleta_log_ultima sem linha válida para ${fonte} (card vira "não foi possível verificar")`,
        })
      }
    }

    if (valorTextual(linha.ultima_atualizacao) == null) {
      violacoes.push({
        slug: linha.slug,
        regra: "R4_frescor",
        detalhe: "ultima_atualizacao ausente",
      })
    }

    const estadoVotacoes = lerEstadoCelulaSuperficie(vc, CHAVE_ESTADO_VOTACOES)
    if (
      !(linha.linhas_abas?.votacoes_chave >= 1) &&
      estadoVotacoes?.estado !== "nao_aplicavel"
    ) {
      violacoes.push({
        slug: linha.slug,
        regra: "R5_materializacao_abas",
        detalhe: "aba Votos sem linhas e sem recibo nao_aplicavel em verificacao_campos.votacoes_chave",
      })
    }

    const estadoHistorico = lerEstadoCelulaSuperficie(vc, CHAVE_ESTADO_HISTORICO)
    if (
      !(linha.linhas_abas?.historico_politico >= 1) &&
      estadoHistorico?.estado !== "vazio_confirmado"
    ) {
      violacoes.push({
        slug: linha.slug,
        regra: "R5_materializacao_abas",
        detalhe: "aba Trajetória sem linhas e sem recibo vazio_confirmado em verificacao_campos.historico_politico",
      })
    }

    for (const item of linha.textos_publicos ?? []) {
      if (containsTseTechnicalMarker(item.texto)) {
        violacoes.push({
          slug: linha.slug,
          regra: "R6_marcador_tse",
          detalhe: `${item.campo} contém marcador técnico do TSE`,
        })
      }
      if (PUBLIC_INTERNAL_VOCABULARY_RE.test(item.texto)) {
        violacoes.push({
          slug: linha.slug,
          regra: "R7_vocabulario_interno",
          detalhe: `${item.campo} contém carimbo ou vocabulário interno`,
        })
      }
    }
  }

  return violacoes
}

function lerFlag(nome: string): string | undefined {
  const prefixo = `--${nome}=`
  const arg = process.argv.find((a) => a.startsWith(prefixo))
  return arg?.slice(prefixo.length)
}

async function carregarLinhas(): Promise<LinhaSuperficie[]> {
  const doArquivo = lerFlag("from-snapshot")
  if (doArquivo) {
    const bruto = JSON.parse(readFileSync(resolve(process.cwd(), doArquivo), "utf8"))
    // Aceita tanto o array puro quanto a linha única {snapshot: [...]} do psql.
    if (Array.isArray(bruto)) return bruto as LinhaSuperficie[]
    if (bruto && Array.isArray(bruto.snapshot)) return bruto.snapshot as LinhaSuperficie[]
    throw new Error(`snapshot em ${doArquivo} não é array nem {snapshot: []}`)
  }

  const sql = readFileSync(
    resolve(import.meta.dirname, "superficie-snapshot.sql"),
    "utf8",
  )
  const token = resolverToken()
  const ref = process.env.SUPABASE_PROJECT_REF || PROJECT_REF_PADRAO
  const linhas = await consultar<{ snapshot: LinhaSuperficie[] }>(sql, ref, token)
  return linhas[0]?.snapshot ?? []
}

/**
 * O gate é duro apenas na coorte já promovida ao padrão do relançamento
 * (coorte-superficie.json; começa nos 13 e cresce estado a estado na Onda G).
 * Ficha pública fora da coorte é o backlog conhecido dos consertos das 153:
 * vira resumo informativo, nunca falha, porque gate que reprova toda semana
 * pelo mesmo backlog vira ruído e morre ignorado (lição do link-check 10/08).
 */
export function separarPorCoorte(
  violacoes: Violacao[],
  coorte: ReadonlySet<string>,
): { dentro: Violacao[]; fora: Violacao[] } {
  const dentro: Violacao[] = []
  const fora: Violacao[] = []
  for (const v of violacoes) {
    const regraGlobal =
      v.regra === "R6_marcador_tse" ||
      v.regra === "R7_vocabulario_interno" ||
      v.regra === "R8_reversao_mesmo_ano" ||
      v.regra === "R9_cadeia_quebrada" ||
      v.regra === "R11_foto_placeholder"
    const destino = regraGlobal || coorte.has(v.slug) ? dentro : fora
    destino.push(v)
  }
  return { dentro, fora }
}

/**
 * Decide as falhas do gate sem alterar o resultado operacional por coorte.
 * `strictAll` promove o backlog fora da coorte e os avisos a falhas, útil para
 * uma execução explícita de saneamento completo.
 */
export function avaliarFalhasDoGate(
  violacoes: Violacao[],
  avisos: AvisoIntegridade[],
  coorte: ReadonlySet<string>,
  strictAll = false,
): {
  dentro: Violacao[]
  fora: Violacao[]
  falhas: Array<Violacao | AvisoIntegridade>
  avisos: AvisoIntegridade[]
} {
  const { dentro, fora } = separarPorCoorte(violacoes, coorte)
  return {
    dentro,
    fora,
    avisos,
    falhas: strictAll ? [...dentro, ...fora, ...avisos] : dentro,
  }
}

function carregarCoorte(): Set<string> {
  const bruto = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "coorte-superficie.json"), "utf8"),
  )
  if (!Array.isArray(bruto.slugs) || bruto.slugs.length === 0) {
    throw new Error("coorte-superficie.json sem slugs; coorte vazia seria gate cego")
  }
  return new Set(bruto.slugs as string[])
}

async function main() {
  const linhas = await carregarLinhas()
  const fichasPublicas = contarFichasPublicas(linhas)

  if (fichasPublicas === 0) {
    console.error("audit:superficie: snapshot vazio (zero candidato público). Consulta cega, reprovando.")
    process.exit(1)
  }

  const coorte = carregarCoorte()
  const violacoes = avaliarSuperficie(linhas)
  const avisos = [
    ...avaliarIntegridadePartidaria(linhas).avisos,
    ...avaliarFotosSuperficie(linhas).avisos,
  ]
  const strictAll = process.argv.includes("--strict-all")
  const { dentro, fora, falhas } = avaliarFalhasDoGate(violacoes, avisos, coorte, strictAll)
  const jsonOut = lerFlag("json")
  if (jsonOut) {
    writeFileSync(
      resolve(process.cwd(), jsonOut),
      JSON.stringify(
        {
          candidatos: linhas.length,
          fichas_publicas: fichasPublicas,
          coorte: coorte.size,
          strict_all: strictAll,
          violacoes_coorte: dentro,
          backlog_fora_da_coorte: fora,
          avisos_superficie: avisos,
          falhas_gate: falhas,
        },
        null,
        2,
      ),
    )
  }

  console.log(
    `audit:superficie: ${linhas.length} candidatos avaliados (${fichasPublicas} fichas públicas; ${strictAll ? "gate strict-all" : `coorte dura: ${coorte.size}`}).`,
  )

  if (avisos.length > 0) {
    console.warn(`${avisos.length} aviso(s) de integridade da superfície:`)
    for (const aviso of avisos) {
      console.warn(`  [${aviso.regra}] ${aviso.slug}: ${aviso.detalhe}`)
    }
  }

  if (fora.length > 0) {
    const porRegra = new Map<string, number>()
    for (const v of fora) porRegra.set(v.regra, (porRegra.get(v.regra) ?? 0) + 1)
    const fichas = new Set(fora.map((v) => v.slug)).size
    const resumo = [...porRegra.entries()].map(([r, n]) => `${r}=${n}`).join(", ")
    console.log(
      strictAll
        ? `Violações fora da coorte (strict-all): ${fora.length} em ${fichas} fichas legadas (${resumo}).`
        : `Backlog fora da coorte (informativo, não reprova): ${fora.length} violações em ${fichas} fichas legadas (${resumo}).`,
    )
  }

  if (strictAll && avisos.length > 0) {
    console.error(`${avisos.length} aviso(s) promovido(s) a falha por --strict-all.`)
  }

  if (falhas.length === 0 && (!strictAll || avisos.length === 0)) {
    console.log("Superfície íntegra: R1-R5 na coorte, R6-R9 e R11 globais, R10 e foto nula como avisos.")
    return
  }

  console.error(`${falhas.length} violação(ões)${strictAll ? " (strict-all)" : " NA COORTE"}:`)
  for (const v of falhas) {
    console.error(`  [${v.regra}] ${v.slug}: ${v.detalhe}`)
  }
  process.exit(1)
}

if (import.meta.filename === process.argv[1]) {
  main().catch((erro) => {
    console.error("audit:superficie falhou:", erro instanceof Error ? erro.message : erro)
    process.exit(1)
  })
}
