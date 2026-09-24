/**
 * Fase de uma representação ao Conselho de Ética da Câmara.
 *
 * Representação (sigla REP na API de Dados Abertos) é um processo disciplinar
 * interno da Câmara por quebra de decoro. Não é ação judicial, e nenhuma fase
 * aqui descreve culpa: o rótulo diz em que etapa o procedimento está.
 *
 * O código só sugere fases que saem de dado estruturado da API (tipo de
 * tramitação, órgão, situação e o tipo do recurso relacionado). O resultado de
 * uma votação (admissibilidade, procedência ou arquivamento) não vem em campo
 * estruturado: o Conselho costuma registrá-lo como "Providência Interna"
 * (código 199), com o resultado só no texto. As fases que dependem dele só podem
 * ser escolhidas pelo revisor humano, que lê o despacho levado na fila de
 * revisão. Por isso a sugestão pode ficar atrás da etapa real.
 */

/** Fases que o código sugere, em ordem de avanço do procedimento. */
const FASES_SUGERIVEIS = [
  "apresentada",
  "encaminhada_conselho",
  "processo_instaurado",
  "em_instrucao",
  "parecer_apresentado",
  "deliberada_conselho",
  "recurso_apresentado",
  "em_analise_ccj",
  "deliberada_ccj",
  "recurso_encerrado",
  "deliberada_plenario",
  "encerrada",
  "arquivada",
  "prejudicada",
  "retirada",
] as const

/** Fases que dependem do sentido de uma votação: só o revisor humano as escolhe. */
const FASES_HUMANAS = [
  "admissibilidade_aprovada_conselho",
  "procedente_conselho_recurso_pendente",
  "procedente_conselho_aguarda_plenario",
  "arquivamento_aprovado_conselho",
] as const

export const FASES_REPRESENTACAO = [...FASES_SUGERIVEIS, ...FASES_HUMANAS] as const

export type FaseRepresentacao = (typeof FASES_REPRESENTACAO)[number]
type FaseSugerivel = (typeof FASES_SUGERIVEIS)[number]

export const FASES_SO_REVISAO_HUMANA: ReadonlySet<FaseRepresentacao> = new Set(FASES_HUMANAS)

export const FASE_REPRESENTACAO_LABEL: Record<FaseRepresentacao, string> = {
  apresentada: "Representação apresentada; aguarda envio ao Conselho de Ética",
  encaminhada_conselho: "Representação enviada ao Conselho de Ética; processo ainda não instaurado",
  processo_instaurado: "Processo disciplinar instaurado no Conselho de Ética",
  em_instrucao: "Em fase de instrução no Conselho de Ética",
  parecer_apresentado: "Parecer do relator apresentado; aguarda votação no Conselho de Ética",
  deliberada_conselho: "Parecer votado no Conselho de Ética",
  recurso_apresentado: "Recurso contra a decisão do Conselho de Ética apresentado; aguarda análise",
  em_analise_ccj: "Recurso em análise na Comissão de Constituição e Justiça (CCJ)",
  deliberada_ccj: "Recurso votado na Comissão de Constituição e Justiça (CCJ)",
  recurso_encerrado: "Recurso contra a decisão do Conselho de Ética encerrado",
  deliberada_plenario: "Parecer votado no Plenário da Câmara",
  arquivada: "Representação arquivada",
  prejudicada: "Representação declarada prejudicada",
  retirada: "Representação retirada pelo autor",
  encerrada: "Tramitação encerrada no Conselho de Ética",
  admissibilidade_aprovada_conselho: "Conselho de Ética admitiu a representação; processo segue em análise",
  procedente_conselho_recurso_pendente:
    "Representação aprovada no Conselho de Ética; recurso do deputado aguarda análise",
  procedente_conselho_aguarda_plenario: "Representação aprovada no Conselho de Ética, aguarda plenário",
  arquivamento_aprovado_conselho: "Conselho de Ética aprovou o arquivamento da representação",
}

export function isFaseRepresentacao(value: unknown): value is FaseRepresentacao {
  return typeof value === "string" && (FASES_REPRESENTACAO as readonly string[]).includes(value)
}

/** Tramitação como a API de Dados Abertos devolve em `/proposicoes/{id}/tramitacoes`. */
export interface TramitacaoCamara {
  dataHora: string
  sequencia: number
  siglaOrgao: string
  codTipoTramitacao: string
  descricaoTramitacao: string
  codSituacao: number | null
  descricaoSituacao: string | null
  despacho: string | null
  url: string | null
}

/** Recurso (sigla REC) ligado à representação por `/proposicoes/{id}/relacionadas`. */
export interface RecursoRelacionado {
  id: number
  numero: number
  ano: number
  codTipo: number
  ementa: string
  dataApresentacao: string
  codSituacao: number | null
  descricaoSituacao: string | null
  tramitacoes: TramitacaoCamara[]
}

interface EvidenciaFase {
  origem: "representacao" | "recurso" | "situacao"
  proposicao_id: number
  siglaOrgao: string | null
  codTipoTramitacao: string | null
  descricao: string
}

export interface SugestaoFase {
  fase: FaseSugerivel
  /** Data (YYYY-MM-DD) do marco que definiu a fase. */
  data: string
  evidencia: EvidenciaFase
}

// ---------------------------------------------------------------- tabela de códigos

/**
 * Tipo de tramitação e órgão → fase. Tabela única: a sugestão de fase e a
 * seleção de despachos para o revisor leem daqui.
 */
const FASE_POR_TRAMITACAO: Record<"representacao" | "recurso", Partial<Record<string, Record<string, FaseSugerivel>>>> = {
  representacao: {
    MESA: { "100": "apresentada", "1023": "encaminhada_conselho", "110": "encaminhada_conselho" },
    COETICA: {
      "500": "encaminhada_conselho",
      "1059": "processo_instaurado",
      "1061": "em_instrucao",
      "1062": "em_instrucao",
      "1501": "em_instrucao",
      "1502": "em_instrucao",
      "1505": "em_instrucao",
      "322": "parecer_apresentado",
      "231": "deliberada_conselho",
      "336": "deliberada_conselho",
      "335": "deliberada_conselho",
      "435": "prejudicada",
    },
  },
  recurso: {
    CCJC: {
      "500": "em_analise_ccj",
      "501": "em_analise_ccj",
      "320": "em_analise_ccj",
      "231": "deliberada_ccj",
      "336": "deliberada_ccj",
      "335": "deliberada_ccj",
    },
  },
}

/** Tipos de tramitação cujo despacho pode registrar decisão; vão para leitura do revisor. */
export const COD_TRAMITACAO_DECISORIOS: ReadonlySet<string> = new Set([
  "322", "231", "336", "335", "435", "1231", "1235", "1236", "192", "502",
])

/** Tipo de REC "Recurso do Conselho de Ética que contraria norma constitucional ou regimental". */
const COD_TIPO_REC_CONSELHO_ETICA = 618
/** Tipo genérico "Recurso", usado também contra decisões do Conselho. */
const COD_TIPO_REC_GENERICO = 144

const SITUACAO_TRAMITACAO_FINALIZADA = 1285
/** Situação terminal da proposição → fase. Vale para a REP e para o REC. */
const FASE_TERMINAL_POR_SITUACAO: Partial<Record<number, "arquivada" | "retirada" | "prejudicada">> = {
  923: "arquivada",
  950: "retirada",
  1222: "prejudicada",
}

const CONTRA_DECISAO_CONSELHO = /contra\s+(a\s+)?decis[aã]o\s+(proferida\s+pelo\s+|do\s+)?conselho\s+de\s+[ée]tica/i
const NOME_TIPO_REC_CONSELHO = /Recurso do Conselho de [ÉE]tica que contraria norma/i

/**
 * Ordem de avanço das fases. Um marco só substitui outro se for mais recente E
 * não recuar nessa ordem: eventos genéricos se repetem tarde (a Mesa registra
 * como "Apresentação de Proposição" um projeto derivado, e despacha de novo
 * depois do parecer), e sem essa trava a fase voltaria para "apresentada".
 */
const ORDEM: Record<FaseSugerivel, number> = {
  apresentada: 1,
  encaminhada_conselho: 2,
  processo_instaurado: 3,
  em_instrucao: 4,
  parecer_apresentado: 5,
  deliberada_conselho: 6,
  recurso_apresentado: 7,
  em_analise_ccj: 8,
  deliberada_ccj: 9,
  recurso_encerrado: 9,
  deliberada_plenario: 10,
  encerrada: 11,
  arquivada: 12,
  prejudicada: 12,
  retirada: 12,
}

function faseDaTramitacaoDaRepresentacao(t: TramitacaoCamara): FaseSugerivel | null {
  const cod = String(t.codTipoTramitacao)
  const despacho = t.despacho ?? ""
  // Arquivamento vale em qualquer órgão.
  if (cod === "502") return "arquivada"
  if (t.siglaOrgao === "PLEN" && (cod === "1235" || cod === "1236") && /parecer/i.test(despacho)) {
    return "deliberada_plenario"
  }
  // Recurso registrado na própria REP: o despacho repete o nome oficial do
  // tipo do REC, texto fixo da API e não redação livre.
  if (cod === "192" && (NOME_TIPO_REC_CONSELHO.test(despacho) || CONTRA_DECISAO_CONSELHO.test(despacho))) {
    return "recurso_apresentado"
  }
  return FASE_POR_TRAMITACAO.representacao[t.siglaOrgao]?.[cod] ?? null
}

function faseDaTramitacaoDoRecurso(t: TramitacaoCamara): FaseSugerivel | null {
  return FASE_POR_TRAMITACAO.recurso[t.siglaOrgao]?.[String(t.codTipoTramitacao)] ?? null
}

export function recursoContraDecisaoDoConselho(recurso: Pick<RecursoRelacionado, "codTipo" | "ementa">): boolean {
  if (recurso.codTipo === COD_TIPO_REC_CONSELHO_ETICA) return true
  return recurso.codTipo === COD_TIPO_REC_GENERICO && CONTRA_DECISAO_CONSELHO.test(recurso.ementa)
}

interface Marco {
  fase: FaseSugerivel
  dataHora: string
  evidencia: EvidenciaFase
}

function marcoDeTramitacao(
  fase: FaseSugerivel,
  origem: EvidenciaFase["origem"],
  proposicaoId: number,
  t: TramitacaoCamara,
  descricao = t.descricaoTramitacao,
): Marco {
  return {
    fase,
    dataHora: t.dataHora,
    evidencia: {
      origem,
      proposicao_id: proposicaoId,
      siglaOrgao: t.siglaOrgao,
      codTipoTramitacao: String(t.codTipoTramitacao),
      descricao,
    },
  }
}

function maisRecente(a: Marco | null, b: Marco): Marco {
  if (!a) return b
  if (ORDEM[b.fase] < ORDEM[a.fase]) return a
  if (b.dataHora > a.dataHora) return b
  if (b.dataHora === a.dataHora && ORDEM[b.fase] > ORDEM[a.fase]) return b
  return a
}

/**
 * Sugere a fase pelo marco estruturado mais recente da representação e dos
 * recursos contra a decisão do Conselho. Devolve `null` quando nenhuma
 * tramitação conhecida permite dizer a fase: a fila mostra isso ao revisor em
 * vez de inventar uma etapa.
 */
export function sugerirFaseRepresentacao(input: {
  representacaoId: number
  tramitacoes: TramitacaoCamara[]
  situacaoAtual: { codSituacao: number | null; descricaoSituacao: string | null }
  recursos: RecursoRelacionado[]
}): SugestaoFase | null {
  let marco: Marco | null = null

  for (const t of input.tramitacoes) {
    const fase = faseDaTramitacaoDaRepresentacao(t)
    if (fase) marco = maisRecente(marco, marcoDeTramitacao(fase, "representacao", input.representacaoId, t))
  }

  for (const recurso of input.recursos) {
    if (!recursoContraDecisaoDoConselho(recurso)) continue
    marco = maisRecente(marco, {
      fase: "recurso_apresentado",
      dataHora: recurso.dataApresentacao,
      evidencia: {
        origem: "recurso",
        proposicao_id: recurso.id,
        siglaOrgao: null,
        codTipoTramitacao: null,
        descricao: `Apresentação do REC ${recurso.numero}/${recurso.ano}`,
      },
    })
    for (const t of recurso.tramitacoes) {
      const fase = faseDaTramitacaoDoRecurso(t)
      if (fase) marco = maisRecente(marco, marcoDeTramitacao(fase, "recurso", recurso.id, t))
    }
    const ultima = recurso.tramitacoes.at(-1)
    const encerrado = recurso.codSituacao !== null && recurso.codSituacao in FASE_TERMINAL_POR_SITUACAO
    if (encerrado && ultima && marco && ultima.dataHora >= marco.dataHora) {
      marco = marcoDeTramitacao("recurso_encerrado", "situacao", recurso.id, ultima, recurso.descricaoSituacao ?? "")
    }
  }

  const situacao = input.situacaoAtual.codSituacao
  const ultimaDaRep = input.tramitacoes.reduce<TramitacaoCamara | null>(
    (ultima, t) => (!ultima || t.dataHora >= ultima.dataHora ? t : ultima),
    null,
  )
  const terminalPelaSituacao =
    (situacao !== null ? FASE_TERMINAL_POR_SITUACAO[situacao] : undefined) ??
    (situacao === SITUACAO_TRAMITACAO_FINALIZADA && marco && ORDEM[marco.fase] <= ORDEM.deliberada_conselho
      ? "encerrada"
      : null)
  if (terminalPelaSituacao && marco?.fase !== terminalPelaSituacao && ultimaDaRep) {
    // A situação não traz data; a data é a do marco terminal já visto, ou a
    // da última tramitação, que é quando a situação passou a valer.
    const dataHora =
      marco && (marco.fase === "arquivada" || marco.fase === "prejudicada") ? marco.dataHora : ultimaDaRep.dataHora
    marco = {
      fase: terminalPelaSituacao,
      dataHora,
      evidencia: {
        origem: "situacao",
        proposicao_id: input.representacaoId,
        siglaOrgao: null,
        codTipoTramitacao: null,
        descricao: input.situacaoAtual.descricaoSituacao ?? "",
      },
    }
  }

  if (!marco) return null
  return { fase: marco.fase, data: marco.dataHora.slice(0, 10), evidencia: marco.evidencia }
}
