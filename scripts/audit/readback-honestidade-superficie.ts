/**
 * Readback das duas afirmações falsas da superfície pública (2026-08-10).
 *
 * Só leitura, sobre as 194 fichas de `candidatos_publico`. Renderiza os
 * componentes REAIS sobre o payload que o browser recebe e confere o DOM, no
 * mesmo padrão de `readback-patrimonio-eleicoes.ts`: medir a função e concluir
 * que a tela está certa foi o erro que aquele script existe para não repetir.
 *
 * ## O que é medido
 *
 * 1. **Financiamento afirma ausência sem ter verificado.** A aba Dinheiro
 *    escrevia "Não há registros de financiamento de campanha para este
 *    candidato no TSE" sempre que a ficha não tinha linha, inclusive quando o
 *    TSE publica. Provado falso em `flavio-bolsonaro` 2002 (R$ 5.988,00) e
 *    `cabo-daciolo` 2006 (R$ 1.259,44) e 2008 (R$ 720,00).
 * 2. **Pleito disputado sem dado sumia da aba.** Sem estado por pleito, a ficha
 *    mostrava os anos com valor e calava sobre os outros. O leitor não
 *    distinguia "não existe" de "não coletamos".
 * 3. **Judicial afirma que a busca não foi feita, quando foi.** O card de
 *    overview escrevia a legenda "não verificado" para ficha que TEM linha de
 *    `processos-curadoria` registrada, ou seja, para quem foi buscado e não
 *    teve identidade fechada. Vale para as 7 indeterminadas da curadoria de
 *    10/08 (`cabo-daciolo`, `edmilson-costa`, `samara-martins`, `jayme-campos`,
 *    `joao-campos`, `marcelo-maranata`, `raquel-lyra`) e para as demais fichas
 *    com busca registrada e sem processo publicável.
 *
 * A verdade de referência é o banco: linha em `financiamento_publico` deve sair
 * como pleito publicado; ano de candidatura disputada sem linha deve aparecer
 * com estado explícito; ficha com linha em `coleta_log_ultima` para a fonte
 * `processos-curadoria` NUNCA pode ler "não verificado".
 *
 * Uso: npx tsx scripts/audit/readback-honestidade-superficie.ts [--json=caminho]
 *      [--slugs=a,b,c]
 */
import { writeFileSync } from "node:fs"
// `createElement` em vez de JSX porque `scripts/` está fora do tsconfig.
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { supabase } from "../lib/supabase"
import { toPublicCandidatoProfileDto } from "../../src/lib/public-profile-dto"
import { anosDePleitoDisputado } from "../../src/lib/pleitos-disputados"
import { normalizeHistoricoPoliticoForDisplay } from "../../src/lib/historico-dedupe"
import { normalizePatrimonioForDisplay } from "../../src/lib/person-level-dedupe"
import { CandidatoProfile } from "../../src/components/CandidatoProfile"
import type {
  FichaCandidato,
  Financiamento,
  HistoricoPolitico,
  Patrimonio,
  PatrimonioAusenciaOficial,
  Processo,
  SancoesVerificacao,
} from "../../src/lib/types"

/** A frase que afirmava ausência no TSE sem nenhuma consulta ao TSE. */
const FRASE_AUSENCIA_NAO_VERIFICADA =
  "Não há registros de financiamento de campanha para este candidato no TSE"

/** A legenda que dizia "ninguém buscou" para ficha que foi buscada. */
const LEGENDA_NAO_VERIFICADO = "não verificado"

async function todas<T>(tabela: string, colunas: string): Promise<T[]> {
  const linhas: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data?.length) break
    linhas.push(...(data as unknown as T[]))
    if (data.length < 1000) break
  }
  return linhas
}

/**
 * A aba entra por `next/dynamic`, que é `React.lazy` por baixo: o primeiro
 * passe síncrono só alcança o fallback. Sem isto o readback mediria o esqueleto
 * de carregamento e concluiria que a aba não mostra nada.
 */
async function renderizarAba(
  ficha: FichaCandidato,
  aba: "dinheiro" | "geral" | "justica",
): Promise<string> {
  await import("../../src/components/CandidatoProfileSections")
  let html = ""
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    html = renderToStaticMarkup(createElement(CandidatoProfile, { ficha, initialTab: aba }))
    if (!html.includes("animate-pulse")) return html
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`aba ${aba}: render permaneceu no esqueleto após 4 tentativas`)
}

/** Anos de pleito que o DOM marca na aba Dinheiro, por estado. */
function anosDeFinanciamentoNoDom(html: string): Map<number, string> {
  const out = new Map<number, string>()
  const re =
    /data-pf-financiamento-eleicao="(\d{4})"\s+data-pf-financiamento-eleicao-estado="([a-z_]+)"/g
  for (const match of html.matchAll(re)) out.set(Number(match[1]), match[2]!)
  return out
}

/** Uma ausência afirmada só é honesta com fonte E data visíveis na mesma linha. */
function anosComFonteEData(html: string): Set<number> {
  const out = new Set<number>()
  const blocos = html.split("data-pf-financiamento-eleicao=").slice(1)
  for (const bloco of blocos) {
    const ano = Number(bloco.slice(1, 5))
    if (!Number.isFinite(ano)) continue
    const corpo = bloco.split("data-pf-financiamento-eleicao=")[0]!
    if (corpo.includes("Verificado em") && corpo.includes("Fonte oficial")) out.add(ano)
  }
  return out
}

/** Anos com cartão de valor publicado (o cartão carrega o id da linha). */
function anosPublicadosNoDom(html: string, idParaAno: Map<string, number>): Set<number> {
  const out = new Set<number>()
  for (const match of html.matchAll(/data-pf-timeline-ref="financiamento-([^"]+)"/g)) {
    const ano = idParaAno.get(match[1]!)
    if (ano != null) out.add(ano)
  }
  return out
}

/** Legenda do card de processos no overview (o `sub` do StatCard). */
function legendaProcessosNoDom(html: string): string | null {
  const idx = html.indexOf('data-pf-overview-processos=')
  if (idx < 0) return null
  const trecho = html.slice(idx, idx + 1200)
  const marca = trecho.match(/>([^<>]*verificad[^<>]*|[^<>]*identidade[^<>]*|[^<>]*escopo[^<>]*)</i)
  return marca?.[1]?.trim() ?? null
}

interface DefeitoFicha {
  slug: string
  motivos: string[]
  pleitosOmitidos: number[]
  legendaProcessos: string | null
}

async function main() {
  const args = process.argv.slice(2)
  const saida = args.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null
  const filtro = args.find((a) => a.startsWith("--slugs="))?.split("=")[1]?.split(",") ?? null

  const candidatos = await todas<Record<string, unknown> & { id: string; slug: string }>(
    "candidatos_publico",
    "*",
  )
  const historico = await todas<HistoricoPolitico & { despublicado_em?: string | null }>(
    "historico_politico",
    "*",
  )
  const patrimonio = await todas<Patrimonio & { candidato_id: string }>("patrimonio", "*")
  const financiamento = await todas<Financiamento & { candidato_id: string }>(
    "financiamento_publico",
    "*",
  )
  const processos = await todas<Processo & { candidato_id: string }>("processos", "*")
  let ausencias: Array<PatrimonioAusenciaOficial & { candidato_id: string }> = []
  try {
    ausencias = await todas<PatrimonioAusenciaOficial & { candidato_id: string }>(
      "patrimonio_ausencia_oficial",
      "*",
    )
  } catch {
    ausencias = []
  }
  const coleta = await todas<{ alvo: string; fonte: string; resultado: string; executado_em: string }>(
    "coleta_log_ultima",
    "alvo, fonte, resultado, executado_em",
  )
  const verificacaoPorSlug = new Map<string, SancoesVerificacao>()
  for (const linha of coleta) {
    if (linha.fonte !== "processos-curadoria") continue
    verificacaoPorSlug.set(linha.alvo, {
      resultado: linha.resultado as SancoesVerificacao["resultado"],
      executado_em: linha.executado_em,
    })
  }

  const porCand = <T extends { candidato_id: string }>(lista: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of lista) m.set(x.candidato_id, [...(m.get(x.candidato_id) ?? []), x])
    return m
  }
  const historicoPor = porCand(historico.filter((h) => h.despublicado_em == null))
  const patrimonioPor = porCand(patrimonio)
  const financiamentoPor = porCand(financiamento)
  const processosPor = porCand(processos)
  const ausenciasPor = porCand(ausencias)

  const alvo = filtro ? candidatos.filter((c) => filtro.includes(c.slug)) : candidatos

  let fichasQueAfirmamAusenciaSemVerificar = 0
  let fichasComPleitoOmitido = 0
  let pleitosOmitidos = 0
  let pleitosSemDadoNoUniverso = 0
  let pleitosSemDadoComEstadoExplicito = 0
  let ausenciasAfirmadasComFonteEData = 0
  let ausenciasAfirmadas = 0
  let fichasComBuscaJudicialRegistradaQueLeemNaoVerificado = 0
  let fichasComBuscaJudicialRegistradaSemProcesso = 0
  const defeitos: DefeitoFicha[] = []
  const NOMEADOS = [
    "flavio-bolsonaro",
    "cabo-daciolo",
    "rui-costa-pimenta",
    "samara-martins",
    "edmilson-costa",
    "jayme-campos",
    "joao-campos",
    "marcelo-maranata",
    "raquel-lyra",
  ]
  const nomeados: Record<string, unknown> = {}

  for (const c of alvo) {
    const h = normalizeHistoricoPoliticoForDisplay(historicoPor.get(c.id) ?? [])
    const pat = normalizePatrimonioForDisplay(patrimonioPor.get(c.id) ?? [])
    const fin = financiamentoPor.get(c.id) ?? []
    const proc = processosPor.get(c.id) ?? []
    const verificacao = verificacaoPorSlug.get(c.slug) ?? null

    const fichaServidor = {
      ...c,
      historico: h,
      patrimonio: pat,
      patrimonio_ausencias_oficiais: ausenciasPor.get(c.id) ?? [],
      financiamento: fin,
      processos: proc,
      total_processos: proc.length,
      processos_verificacao: verificacao,
      mudancas_partido: [],
      votos: [],
      pontos_atencao: [],
      projetos_lei: [],
      legislacao_mandato_executivo: [],
      gastos_parlamentares: [],
      sancoes_administrativas: [],
      noticias: [],
      indicadores_estaduais: [],
    } as unknown as FichaCandidato

    // Byte a byte o que o browser recebe de `/api/candidato-profile/[slug]`.
    const fichaCliente = toPublicCandidatoProfileDto(fichaServidor) as unknown as FichaCandidato

    const htmlDinheiro = await renderizarAba(fichaCliente, "dinheiro")
    const htmlGeral = await renderizarAba(fichaCliente, "geral")

    const motivos: string[] = []

    // --- Defeito 1: a frase que afirma ausência no TSE sem consultar o TSE ---
    const afirmaAusencia = htmlDinheiro.includes(FRASE_AUSENCIA_NAO_VERIFICADA)
    if (afirmaAusencia) {
      fichasQueAfirmamAusenciaSemVerificar += 1
      motivos.push("financiamento_afirma_ausencia_sem_verificar")
    }

    // --- Defeito 1b: pleito disputado que some da aba ---
    const anosComLinha = new Set(fin.map((f) => f.ano_eleicao))
    const anosAplicaveis = anosDePleitoDisputado(fichaCliente.historico ?? [])
    const idParaAno = new Map(
      (fichaCliente.financiamento ?? []).map((f) => [f.id, f.ano_eleicao] as const),
    )
    const domPublicados = anosPublicadosNoDom(htmlDinheiro, idParaAno)
    const domEstados = anosDeFinanciamentoNoDom(htmlDinheiro)
    const domComProva = anosComFonteEData(htmlDinheiro)

    const omitidos: number[] = []
    for (const ano of [...anosAplicaveis].sort((a, b) => b - a)) {
      if (anosComLinha.has(ano)) continue
      pleitosSemDadoNoUniverso += 1
      const estado = domEstados.get(ano) ?? null
      if (estado == null) {
        omitidos.push(ano)
        continue
      }
      pleitosSemDadoComEstadoExplicito += 1
      // Estado que AFIRMA ausência tem de mostrar fonte e data.
      if (estado === "vazio_confirmado" || estado === "fora_da_serie_oficial") {
        ausenciasAfirmadas += 1
        if (domComProva.has(ano)) ausenciasAfirmadasComFonteEData += 1
        else motivos.push(`ausencia_afirmada_sem_fonte_e_data:${ano}`)
      }
    }
    if (omitidos.length > 0) {
      fichasComPleitoOmitido += 1
      pleitosOmitidos += omitidos.length
      motivos.push("pleito_disputado_omitido_da_aba_dinheiro")
    }

    // Linha com dado tem de continuar aparecendo: a correção não pode esconder.
    for (const ano of anosComLinha) {
      if (!domPublicados.has(ano)) motivos.push(`linha_publicada_sumiu_do_dom:${ano}`)
    }

    // --- Defeito 2: judicial diz "não verificado" para quem foi buscado ---
    const legenda = legendaProcessosNoDom(htmlGeral)
    if (verificacao != null && proc.length === 0) {
      fichasComBuscaJudicialRegistradaSemProcesso += 1
      if (legenda != null && legenda.toLowerCase().includes(LEGENDA_NAO_VERIFICADO)) {
        fichasComBuscaJudicialRegistradaQueLeemNaoVerificado += 1
        motivos.push("judicial_diz_nao_verificado_com_busca_registrada")
      }
    }

    if (motivos.length > 0) {
      defeitos.push({ slug: c.slug, motivos, pleitosOmitidos: omitidos, legendaProcessos: legenda })
    }

    if (NOMEADOS.includes(c.slug)) {
      nomeados[c.slug] = {
        financiamento_no_banco: [...anosComLinha].sort((a, b) => b - a),
        pleitos_aplicaveis: [...anosAplicaveis].sort((a, b) => b - a),
        dom_publicados: [...domPublicados].sort((a, b) => b - a),
        dom_estados: [...domEstados]
          .sort((a, b) => b[0] - a[0])
          .map(([ano, estado]) => ({ ano, estado, fonte_e_data: domComProva.has(ano) })),
        afirma_ausencia_sem_verificar: afirmaAusencia,
        processos_verificacao: verificacao,
        legenda_processos: legenda,
        motivos,
      }
    }
  }

  const resumo = {
    universo: { fichasPublicas: candidatos.length, fichasMedidas: alvo.length },
    defeito1_financiamento: {
      fichasQueAfirmamAusenciaSemVerificar,
      fichasComPleitoDisputadoOmitido: fichasComPleitoOmitido,
      pleitosDisputadosOmitidos: pleitosOmitidos,
      pleitosSemDadoNoUniverso,
      pleitosSemDadoComEstadoExplicito,
      ausenciasAfirmadas,
      ausenciasAfirmadasComFonteEData,
    },
    defeito2_judicial: {
      fichasComBuscaRegistradaSemProcesso: fichasComBuscaJudicialRegistradaSemProcesso,
      fichasQueLeemNaoVerificadoMesmoAssim: fichasComBuscaJudicialRegistradaQueLeemNaoVerificado,
    },
    porMotivo: defeitos
      .flatMap((d) => d.motivos.map((m) => m.split(":")[0]!))
      .reduce<Record<string, number>>((acc, m) => ({ ...acc, [m]: (acc[m] ?? 0) + 1 }), {}),
    casosNomeados: nomeados,
    fichasAfetadas: defeitos.map((d) => d.slug),
  }

  console.log(JSON.stringify(resumo, null, 2))
  if (saida) {
    writeFileSync(saida, JSON.stringify({ resumo, defeitos }, null, 2))
    console.log(`\nDetalhe em ${saida}`)
  }

  const falhas =
    fichasQueAfirmamAusenciaSemVerificar +
    fichasComPleitoOmitido +
    fichasComBuscaJudicialRegistradaQueLeemNaoVerificado +
    (ausenciasAfirmadas - ausenciasAfirmadasComFonteEData)
  if (falhas > 0) {
    console.error(
      `\nFALHA: ${fichasQueAfirmamAusenciaSemVerificar} ficha(s) afirmam ausência de financiamento sem verificar, ` +
        `${fichasComPleitoOmitido} escondem pleito disputado, ` +
        `${fichasComBuscaJudicialRegistradaQueLeemNaoVerificado} dizem "não verificado" com busca judicial registrada, ` +
        `${ausenciasAfirmadas - ausenciasAfirmadasComFonteEData} ausência(s) afirmadas sem fonte e data.`,
    )
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
