import { formatPartyPublicLabel } from "@/lib/party-utils"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { stripAccents } from "@/lib/strip-accents"

export type LabelCasing = "title" | "sentence"

export const FINANCING_BREAKDOWN_KEYS = [
  "fundo_eleitoral",
  "fundo_partidario",
  "pessoa_fisica",
  "recursos_proprios",
  "outros_recursos",
] as const

export type FinancingBreakdownKey = (typeof FINANCING_BREAKDOWN_KEYS)[number]

/**
 * Rampa de cinzas do donut e das legendas de financiamento. Fonte unica: a mesma
 * constante estava duplicada em ProfileOverview e CandidatoProfileSections, e as
 * duas copias tinham o piso em `#e5e5e5`, que da 1,3:1 contra o card branco
 * (`--card: #ffffff`). Na pratica a fatia de "Outras origens" sumia, e um
 * candidato com 100% nessa origem exibia um donut que parecia estado vazio.
 *
 * Regra: toda cor de dado precisa de >= 3:1 contra `#ffffff` (WCAG 1.4.11,
 * componente grafico nao textual). O piso ficou em `#737373` (4,74:1) e a rampa
 * inteira e verificada por `tests/financing-donut-contraste.test.ts`.
 */
/**
 * "1 DESTAQUES" aparecia no card do topo da ficha e no widget de embed, que sao
 * duas superficies publicas em pt-BR, e o comparador ja pluralizava certo
 * ("1 processo" contra "3 processos"). Fonte unica para as tres.
 */
export function formatDestaquesLabel(count: number): string {
  return count === 1 ? "Destaque" : "Destaques"
}

export const FINANCING_COLOR_BY_KEY: Record<FinancingBreakdownKey, string> = {
  fundo_eleitoral: "#0a0a0a",
  fundo_partidario: "#2e2e2e",
  pessoa_fisica: "#4a4a4a",
  recursos_proprios: "#5e5e5e",
  outros_recursos: "#737373",
}

const LOWERCASE_CONNECTORS = new Set([
  "a",
  "as",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "para",
  "por",
])

const UPPERCASE_LABELS = new Set(["PF", "PJ", "CEAP", "IBGE", "IDEB", "INEP", "TSE", "CAPAG", "SIDRA"])

const WORD_LABELS: Record<string, string> = {
  abstencao: "Abstenção",
  administracao: "Administração",
  agronegocio: "Agronegócio",
  alimentacao: "Alimentação",
  aereas: "Aéreas",
  atencao: "Atenção",
  atencoes: "Atenções",
  camara: "Câmara",
  comparacao: "Comparação",
  construcao: "Construção",
  contradicao: "Contradição",
  contradicoes: "Contradições",
  critica: "Crítica",
  critico: "Crítico",
  decisao: "Decisão",
  declaracao: "Declaração",
  divulgacao: "Divulgação",
  expansao: "Expansão",
  fisica: "Física",
  historico: "Histórico",
  justica: "Justiça",
  legislacao: "Legislação",
  media: "Média",
  nao: "Não",
  obstrucao: "Obstrução",
  ocorrencias: "Ocorrências",
  patrimonio: "Patrimônio",
  politica: "Política",
  politico: "Político",
  previdencia: "Previdência",
  proximo: "Próximo",
  proprios: "Próprios",
  publica: "Pública",
  publicas: "Públicas",
  publico: "Público",
  publicos: "Públicos",
  rapido: "Rápido",
  rapida: "Rápida",
  seguranca: "Segurança",
  servicos: "Serviços",
  situacao: "Situação",
  trajetoria: "Trajetória",
  transparencia: "Transparência",
  transferencia: "Transferência",
  unico: "Único",
  unica: "Única",
  visao: "Visão",
  visivel: "Visível",
  visiveis: "Visíveis",
  votacao: "Votação",
  votacoes: "Votações",
}

function normalizeLookupKey(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[·/]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isUppercaseLabel(value: string): boolean {
  return UPPERCASE_LABELS.has(value)
}

function capitalize(value: string): string {
  if (!value) return ""
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function titleizeWord(rawWord: string): string {
  const cleaned = rawWord.trim()
  if (!cleaned) return ""
  if (isUppercaseLabel(cleaned)) return cleaned
  const normalized = normalizeLookupKey(cleaned)
  const mapped = WORD_LABELS[normalized]
  if (mapped) return mapped
  const lower = cleaned.toLowerCase()
  return capitalize(lower)
}

function composeLabel(raw: string, casing: LabelCasing): string {
  const words = raw
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return ""

  const titled = words.map((word) => titleizeWord(word))

  if (casing === "title") {
    return titled
      .map((word, index) => {
        if (index > 0 && index < titled.length - 1 && LOWERCASE_CONNECTORS.has(word.toLowerCase())) {
          return word.toLowerCase()
        }
        return word
      })
      .join(" ")
  }

  return titled
    .map((word, index) => {
      if (index === 0 || isUppercaseLabel(word)) return word
      return word.toLowerCase()
    })
    .join(" ")
}

const FIXED_COPY_LOOKUP: Record<string, string> = {
  "carreira politica": "Carreira Política",
  contradicoes: "Contradições",
  "fundo partidario": "Fundo Partidário",
  "nao eleito": "Não Eleito",
  "pessoa fisica": "Pessoa Física",
  "pontos de atencao": "Pontos de Atenção",
  destaques: "Destaques",
  "recursos proprios": "Recursos Próprios",
  "situacao na justica": "Situação na Justiça",
  "timeline politica": "Timeline política",
  "visao geral": "Visão Geral",
  "votacoes chave": "Votações Chave",
  atual: "atual",
}

export const fixedCopy = {
  contradictions: FIXED_COPY_LOOKUP.contradicoes,
  keyVotes: FIXED_COPY_LOOKUP["votacoes chave"],
  politicalCareer: FIXED_COPY_LOOKUP["carreira politica"],
  partyFund: FIXED_COPY_LOOKUP["fundo partidario"],
  naturalPerson: FIXED_COPY_LOOKUP["pessoa fisica"],
  ownResources: FIXED_COPY_LOOKUP["recursos proprios"],
  justiceSituation: FIXED_COPY_LOOKUP["situacao na justica"],
  generalOverview: FIXED_COPY_LOOKUP["visao geral"],
  attentionPoints: FIXED_COPY_LOOKUP["pontos de atencao"],
  highlights: FIXED_COPY_LOOKUP.destaques,
  timelinePolitics: FIXED_COPY_LOOKUP["timeline politica"],
  notElected: FIXED_COPY_LOOKUP["nao eleito"],
  currentLowercase: FIXED_COPY_LOOKUP.atual,
} as const

const tokenLabels = {
  attentionCategory: {
    contradicao: "Contradição",
    corrupcao: "Corrupção",
    escandalo: "Escândalo",
    feito_positivo: "Feito Positivo",
    financiamento_suspeito: "Financiamento Suspeito",
    mudanca_partido: "Mudança de Partido",
    patrimonio_incompativel: "Patrimônio Incompatível",
    processo_grave: "Processo Grave",
  },
  candidateStatus: {
    candidato: "Candidato",
    desistente: "Desistente",
    indeferido: "Indeferido",
    // Pós-prazo de registro (15/08/2026, decisão editorial de 16/08): o token
    // interno legado continua "pre-candidato", mas a tela nunca mais diz isso.
    "pre-candidato": "Candidato",
    removido: "Removido",
  },
  financing: {
    fundo_eleitoral: "Fundo Eleitoral",
    fundo_partidario: fixedCopy.partyFund,
    pessoa_fisica: fixedCopy.naturalPerson,
    recursos_proprios: fixedCopy.ownResources,
    outros_recursos: "Outras origens registradas no TSE",
  },
  gravity: {
    alta: "Alta",
    baixa: "Baixa",
    critica: "Crítica",
    media: "Média",
  },
  processStatus: {
    absolvido: "Absolvido",
    comunicacao_processual_publicada_merito_nao_inferido:
      "Comunicação processual publicada; mérito não inferido",
    condenado: "Condenado",
    em_andamento: "Em andamento",
    prescrito: "Prescrito",
  },
  processType: {
    civil: "Civil",
    criminal: "Criminal",
    eleitoral: "Eleitoral",
    improbidade: "Improbidade",
    representacao: "Representação",
  },
  // Estado público do patrimônio por eleição (>= 2006). Ausência não pode
  // parecer ficha limpa nem ano oculto: vazio_confirmado é a fonte oficial
  // conferida sem bens; nao_coletado é coleta pendente, nunca ausência presumida.
  patrimonioEleicaoEstado: {
    publicado: "Patrimônio publicado",
    vazio_confirmado: "Sem bens declarados ao TSE",
    nao_coletado: "Ainda não coletado",
  },
  financiamentoEleicaoEstado: {
    publicado: "Financiamento publicado",
    zero_declarado: "Zero declarado",
    ausencia_oficial: "Ausência oficial confirmada",
    erro: "Verificação com erro",
    fora_da_serie_oficial: "Fora da série publicada pelo TSE",
    pleito_futuro: "Prestação ainda não devida",
    nao_coletado: "Ainda não coletado",
  },
  projectStatus: {
    aprovado: "Aprovado",
    arquivado: "Arquivado",
    tramitando: "Tramitando",
    vetado: "Vetado",
  },
  quizAxis: {
    corrupcao: "Transparência / Corrupção",
    costumes: "Costumes / Direitos Civis",
    direitos_sociais: "Direitos Sociais",
    economia: "Economia",
    meio_ambiente: "Meio Ambiente",
    politica_fiscal: "Política Fiscal",
    seguranca: "Segurança",
    trabalho: "Trabalho",
  },
  quizPosition: {
    a_favor: "A favor",
    ambiguo: "Ambíguo",
    contra: "Contra",
  },
  stateIndicatorFonte: {
    atlas_violencia: "Atlas da Violência (Ipea)",
    capag: "Tesouro Transparente · CAPAG",
    ibge_sidra: "IBGE · SIDRA",
    inep_ideb: "INEP · IDEB",
    ipeadata: "Ipeadata",
    siconfi: "Tesouro · Siconfi",
  },
  tema: {
    administracao_publica: "Administração Pública",
    agronegocio: "Agronegócio",
    costumes: "Costumes / Direitos Civis",
    direitos_sociais: "Direitos Sociais",
    economia: "Economia",
    educacao: "Educação",
    institucional: "Institucional",
    justica: "Justiça",
    meio_ambiente: "Meio Ambiente",
    politica_fiscal: "Política Fiscal",
    previdencia: "Previdência",
    reforma_trabalhista: "Reforma Trabalhista",
    seguranca: "Segurança",
    social: "Social",
    teto_gastos: "Teto de Gastos",
    trabalho: "Trabalho",
    transferencia_renda: "Transferência de Renda",
    transparencia: "Transparência",
  },
  voteBadge: {
    abstencao: "Abstenção",
    ausente: "Ausente",
    nao: "Não",
    obstrucao: "Obstrução",
    sim: "Sim",
  },
  voteLegend: {
    abstencao: "Abstenção",
    ausente: "Ausente",
    nao: "Contra",
    obstrucao: "Obstrução",
    sim: "A favor",
  },
  voteShort: {
    abstencao: "Abs.",
    ausente: "Aus.",
    nao: "Não",
    obstrucao: "Obs.",
    sim: "Sim",
  },
} as const

function resolveTokenLabel(
  map: Record<string, string>,
  raw: string | null | undefined,
  casing: LabelCasing,
): string {
  if (!raw) return ""
  const sanitized = sanitizePtBrText(raw)
  const normalized = normalizeLookupKey(sanitized)
  const direct =
    map[normalized] ??
    map[normalized.replace(/ /g, "_")] ??
    map[normalized.replace(/ /g, "-")]
  if (direct) return direct
  const fixed = FIXED_COPY_LOOKUP[normalized]
  if (fixed) return fixed
  return composeLabel(sanitized, casing)
}

export function formatFixedUiCopy(raw: string | null | undefined): string {
  return resolveTokenLabel(FIXED_COPY_LOOKUP, raw, "title")
}

export function formatPublicLabel(raw: string | null | undefined, casing: LabelCasing = "title"): string {
  return resolveTokenLabel({}, raw, casing)
}

export function formatFinancingLabel(raw: FinancingBreakdownKey | string): string {
  return resolveTokenLabel(tokenLabels.financing, raw, "title")
}

export function formatTemaLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.tema, raw, "title")
}

export function formatProcessStatusLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.processStatus, raw, "sentence")
}

export function formatProcessTypeLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.processType, raw, "title")
}

/** Texto corrido do resumo processual: acentos PT-BR e inicial maiúscula, sem title-case palavra a palavra. */
export function formatProcessSummaryLabel(raw: string | null | undefined): string {
  if (!raw) return ""
  const sanitized = sanitizePtBrText(raw).trim()
  if (!sanitized) return ""
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1)
}

/** Rótulo público do estado de patrimônio de uma eleição (publicado, vazio confirmado ou não coletado). */
export function formatPatrimonioEleicaoEstadoLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.patrimonioEleicaoEstado, raw, "sentence")
}

/** Rótulo público do estado de financiamento de um pleito disputado. */
export function formatFinanciamentoEleicaoEstadoLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.financiamentoEleicaoEstado, raw, "sentence")
}

export function formatAttentionCategoryLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.attentionCategory, raw, "title")
}

export function formatProjectStatusLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.projectStatus, raw, "title")
}

export function formatGravityLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.gravity, raw, "title")
}

/** Rótulo curto para o pleito majoritário configurado na ficha (valor interno pode ser `Nenhum`). */
export function formatCargoDisputadoPublicLabel(raw: string | null | undefined): string {
  if (!raw) return ""
  if (raw === "Nenhum") return "Sem pleito majoritário em 2026"
  return sanitizePtBrText(raw)
}

export function formatCandidateStatusLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.candidateStatus, raw, "sentence")
}

export function formatQuizAxisLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.quizAxis, raw, "title")
}

export function formatQuizPositionLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.quizPosition, raw, "sentence")
}

export function formatStateIndicatorFonteLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.stateIndicatorFonte, raw, "title")
}

export function formatVoteBadgeLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.voteBadge, raw, "title")
}

export function formatVoteLegendLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.voteLegend, raw, "title")
}

export function formatVoteShortLabel(raw: string | null | undefined): string {
  return resolveTokenLabel(tokenLabels.voteShort, raw, "title")
}

export function buildCandidateShareTitle(nome: string, partidoSigla: string | null | undefined): string {
  const label = formatPartyPublicLabel(partidoSigla)
  return label
    ? `${nome} (${label}) · Ficha pública no Puxa Ficha`
    : `${nome} · Ficha pública no Puxa Ficha`
}

export function buildCandidateMetadataDescription(
  nome: string,
  partidoSigla: string | null | undefined,
): string {
  const label = formatPartyPublicLabel(partidoSigla)
  return label
    ? `Ficha pública de ${nome} (${label}) com dados disponíveis sobre patrimônio, processos, votações e financiamento quando houver fonte estruturada.`
    : `Ficha pública de ${nome} com dados disponíveis sobre patrimônio, processos, votações e financiamento quando houver fonte estruturada.`
}

export function buildTimelineMetadataDescription(nome: string): string {
  return `Cargos, partidos, patrimônio, processos, votações e gastos no mesmo eixo temporal: ${nome}.`
}

export function buildTimelineOgFallbackSubtitle(): string {
  return "Linha do tempo de candidatos com dados públicos (TSE, Câmara, Senado)."
}

export function buildTimelineOgSubtitle(countLabel: string): string {
  return `${countLabel}. Patrimônio, votações, processos, cargos, partidos e gastos na mesma linha.`
}
