import { rotuloDoAcervo } from "@/lib/proposicao-natureza"
import type { Candidato, Financiamento, GastoExecutivo, GastoParlamentar, HistoricoPolitico, MudancaPartido, Patrimonio, ProjetoLei, SancoesVerificacao, SectionFreshnessInfo, SectionFreshnessKey, VotoCandidato } from "./types"
import { isHistoricoCandidaturaRow } from "@/lib/historico-tipo-evento"
import { CHAVE_AGREGADO_CURADO, ROTULO_FONTE_TSE, candidataDeColeta, resolverFrescorTsePerfil, resolverUltimaVerificacaoDoPerfil } from "@/lib/verificacao-campos"
import { formatDate } from "@/lib/utils"
/**
 * Fase de curadoria. O DEFAULT E SEGURO: qualquer coisa que nao seja
 * explicitamente `hardening` conta como fase de lançamento, ou seja, o selo de
 * frescor diz a verdade sobre a idade do dado.
 *
 * Era o contrario ate 2026-08-03, e a variável nunca chegou a ser definida em
 * Production (conferido com `vercel env ls production`). Efeito: a negação em
 * `buildSectionFreshness` curto-circuitava e TODA ficha carimbava "Dado atual",
 * inclusive uma parada desde 14/04. Numa plataforma cívica cuja proposta e fonte
 * visivel, o default nunca pode ser o que mente.
 *
 * Para voltar ao modo de curadoria (selo sempre "current", sem checagem de
 * idade), defina PF_CURATION_PHASE=hardening de forma explicita.
 */
const IS_LAUNCH_PHASE = process.env.PF_CURATION_PHASE?.trim() !== "hardening"
/**
 * Janela de frescor do bloco `perfil_atual`, em dias.
 *
 * 75 e escolha medida, nao arbitraria (03/08/2026). Distribuição real das 194
 * fichas publicadas naquela data: 66 passariam de 30 dias, 61 de 45, e apenas 1
 * de 60. Os 65 do meio sao um lote único curado em 09/06, entao qualquer corte
 * entre 45 e 60 marcaria um terço do site de uma vez, e um corte de 60 os
 * marcaria todos cinco dias depois do lançamento.
 *
 * 75 dias marca so quem esta genuinamente velho hoje (`felicio-ramuth`, parado
 * desde 14/04) e da folga ate ~23/08 para recurar o lote de 09/06 sem pressa.
 * Quando a recuragem virar rotina, este valor deve BAIXAR de novo.
 *
 * Espelhado em scripts/lib/freshness-annotator.ts (CURATION_STALE_WINDOW_DAYS).
 * tests/freshness-window.test.ts falha se os dois divergirem.
 */
const PROFILE_FRESHNESS_WINDOW_DAYS = 75

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function ageInDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function buildFreshnessInfo(
  key: SectionFreshnessKey,
  label: string,
  status: SectionFreshnessInfo["status"],
  message: string,
  referenceDate: string | null = null,
  referenceYear: number | null = null,
  verifiedAt: string | null = null,
  sourceLabel: string | null = null
): SectionFreshnessInfo {
  return {
    key,
    label,
    status,
    verifiedAt,
    referenceDate,
    referenceYear,
    sourceLabel,
    message,
  }
}

function rotuloFreshnessProjetos(data: {
  projetos: ProjetoLei[]
  projetosTotal?: number
  projetosNaturezaProjetosTotal?: number | null
}): string {
  const total = data.projetosTotal ?? data.projetos.length
  if (typeof data.projetosNaturezaProjetosTotal === "number") {
    return data.projetosNaturezaProjetosTotal >= total
      ? "Projetos de lei"
      : "Proposições de autoria"
  }
  return data.projetos.length >= total
    ? rotuloDoAcervo(data.projetos.map((item) => item.tipo))
    : "Proposições de autoria"
}

export function buildSectionFreshness(
  candidato: Candidato,
  data: {
    historico: HistoricoPolitico[]
    mudancas: MudancaPartido[]
    patrimonio: Patrimonio[]
    financiamento: Financiamento[]
    votos: VotoCandidato[]
    projetos: ProjetoLei[]
    /** Total real do acervo; `projetos` pode ser só a prévia de 25. */
    projetosTotal?: number
    /** Quantas do acervo INTEIRO são projeto de lei (head-count por sigla). */
    projetosNaturezaProjetosTotal?: number | null
    gastos: GastoParlamentar[]
    gastosExecutivo: GastoExecutivo[]
    historicoEmRevisao?: boolean
    timelinePartidariaIncompleta?: boolean
    /**
     * Ultima consulta aos cadastros de sancoes e a curadoria de processos.
     * Entram aqui porque o bloco "Perfil atual" passou a responder "quando
     * qualquer dado deste perfil foi verificado pela ultima vez", e estas sao
     * verificações reais que a ficha ja exibe em outras seções. Antes de
     * 09/08/2026 elas eram ignoradas pelo selo, que por isso anunciava junho em
     * ficha com verificacao de agosto na mesma pagina.
     */
    sancoesVerificacao?: SancoesVerificacao | null
    processosVerificacao?: SancoesVerificacao | null
  }
): Partial<Record<SectionFreshnessKey, SectionFreshnessInfo>> {
  const fieldVerification = candidato.verificacao_campos ?? {}
  /**
   * Contrato em `@/lib/verificacao-campos`. O agregado so avança com as TRES
   * frentes TSE resolvidas, e avança pela data MAIS ANTIGA entre elas.
   *
   * Antes de 09/08/2026 isto ordenava quatro chaves por data e pegava a mais
   * recente, entao verificacao PARCIAL promovia o perfil inteiro, e o agregado
   * curado competia com as frentes em vez de ser o fallback. Resolução parcial
   * agora nao produz data TSE nenhuma: cai para o curado, que e a ultima
   * verificacao que de fato cobre a ficha toda.
   */
  const tseVerification = resolverFrescorTsePerfil(fieldVerification)
  const curatedValue = fieldVerification[CHAVE_AGREGADO_CURADO]
  const curatedRaw =
    typeof curatedValue === "string" ? curatedValue : candidato.ultima_atualizacao ?? null
  const curatedDate = parseDate(curatedRaw)

  /**
   * A pergunta que o bloco responde: quando qualquer dado deste perfil foi
   * verificado pela ultima vez? Vence a candidata mais recente, e a fonte e
   * nomeada, para que o selo nunca prometa mais do que foi verificado. A ordem
   * declarada abaixo so desempata datas iguais, e privilegia a fonte que cobre
   * mais campos do perfil.
   *
   * `exibicao` carrega o valor BRUTO, e `instante` a comparacao. A exibição nao
   * pode passar por `Date` quando o gravado e data pura: "2026-08-09" ancora em
   * meia-noite UTC e o formatador `America/Sao_Paulo` recuaria para
   * "08/08/2026", medido em produção em 09/08/2026. `formatDate` ja trata
   * string data-pura como data de calendário e timestamp com fuso como
   * instante, que e a semântica de cada forma gravada.
   */
  const ultimaVerificacao = resolverUltimaVerificacaoDoPerfil([
    tseVerification.tipo === "completa"
      ? {
          instante: tseVerification.verificadoEm.instante,
          exibicao: tseVerification.verificadoEm.bruto,
          fonte: ROTULO_FONTE_TSE[tseVerification.chaveMaisAntiga],
          ordem: 0,
        }
      : null,
    curatedRaw && curatedDate
      ? {
          instante: curatedDate.getTime(),
          exibicao: curatedRaw,
          fonte: "Perfil factual curado",
          ordem: 1,
        }
      : null,
    candidataDeColeta(data.sancoesVerificacao, "Sanções: CEIS, CNEP e CEAF", 2),
    candidataDeColeta(data.processosVerificacao, "Curadoria de processos", 3),
  ])
  const profileVerification = ultimaVerificacao
    ? {
        raw: ultimaVerificacao.exibicao,
        date: new Date(ultimaVerificacao.instante),
        source: ultimaVerificacao.fonte,
      }
    : null
  const latestHistoricoYear =
    data.historico.length > 0
      ? Math.max(
          ...data.historico.map((item) =>
            item.periodo_fim ?? item.periodo_inicio ?? 0
          )
        )
      : null
  const latestHistoricoRows =
    latestHistoricoYear != null
      ? data.historico.filter(
          (item) =>
            (item.periodo_fim ?? item.periodo_inicio ?? 0) ===
            latestHistoricoYear
        )
      : []
  const latestHistoricoOnlyCandidaturas =
    latestHistoricoRows.length > 0 &&
    latestHistoricoRows.every((item) => isHistoricoCandidaturaRow(item))
  const historicoFreshnessMessage =
    latestHistoricoYear != null
      ? latestHistoricoOnlyCandidaturas
        ? `Última candidatura estruturada em ${latestHistoricoYear}.`
        : `Último cargo estruturado até ${latestHistoricoYear}.`
      : null
  const latestMudancaYear =
    data.mudancas.length > 0
      ? Math.max(...data.mudancas.map((item) => item.ano ?? 0))
      : null
  const latestPatrimonioYear =
    data.patrimonio.length > 0
      ? Math.max(...data.patrimonio.map((item) => item.ano_eleicao ?? 0))
      : null
  const latestFinanciamentoYear =
    data.financiamento.length > 0
      ? Math.max(...data.financiamento.map((item) => item.ano_eleicao ?? 0))
      : null
  const latestProjetoYear =
    data.projetos.length > 0
      ? Math.max(...data.projetos.map((item) => item.ano ?? 0))
      : null
  const latestGastoYear =
    data.gastos.length > 0
      ? Math.max(...data.gastos.map((item) => item.ano ?? 0))
      : null
  const latestGastoExecutivo = [...data.gastosExecutivo]
    .sort((a, b) => b.mes_extrato.localeCompare(a.mes_extrato))[0] ?? null
  const latestGastoExecutivoColeta = [...data.gastosExecutivo]
    .filter((item) => parseDate(item.coletado_em))
    .sort((a, b) => b.coletado_em.localeCompare(a.coletado_em))[0] ?? null
  const latestGastoExecutivoColetaDate = parseDate(latestGastoExecutivoColeta?.coletado_em)
  const latestVoteDateString = [...data.votos]
    .map((item) => item.votacao?.data_votacao ?? null)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  const latestVoteDate = parseDate(latestVoteDateString)

  return {
    perfil_atual: profileVerification
      ? buildFreshnessInfo(
          "perfil_atual",
          "Perfil atual",
          !IS_LAUNCH_PHASE || ageInDays(profileVerification.date) <= PROFILE_FRESHNESS_WINDOW_DAYS ? "current" : "stale",
          !IS_LAUNCH_PHASE || ageInDays(profileVerification.date) <= PROFILE_FRESHNESS_WINDOW_DAYS
            ? `Dados do perfil verificados pela última vez em ${formatDate(profileVerification.raw)} (${profileVerification.source}).`
            : `Dados do perfil verificados pela última vez em ${formatDate(profileVerification.raw)} (${profileVerification.source}). Pode não refletir mudanças recentes.`,
          profileVerification.date.toISOString(),
          profileVerification.date.getUTCFullYear(),
          profileVerification.date.toISOString(),
          profileVerification.source
        )
      : buildFreshnessInfo(
          "perfil_atual",
          "Perfil atual",
          "missing",
          "Sem data confiável de atualização do perfil atual."
        ),
    historico_politico:
      latestHistoricoYear != null
        ? buildFreshnessInfo(
            "historico_politico",
            "Trajetória política",
            data.historicoEmRevisao ? "stale" : "historical",
            data.historicoEmRevisao
              ? `${historicoFreshnessMessage} A trajetória ainda está em revisão factual.`
              : (historicoFreshnessMessage ?? "Trajetória política estruturada."),
            null,
            latestHistoricoYear,
            null,
            "Histórico político"
          )
        : buildFreshnessInfo(
            "historico_politico",
            "Trajetória política",
            "missing",
            "Sem trajetória política estruturada."
          ),
    mudancas_partido:
      latestMudancaYear != null
        ? buildFreshnessInfo(
            "mudancas_partido",
            "Histórico partidário",
            data.timelinePartidariaIncompleta ? "stale" : "historical",
            data.timelinePartidariaIncompleta
              ? `Última mudança de partido registrada em ${latestMudancaYear}. A linha do tempo ainda não chegou à filiação atual publicada.`
              : `Última mudança de partido registrada em ${latestMudancaYear}.`,
            null,
            latestMudancaYear,
            null,
            "Histórico partidário"
          )
        : buildFreshnessInfo(
            "mudancas_partido",
            "Histórico partidário",
            "missing",
            "Sem linha do tempo partidária estruturada."
          ),
    patrimonio:
      latestPatrimonioYear != null
        ? buildFreshnessInfo(
            "patrimonio",
            "Patrimônio",
            "historical",
            `Dado mais recente disponível: eleição de ${latestPatrimonioYear}.`,
            null,
            latestPatrimonioYear,
            null,
            "TSE"
          )
        : buildFreshnessInfo(
            "patrimonio",
            "Patrimônio",
            "missing",
            "Sem patrimônio estruturado."
          ),
    financiamento:
      latestFinanciamentoYear != null
        ? buildFreshnessInfo(
            "financiamento",
            "Financiamento",
            "historical",
            `Dado mais recente disponível: eleição de ${latestFinanciamentoYear}.`,
            null,
            latestFinanciamentoYear,
            null,
            "TSE"
          )
        : buildFreshnessInfo(
            "financiamento",
            "Financiamento",
            "missing",
            "Sem financiamento estruturado."
          ),
    projetos_lei:
      latestProjetoYear != null
        ? buildFreshnessInfo(
            "projetos_lei",
            // Acervo misto não pode se anunciar como projeto de lei (issue
            // #138), e o rótulo tem que vir do acervo INTEIRO, nunca da prévia
            // de 25 (rodada 2 da vistoria). Sem o head-count, só confiamos na
            // prévia quando ela é o acervo todo; senão, rótulo neutro.
            rotuloFreshnessProjetos(data),
            "historical",
            `Proposição mais recente disponível: ${latestProjetoYear}.`,
            null,
            latestProjetoYear,
            null,
            "API legislativa"
          )
        : buildFreshnessInfo(
            "projetos_lei",
            "Projetos de lei",
            "missing",
            "Sem projetos de lei estruturados."
          ),
    votos_candidato:
      latestVoteDate && latestVoteDateString
        ? buildFreshnessInfo(
            "votos_candidato",
            "Votações",
            "historical",
            // `votacoes_chave.data_votacao` é coluna DATE. Exibir a string crua
            // mantém este selo igual ao que a lista de votos já renderiza; passar
            // pelo Date recuaria o dia em America/Sao_Paulo.
            `Votação mais recente registrada em ${formatDate(latestVoteDateString)}.`,
            latestVoteDate.toISOString(),
            latestVoteDate.getUTCFullYear(),
            null,
            "API legislativa"
          )
        : buildFreshnessInfo(
            "votos_candidato",
            "Votações",
            "missing",
            "Sem histórico estruturado de votações."
          ),
    gastos_parlamentares:
      latestGastoYear != null
        ? buildFreshnessInfo(
            "gastos_parlamentares",
            "Gastos parlamentares",
            "historical",
            `Dados disponíveis até ${latestGastoYear}.`,
            null,
            latestGastoYear,
            null,
            "Gastos parlamentares"
          )
        : buildFreshnessInfo(
            "gastos_parlamentares",
            "Gastos parlamentares",
            "missing",
            "Sem gastos parlamentares estruturados."
          ),
    gastos_executivo:
      latestGastoExecutivo && latestGastoExecutivoColeta && latestGastoExecutivoColetaDate
        ? buildFreshnessInfo(
            "gastos_executivo",
            "Gastos da estrutura de governo",
            ageInDays(latestGastoExecutivoColetaDate) <= PROFILE_FRESHNESS_WINDOW_DAYS
              ? "current"
              : "stale",
            `Totais mensais coletados no Portal da Transparência em ${formatDate(latestGastoExecutivoColeta.coletado_em)}.`,
            latestGastoExecutivo.mes_extrato,
            Number(latestGastoExecutivo.mes_extrato.slice(0, 4)),
            latestGastoExecutivoColeta.coletado_em,
            "Portal da Transparência",
          )
        : buildFreshnessInfo(
            "gastos_executivo",
            "Gastos da estrutura de governo",
            "missing",
            "Sem totais institucionais estruturados.",
          ),
  }
}
