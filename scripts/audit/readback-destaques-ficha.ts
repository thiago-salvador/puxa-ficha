/**
 * Readback dos itens 4 e 14: quantas fichas a aba Destaques mostra com
 * conteúdo, quanto vem de cada fonte, e por que as vazias estão vazias.
 *
 * Só leitura, e sobre `candidatos_publico`.
 *
 * ## Por que este script renderiza o componente de verdade
 *
 * A rodada anterior media uma coisa e a ficha exibia outra: o readback montava
 * patrimônio por um caminho próprio e passava votos crus, sem o join da
 * votação-chave, enquanto a superfície consumia a saída canônica de
 * `buildPatrimonioEleicoes` e votos com join. Número que não é o número da
 * tela não é medição, é coincidência.
 *
 * Agora o readback monta a entrada na MESMA forma que `CandidatoProfile` monta,
 * chama `montarDestaquesDaFicha` e, para cada ficha, renderiza a aba Destaques
 * do componente REAL com `renderToStaticMarkup`, contando os itens marcados no
 * DOM. Se `totalExibido` divergir da contagem do DOM em qualquer ficha, o
 * script sai com exit 1: item contado sem card visível é o defeito que o
 * bloqueio de 10/08 apontou, e ele não pode voltar em silêncio.
 *
 * Uso: npx tsx scripts/audit/readback-destaques-ficha.ts [--json=caminho]
 *      npx tsx scripts/audit/readback-destaques-ficha.ts --simular-proveniencia
 *      npx tsx scripts/audit/readback-destaques-ficha.ts --simular-trajetoria-tse-8
 */
import { writeFileSync } from "node:fs"
import { readFileSync } from "node:fs"
// `createElement` em vez de JSX porque `scripts/` está fora do tsconfig, e sem
// ele o transform cai no JSX clássico e quebra em "React is not defined".
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { supabase } from "../lib/supabase"
import { montarDestaquesDaFicha } from "../../src/lib/destaques-ficha"
import { buildPatrimonioEleicoes } from "../../src/lib/public-profile-dto"
import { normalizeHistoricoPoliticoForDisplay } from "../../src/lib/historico-dedupe"
import { normalizePatrimonioForDisplay } from "../../src/lib/person-level-dedupe"
import { CandidatoProfile } from "../../src/components/CandidatoProfile"
import { assinaturaConteudoDestaques } from "./lib/destaques-proof"
import type {
  FichaCandidato,
  HistoricoPolitico,
  Patrimonio,
  PatrimonioAusenciaOficial,
  PontoAtencao,
  Processo,
  SancaoAdministrativa,
  SancoesVerificacao,
  VotacaoChave,
  VotoCandidato,
} from "../../src/lib/types"

const SENADO_EXATO_SQL = "supabase/migrations/20260811100000_votacoes_senado_chave_exata.sql"
const PROCESSOS_LEGADOS_PROJETADOS: Record<string, { acao: "atualizar" | "despublicar"; numero?: string; url?: string; tribunal?: string; tipo?: string; status?: string; fonte?: string }> = {
  "9b4b48fa-3b1b-48fb-a195-b6e4139c7a9d": { acao: "atualizar", numero: "HC 201965", url: "https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=477496&ori=1", tribunal: "STF", status: "anulado_parcialmente", fonte: "STF" },
  "18050e24-bd22-43b1-88ac-d3710bcedaf3": { acao: "atualizar", numero: "TC 008.761/2020-5", url: "https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/1089/2025/Plen%C3%A1rio", tribunal: "TCU", tipo: "procedural", status: "comunicacao_processual_publicada_merito_nao_inferido", fonte: "TCU - Acórdão 1089/2025-Plenário" },
  "a964addf-bab0-40cc-88c0-9dd859869fe1": { acao: "atualizar", numero: "0000017-45.2016.6.26.0001", url: "https://www.tre-sp.jus.br/comunicacao/noticias/2021/Julho/tre-absolve-fernando-haddad-por-ausencia-de-provas-de-falsidade-ideologica-eleitoral", tribunal: "TRE-SP", status: "absolvido", fonte: "TRE-SP" },
  "233d3564-008e-44a4-8f4a-93de8e8fe9ae": { acao: "atualizar", numero: "0607928-52.2022.6.26.0000", url: "https://www.tse.jus.br/comunicacao/radio/2024/Fevereiro/direto-do-plenario-tse-mantem-multa-a-fernando-haddad-por-propaganda-irregular-em-2022", tribunal: "TSE", status: "condenado", fonte: "TSE" },
  "e2252a89-90f1-4700-a473-b63522443215": { acao: "atualizar", numero: "43.0719.0000337/2020-0", url: "https://www.mpsp.mp.br/w/di%C3%A1rio-oficial-mpsp-12/09/2020", tribunal: "MPSP", tipo: "procedural", status: "comunicacao_processual_publicada_merito_nao_inferido", fonte: "MPSP" },
  "75292421-804d-435c-8982-34054dd49bcf": { acao: "despublicar" },
}

function votosSenadoProjetados(): Array<{ votacaoId: string; slug: string; voto: string }> {
  const sql = readFileSync(SENADO_EXATO_SQL, "utf8")
  const linhas = [...sql.matchAll(/\('([0-9a-f-]{36})'::uuid, '([^']+)', '(sim|não)'\)/g)]
    .map((match) => ({ votacaoId: match[1], slug: match[2], voto: match[3] }))
  if (linhas.length !== 75) throw new Error(`projeção Senado divergente: ${linhas.length}/75 pares`)
  return linhas
}

interface ColetaLogRow {
  candidato_id: string | null
  fonte: string
  resultado: SancoesVerificacao["resultado"]
  executado_em: string
  detalhe: string | null
  url: string | null
}

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

/** Atributos de card que a aba Destaques emite, um por item contado. */
const MARCADORES_DE_ITEM = [
  "data-pf-ponto-destaque",
  "data-pf-sancao-destaque",
  "data-pf-processo-destaque",
  "data-pf-mandato-destaque",
  "data-pf-patrimonio-destaque",
  "data-pf-votacao-destaque",
] as const

function contarItensNoDom(html: string): number {
  let total = 0
  for (const marcador of MARCADORES_DE_ITEM) {
    total += html.split(`${marcador}=`).length - 1
  }
  return total
}

/**
 * Cards de mandato SEM proveniência efetiva no DOM.
 *
 * A coluna `proveniencia` é nula em linha legada, e ler a coluna crua fazia o
 * card omitir a fonte. Aqui a conferência é sobre o HTML servido: todo card de
 * mandato precisa carregar `data-pf-mandato-proveniencia` com valor não vazio.
 */
function mandatosSemProvenienciaNoDom(html: string): number {
  const cards = html.split("data-pf-mandato-destaque=").length - 1
  const comProveniencia = (html.match(/data-pf-mandato-proveniencia="[^"]+"/g) ?? []).length
  return cards - comProveniencia
}

async function main() {
  const saida = process.argv.slice(2).find((a) => a.startsWith("--json="))?.split("=")[1] ?? null
  const esperarEstadoFinal = process.argv.includes("--expect-final")
  const simularProveniencia = process.argv.includes("--simular-proveniencia")
  const simularTrajetoriaTse8 = process.argv.includes("--simular-trajetoria-tse-8")
  const caminhoSimulacao = process.argv.slice(2).find((a) => a.startsWith("--simular-estados="))?.split("=")[1] ?? null
  if ([simularProveniencia, simularTrajetoriaTse8, Boolean(caminhoSimulacao)].filter(Boolean).length > 1) {
    throw new Error("simulações incompatíveis: escolha somente uma")
  }
  const estadosSimulados = new Map<string, SancoesVerificacao>()
  if (caminhoSimulacao) {
    const manifesto = JSON.parse(readFileSync(caminhoSimulacao, "utf8")) as {
      persistencia: Array<{ slug: string; fonte_log: string; resultado: SancoesVerificacao["resultado"]; executado_em: string; detalhe: string; url: string | null }>
    }
    for (const item of manifesto.persistencia) {
      estadosSimulados.set(`${item.slug}:${item.fonte_log}`, {
        fonte: item.fonte_log,
        resultado: item.resultado,
        executado_em: item.executado_em,
        detalhe: item.detalhe,
        url: item.url,
      })
    }
  }
  const slugsTrajetoriaTse8 = new Set([
    "andre-marinho",
    "dr-luisinho",
    "henrique-areas",
    "izadora-dias",
    "jose-estevao",
    "luan-monteiro",
    "preta-lu",
    "samara-mineiro",
  ])
  const slugsPatrimonio2026Positivo = new Set([
    "andre-marinho", "cleber-rabelo", "efraim-filho", "geraldo-carvalho", "ivan-moraes",
    "jose-estevao", "joao-campos", "joel-rodrigues", "raquel-lyra", "samara-mineiro",
  ])
  const slugsPatrimonio2026SemAusencia = new Set([...slugsPatrimonio2026Positivo, "dr-luisinho", "preta-lu"])
  let trajetoriasTse8Projetadas = 0

  /**
   * Universo PÚBLICO, e a distinção não é detalhe: `candidatos` tem 280 linhas
   * e `candidatos_publico` tem 194. Medir os 280 conta fichas que a ficha
   * pública nunca mostra, e foi o erro da primeira rodada deste readback.
   */
  const candidatos = await todas<Record<string, unknown> & { id: string; slug: string }>(
    "candidatos_publico",
    "*"
  )
  const pontos = await todas<PontoAtencao & { visivel?: boolean }>("pontos_atencao", "*")
  const sancoes = await todas<SancaoAdministrativa>("sancoes_administrativas", "*")
  const processos = await todas<Processo>("processos", "*")
  const historico = await todas<HistoricoPolitico>("historico_politico", "*")
  const patrimonio = await todas<Patrimonio>("patrimonio", "*")
  /**
   * Mesma degradação de `src/lib/api.ts`: a tabela pode não existir ainda
   * (migration 20260807181000 não aplicada), e ausência de tabela não é fato
   * sobre o candidato.
   */
  let ausencias: Array<PatrimonioAusenciaOficial & { candidato_id: string }> = []
  try {
    ausencias = await todas<PatrimonioAusenciaOficial & { candidato_id: string }>(
      "patrimonio_ausencia_oficial",
      "*"
    )
  } catch {
    ausencias = []
  }
  const votos = await todas<VotoCandidato>("votos_candidato", "*")
  const votacoes = await todas<VotacaoChave>("votacoes_chave", "*")

  const porCand = <T extends { candidato_id: string }>(lista: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of lista) m.set(x.candidato_id, [...(m.get(x.candidato_id) ?? []), x])
    return m
  }
  const pontosPor = porCand(pontos.filter((p) => p.visivel !== false))
  const sancoesPor = porCand(sancoes)
  const processosPor = porCand(processos)
  const processosProjetados = processos
    .filter((processo) => PROCESSOS_LEGADOS_PROJETADOS[processo.id]?.acao !== "despublicar")
    .map((processo): Processo => {
      const projecao = PROCESSOS_LEGADOS_PROJETADOS[processo.id]
      if (!projecao) return processo
      return {
      ...processo,
      numero_processo: projecao.numero,
      url_fonte: projecao.url,
      tribunal: projecao.tribunal ?? processo.tribunal,
      tipo: projecao.tipo ?? processo.tipo,
      status: projecao.status ?? processo.status,
      fonte: projecao.fonte ?? processo.fonte,
      } as Processo
    })
  const processosProjetadosPor = porCand(processosProjetados)
  const historicoPor = porCand(historico)
  const patrimonioPor = porCand(patrimonio)
  const ausenciasPor = porCand(ausencias)

  /**
   * Join da votação-chave, exatamente o que a ficha recebe. Sem ele, todo voto
   * chegava sem `votacao` e a fonte "votações" media zero em qualquer ficha.
   */
  const votacaoPorId = new Map(votacoes.map((v) => [v.id, v]))
  const votosPor = porCand(
    votos.map((v) => ({ ...v, votacao: votacaoPorId.get(v.votacao_id) ?? undefined }))
  )
  const votosProjetadosPor = new Map<string, VotoCandidato[]>()
  if (caminhoSimulacao) {
    const candidatoPorSlug = new Map(candidatos.map((c) => [c.slug, c]))
    for (const [indice, item] of votosSenadoProjetados().entries()) {
      const candidato = candidatoPorSlug.get(item.slug)
      if (!candidato) continue // a migration também aceita slugs fora da coorte pública atual
      const votacao = votacaoPorId.get(item.votacaoId)
      if (!votacao) throw new Error(`votação Senado ausente na projeção: ${item.votacaoId}`)
      const linha = {
        id: `projecao-senado-${indice}`,
        candidato_id: candidato.id,
        votacao_id: item.votacaoId,
        voto: item.voto,
        votacao: { ...votacao, fonte: "senado" },
      } as unknown as VotoCandidato
      votosProjetadosPor.set(candidato.id, [...(votosProjetadosPor.get(candidato.id) ?? []), linha])
    }
    if (votosProjetadosPor.size !== 14) {
      throw new Error(`projeção Senado pública divergente: ${votosProjetadosPor.size}/14 fichas`)
    }
  }

  // A proveniência vem da view que a ficha já consome.
  const verif = new Map<string, SancoesVerificacao>()
  const log = await todas<ColetaLogRow>(
    "coleta_log_ultima",
    "candidato_id, fonte, resultado, executado_em, detalhe, url",
  )
  for (const l of log) {
    if (!l.candidato_id) continue
    verif.set(`${l.candidato_id}:${l.fonte}`, {
      fonte: l.fonte,
      resultado: l.resultado,
      executado_em: l.executado_em,
      detalhe: l.detalhe ?? null,
      url: l.url ?? null,
    })
  }

  let antesComConteudo = 0
  let depoisComConteudo = 0
  let vazioHonesto = 0
  let vazioPorNaoVerificado = 0
  const ganharam: string[] = []
  const porFonte = {
    pontos_atencao: 0,
    sancoes: 0,
    processos: 0,
    mandatos: 0,
    patrimonio: 0,
    votacoes: 0,
  }
  const fichasPorFonte = {
    pontos_atencao: 0,
    sancoes: 0,
    processos: 0,
    mandatos: 0,
    patrimonio: 0,
    votacoes: 0,
  }
  const divergenciasDom: Array<{ slug: string; contado: number; noDom: number }> = []
  const semProveniencia: Array<{ slug: string; cards: number }> = []
  let mandatosComColunaNula = 0
  const estadosPorFonte: Record<string, Record<string, number>> = {}
  const vazias: string[] = []
  const vaziasDetalhe: Array<{
    slug: string
    fontes: Array<{ chave: string; estado: string }>
  }> = []
  const fichasDetalhe: Array<{
    slug: string
    assinaturaConteudo: string
    fontes: Array<{ chave: string; estado: string }>
  }> = []

  for (const c of candidatos) {
    const p = pontosPor.get(c.id) ?? []
    const s = sancoesPor.get(c.id) ?? []
    const pr = caminhoSimulacao ? (processosProjetadosPor.get(c.id) ?? []) : (processosPor.get(c.id) ?? [])
    /**
     * As MESMAS normalizações que `src/lib/api.ts` aplica antes de a ficha
     * receber os dados. Sem elas, o readback mede linhas que a superfície
     * dedupe e some, e a divergência aparece como número, não como defeito.
     */
    const h = normalizeHistoricoPoliticoForDisplay(historicoPor.get(c.id) ?? [])
    const pat = normalizePatrimonioForDisplay(patrimonioPor.get(c.id) ?? [])
    const aus = ausenciasPor.get(c.id) ?? []
    // 090100 remove os pares Câmara defeituosos; 090200 adiciona apenas as
    // chaves, sem pares; 111000 substitui integralmente os pares do Senado.
    // Portanto a projeção correta não pode reaproveitar os votos atuais.
    const vt = caminhoSimulacao ? (votosProjetadosPor.get(c.id) ?? []) : (votosPor.get(c.id) ?? [])
    if (p.length > 0) antesComConteudo++

    // MESMA montagem do componente: `buildPatrimonioEleicoes` é a canônica.
    let patrimonioEleicoes = buildPatrimonioEleicoes(pat, aus, h)
    const sancoesVerificacao = verif.get(`${c.id}:transparencia-sanctions`) ?? null
    const processosVerificacao = verif.get(`${c.id}:processos-curadoria`) ?? null
    let trajetoriaVerificacao = verif.get(`${c.id}:destaques-trajetoria`) ?? null
    let patrimonioVerificacao = verif.get(`${c.id}:destaques-patrimonio`) ?? null
    let votacoesVerificacao = verif.get(`${c.id}:destaques-votacoes`) ?? null

    trajetoriaVerificacao = estadosSimulados.get(`${c.slug}:destaques-trajetoria`) ?? trajetoriaVerificacao
    patrimonioVerificacao = estadosSimulados.get(`${c.slug}:destaques-patrimonio`) ?? patrimonioVerificacao
    votacoesVerificacao = estadosSimulados.get(`${c.slug}:destaques-votacoes`) ?? votacoesVerificacao

    // Projeção conjunta das migrations anteriores das quais o manifesto
    // residual depende. Não muda produção: só reconstrói o mesmo estado que a
    // ordem aplicável produzirá antes da 20260811101000.
    if (caminhoSimulacao) {
      if (slugsTrajetoriaTse8.has(c.slug)) {
        trajetoriaVerificacao = {
          fonte: "destaques-trajetoria",
          resultado: "sem_achado_no_escopo",
          executado_em: "2026-08-11T11:28:01.895Z",
          detalhe: "Recorte TSE-8 limitado aos pleitos conhecidos.",
          url: null,
        }
      }
      if (slugsPatrimonio2026SemAusencia.has(c.slug)) {
        patrimonioEleicoes = patrimonioEleicoes.filter((item) => item.ano !== 2026)
      }
      if (slugsPatrimonio2026Positivo.has(c.slug)) {
        patrimonioEleicoes = [
          ...patrimonioEleicoes,
          {
            ano: 2026,
            estado: "publicado",
            fonte_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip",
            verificado_em: "2026-08-11T02:33:31.000Z",
          },
        ]
      }
    }

    if (simularTrajetoriaTse8 && slugsTrajetoriaTse8.has(c.slug)) {
      trajetoriaVerificacao = {
        fonte: "destaques-trajetoria",
        resultado: "sem_achado_no_escopo",
        executado_em: "2026-08-11T11:28:01.895Z",
        detalhe:
          "Candidaturas com SQ_CANDIDATO versionado reconsultadas no TSE; recorte limitado aos pleitos conhecidos.",
        url: null,
      }
      trajetoriasTse8Projetadas++
    }

    if (simularProveniencia) {
      const preliminar = montarDestaquesDaFicha({
        pontosAtencao: p,
        sancoes: s,
        processos: pr,
        historico: h,
        patrimonioEleicoes,
        patrimonio: pat,
        votos: vt,
        sancoesVerificacao,
        processosVerificacao,
      })
      trajetoriaVerificacao = {
        fonte: "destaques-trajetoria",
        resultado: preliminar.mandatos.length > 0 ? "encontrado" : "vazio_confirmado",
        executado_em: "2026-08-10T18:00:00.000Z",
        detalhe: "Recorte de mandatos promovíveis auditado; nenhum card publicável.",
      }
      votacoesVerificacao = {
        fonte: "destaques-votacoes",
        resultado: preliminar.votacoes.length > 0 ? "encontrado" : "vazio_confirmado",
        executado_em: "2026-08-10T18:00:00.000Z",
        detalhe: "Recorte de votações-chave auditado; nenhum voto publicável.",
      }
    }

    const d = montarDestaquesDaFicha({
      pontosAtencao: p,
      sancoes: s,
      processos: pr,
      historico: h,
      patrimonioEleicoes,
      patrimonio: pat,
      votos: vt,
      sancoesVerificacao,
      processosVerificacao,
      trajetoriaVerificacao,
      patrimonioVerificacao,
      votacoesVerificacao,
    })

    if (d.totalExibido > 0) {
      depoisComConteudo++
      if (p.length === 0) ganharam.push(c.slug)
    }
    if (d.vazioHonesto) vazioHonesto++
    if (d.vazioPorNaoVerificado) vazioPorNaoVerificado++
    if (d.totalExibido === 0) {
      vazias.push(c.slug)
      vaziasDetalhe.push({
        slug: c.slug,
        fontes: d.fontes
          .filter((item) => item.categoria === "factual")
          .map((item) => ({ chave: item.chave, estado: item.estado.tipo })),
      })
    }
    for (const fonte of d.fontes.filter((item) => item.categoria === "factual")) {
      const porEstado = (estadosPorFonte[fonte.chave] ??= {})
      porEstado[fonte.estado.tipo] = (porEstado[fonte.estado.tipo] ?? 0) + 1
    }
    fichasDetalhe.push({
      slug: c.slug,
      assinaturaConteudo: assinaturaConteudoDestaques(d),
      fontes: d.fontes
        .filter((item) => item.categoria === "factual")
        .map((item) => ({ chave: item.chave, estado: item.estado.tipo })),
    })

    porFonte.pontos_atencao += d.pontosAtencao.length
    porFonte.sancoes += d.sancoesVigentes.length + d.sancoesExpiradas.length
    porFonte.processos += d.processos.length
    porFonte.mandatos += d.mandatos.length
    porFonte.patrimonio += d.patrimonioPublicado.length
    porFonte.votacoes += d.votacoes.length
    if (d.pontosAtencao.length) fichasPorFonte.pontos_atencao++
    if (d.sancoesVigentes.length + d.sancoesExpiradas.length) fichasPorFonte.sancoes++
    if (d.processos.length) fichasPorFonte.processos++
    if (d.mandatos.length) fichasPorFonte.mandatos++
    if (d.patrimonioPublicado.length) fichasPorFonte.patrimonio++
    if (d.votacoes.length) fichasPorFonte.votacoes++

    /**
     * Prova de que todo item contado tem elemento no DOM: renderiza a aba
     * Destaques do componente REAL, com a mesma ficha, e conta os marcadores.
     */
    const ficha = {
      ...c,
      pontos_atencao: p,
      sancoes_administrativas: s,
      processos: pr,
      historico: h,
      patrimonio: pat,
      patrimonio_ausencias_oficiais: aus,
      patrimonio_eleicoes: patrimonioEleicoes,
      votos: vt,
      sancoes_verificacao: sancoesVerificacao,
      processos_verificacao: processosVerificacao,
      trajetoria_verificacao: trajetoriaVerificacao,
      patrimonio_verificacao: patrimonioVerificacao,
      votacoes_verificacao: votacoesVerificacao,
    } as unknown as FichaCandidato
    const html = renderToStaticMarkup(
      createElement(CandidatoProfile, { ficha, initialTab: "alertas" })
    )
    const noDom = contarItensNoDom(html)
    if (noDom !== d.totalExibido) {
      divergenciasDom.push({ slug: c.slug, contado: d.totalExibido, noDom })
    }
    const orfaos = mandatosSemProvenienciaNoDom(html)
    if (orfaos > 0) semProveniencia.push({ slug: c.slug, cards: orfaos })
    mandatosComColunaNula += d.mandatos.filter((m) => m.proveniencia == null).length
  }

  const resumo = {
    fichas: candidatos.length,
    antes: { comConteudo: antesComConteudo, vazias: candidatos.length - antesComConteudo },
    depois: {
      comConteudo: depoisComConteudo,
      vaziasPorAusenciaConfirmada: vazioHonesto,
      vaziasPorFaltaDeVerificacao: vazioPorNaoVerificado,
    },
    fichasQueGanharamConteudoReal: ganharam.length,
    modo: simularProveniencia
      ? "simulacao-migration-sem-escrita"
      : simularTrajetoriaTse8
        ? "simulacao-trajetoria-tse-8-sem-escrita"
        : caminhoSimulacao
          ? "simulacao-estados-residuais-sem-escrita"
          : "banco-atual",
    estadosPorFonte,
    fichasDetalhe,
    fichasVazias: vazias,
    fichasVaziasDetalhe: vaziasDetalhe,
    itensPorFonte: porFonte,
    fichasComAlgumItemPorFonte: fichasPorFonte,
    provaDom: {
      fichasRenderizadas: candidatos.length,
      divergencias: divergenciasDom.length,
      exemplos: divergenciasDom.slice(0, 10),
    },
    provaProveniencia: {
      mandatosPromovidos: porFonte.mandatos,
      comColunaPersistidaNula: mandatosComColunaNula,
      cardsSemProvenienciaEfetiva: semProveniencia.reduce((t, x) => t + x.cards, 0),
      fichasAfetadas: semProveniencia.slice(0, 10),
    },
    provaTrajetoriaTse8: {
      fichasEsperadas: simularTrajetoriaTse8 ? slugsTrajetoriaTse8.size : 0,
      fichasProjetadas: trajetoriasTse8Projetadas,
      resultado: simularTrajetoriaTse8 ? "sem_achado_no_escopo" : "nao_simulado",
      promoveCard: false,
    },
    provaVotacoesProjetadas: {
      fichasComConteudo: caminhoSimulacao ? fichasPorFonte.votacoes : 0,
      fichasEsperadas: caminhoSimulacao ? 14 : 0,
      paresPublicos: caminhoSimulacao
        ? [...votosProjetadosPor.values()].reduce((total, linhas) => total + linhas.length, 0)
        : 0,
      origem: caminhoSimulacao ? SENADO_EXATO_SQL : "nao_simulado",
    },
    provaProcessosLegadosProjetados: {
      atualizados: caminhoSimulacao ? 5 : 0,
      despublicados: caminhoSimulacao ? 1 : 0,
      semEndpointDepois: caminhoSimulacao
        ? processos.filter((processo) => PROCESSOS_LEGADOS_PROJETADOS[processo.id]?.acao === "atualizar")
          .filter((processo) => !PROCESSOS_LEGADOS_PROJETADOS[processo.id]?.url).length
        : 0,
      origem: caminhoSimulacao ? "supabase/migrations/20260811101200_processos_legados_fontes_oficiais.sql" : "nao_simulado",
    },
  }
  console.log(JSON.stringify(resumo, null, 2))
  if (ganharam.length) console.log("\nGanharam conteúdo real:", ganharam.slice(0, 20).join(", "))
  if (saida) {
    writeFileSync(saida, JSON.stringify({ resumo, ganharam }, null, 2))
    console.log(`\nDetalhe em ${saida}`)
  }
  if (divergenciasDom.length) {
    console.error(
      `\nFALHA: ${divergenciasDom.length} ficha(s) contam item sem card visível na aba.`
    )
    process.exit(1)
  }
  if (semProveniencia.length) {
    console.error(
      `\nFALHA: ${semProveniencia.length} ficha(s) com card de mandato sem proveniência efetiva.`
    )
    process.exit(1)
  }
  if (simularTrajetoriaTse8 && trajetoriasTse8Projetadas !== slugsTrajetoriaTse8.size) {
    console.error(
      `\nFALHA: projetadas ${trajetoriasTse8Projetadas} de ${slugsTrajetoriaTse8.size} fichas TSE-8.`,
    )
    process.exit(1)
  }
  if (caminhoSimulacao && fichasPorFonte.votacoes !== 14) {
    console.error(`\nFALHA: projeção de votações exibiu ${fichasPorFonte.votacoes}/14 fichas.`)
    process.exit(1)
  }
  if (esperarEstadoFinal) {
    const celulas = fichasDetalhe.reduce((total, ficha) => total + ficha.fontes.length, 0)
    const silenciosas = fichasDetalhe.flatMap((ficha) =>
      ficha.fontes
        .filter((fonte) => fonte.estado === "nunca_verificado" || fonte.estado === "nao_coletado")
        .map((fonte) => `${ficha.slug}:${fonte.chave}:${fonte.estado}`),
    )
    if (candidatos.length !== 194 || celulas !== 970 || silenciosas.length > 0 || vazias.length !== 29) {
      console.error(
        `\nFALHA FINAL: fichas=${candidatos.length}/194, células=${celulas}/970, ` +
          `silenciosas=${silenciosas.length}/0, vazias honestas=${vazias.length}/29.`,
      )
      if (silenciosas.length > 0) console.error(silenciosas.slice(0, 20).join("\n"))
      process.exit(1)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
