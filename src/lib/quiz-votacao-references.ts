/**
 * Referências nominais do quiz.
 *
 * O título é um rótulo editorial e pode ser duplicado, corrigido ou apontar
 * para outra casa legislativa. A seleção do loader usa a chave oficial
 * `fonte + votacao_id_api + proposicao_id`; o título só participa da busca
 * inicial e da compatibilidade com o scoring legado.
 */

export type QuizVotacaoFonte = "camara" | "senado"

export interface QuizVotacaoReferencia {
  questionId: string
  titulo: string
  aliases?: readonly string[]
  fonte: QuizVotacaoFonte
  votacao_id_api: string | null
  proposicao_id: string | null
  alternativas?: readonly QuizVotacaoIdentidade[]
}

export interface QuizVotacaoIdentidade {
  fonte: QuizVotacaoFonte
  votacao_id_api: string
  proposicao_id: string
  titulos?: readonly string[]
}

export interface QuizVotacaoCatalogRow {
  id: string
  titulo: string
  casa: string | null
  fonte: string | null
  votacao_id_api: string | null
  proposicao_id: string | null
}

export type QuizVotacaoResolutionStatus = "matched" | "missing" | "orphan"

export interface QuizVotacaoResolution {
  matchedByQuestionId: ReadonlyMap<string, QuizVotacaoCatalogRow>
  matchedRowsByQuestionId: ReadonlyMap<string, readonly QuizVotacaoCatalogRow[]>
  missingQuestionIds: readonly string[]
  orphanQuestionIds: readonly string[]
  /** Perguntas sem evento nominal por desenho editorial, não uma falha de ingestão. */
  knownUnmappedQuestionIds: readonly string[]
  /** Map legado: titulo editorial exato -> UUID da linha exata selecionada. */
  votacaoTituloToId: Readonly<Record<string, string>>
  votacaoTituloToIds: Readonly<Record<string, readonly string[]>>
  /** Estado por pergunta, para o loader construir uma mensagem auditável. */
  statusByQuestionId: Readonly<Record<string, QuizVotacaoResolutionStatus>>
}

/**
 * Identidades oficiais usadas pelas seis perguntas nominais do quiz.
 *
 * Os IDs da Câmara vêm do endpoint oficial de votação e os do Senado do
 * CodigoSessaoVotacao. O item RP9 permanece explicitamente sem ID de evento:
 * a linha pública de 2021 tem proposição, mas não tem uma votação plenária
 * nominal publicada, portanto não pode ser promovida por semelhança de título.
 */
export const QUIZ_VOTACAO_REFERENCIAS: readonly QuizVotacaoReferencia[] = [
  {
    questionId: "q01",
    titulo: "Reforma Trabalhista",
    fonte: "camara",
    votacao_id_api: "2122076-348",
    proposicao_id: "2122076",
  },
  {
    questionId: "q02",
    titulo: "Teto de Gastos (EC 95)",
    fonte: "camara",
    votacao_id_api: "2088351-324",
    proposicao_id: "2088351",
    aliases: ["Teto de Gastos (PEC 55)"],
  },
  {
    questionId: "q03",
    titulo: "Reforma da Previdência",
    fonte: "camara",
    votacao_id_api: "2192459-786",
    proposicao_id: "2192459",
    aliases: ["Reforma da Previdencia"],
    alternativas: [{ fonte: "senado", votacao_id_api: "6046", proposicao_id: "137999", titulos: ["Reforma da Previdencia"] }],
  },
  {
    questionId: "q04",
    titulo: "Privatização da Eletrobras",
    fonte: "camara",
    votacao_id_api: "2270789-73",
    proposicao_id: "2270789",
    alternativas: [{ fonte: "senado", votacao_id_api: "6377", proposicao_id: "146740", titulos: ["Privatização da Eletrobras (Senado)"] }],
  },
  {
    questionId: "q05",
    titulo: "Orçamento Secreto (Emendas de Relator)",
    fonte: "camara",
    votacao_id_api: null,
    proposicao_id: "2297261",
  },
  {
    questionId: "q06",
    titulo: "Autonomia do Banco Central",
    fonte: "camara",
    votacao_id_api: "2265124-70",
    proposicao_id: "2265124",
    alternativas: [{ fonte: "senado", votacao_id_api: "6248", proposicao_id: "135147" }],
  },
]

export function quizVotacaoLookupTitles(): string[] {
  return [...new Set(QUIZ_VOTACAO_REFERENCIAS.flatMap((ref) => [
    ref.titulo,
    ...(ref.aliases ?? []),
    ...(ref.alternativas ?? []).flatMap((identity) => identity.titulos ?? []),
  ]))]
}

function sameNullable(a: string | null | undefined, b: string | null): boolean {
  return (a ?? null) === b
}

function hasSameMatter(row: QuizVotacaoCatalogRow, ref: QuizVotacaoReferencia): boolean {
  const titles = [ref.titulo, ...(ref.aliases ?? []), ...(ref.alternativas ?? []).flatMap((identity) => identity.titulos ?? [])]
  const matterIds = [ref.proposicao_id, ...(ref.alternativas ?? []).map((identity) => identity.proposicao_id)]
  return titles.includes(row.titulo) && matterIds.some((proposicaoId) => sameNullable(row.proposicao_id, proposicaoId))
}

function identitiesFor(ref: QuizVotacaoReferencia): readonly QuizVotacaoIdentidade[] {
  return [
    { fonte: ref.fonte, votacao_id_api: ref.votacao_id_api ?? "", proposicao_id: ref.proposicao_id ?? "" },
    ...(ref.alternativas ?? []),
  ].filter((identity) => identity.votacao_id_api && identity.proposicao_id)
}

export function resolveQuizVotacaoCatalog(
  rows: readonly QuizVotacaoCatalogRow[],
): QuizVotacaoResolution {
  const matchedByQuestionId = new Map<string, QuizVotacaoCatalogRow>()
  const matchedRowsByQuestionId = new Map<string, readonly QuizVotacaoCatalogRow[]>()
  const missingQuestionIds: string[] = []
  const orphanQuestionIds: string[] = []
  const knownUnmappedQuestionIds = QUIZ_VOTACAO_REFERENCIAS
    .filter((ref) => ref.votacao_id_api == null)
    .map((ref) => ref.questionId)
  const votacaoTituloToId: Record<string, string> = {}
  const votacaoTituloToIds: Record<string, readonly string[]> = {}
  const statusByQuestionId: Record<string, QuizVotacaoResolutionStatus> = {}

  for (const ref of QUIZ_VOTACAO_REFERENCIAS) {
    const matches = identitiesFor(ref).flatMap((identity) => rows.filter((row) =>
      row.fonte === identity.fonte &&
      row.votacao_id_api === identity.votacao_id_api &&
      row.proposicao_id === identity.proposicao_id
    ))
    const uniqueMatches = [...new Map(matches.map((row) => [row.id, row])).values()]
    const exact = uniqueMatches[0]
    if (exact) {
      matchedByQuestionId.set(ref.questionId, exact)
      matchedRowsByQuestionId.set(ref.questionId, uniqueMatches)
      statusByQuestionId[ref.questionId] = "matched"
      votacaoTituloToId[ref.titulo] = exact.id
      votacaoTituloToIds[ref.titulo] = uniqueMatches.map((row) => row.id)
      for (const row of uniqueMatches) {
        if (!votacaoTituloToId[row.titulo]) votacaoTituloToId[row.titulo] = row.id
        votacaoTituloToIds[row.titulo] = [
          ...new Set([...(votacaoTituloToIds[row.titulo] ?? []), row.id]),
        ]
      }
      continue
    }

    // A matéria com identidade incompleta é um órfão, não um match tolerante.
    // Isso mantém a ausência explícita quando a linha existe sem fonte/evento.
    if (rows.some((row) => hasSameMatter(row, ref))) {
      orphanQuestionIds.push(ref.questionId)
      statusByQuestionId[ref.questionId] = "orphan"
    } else {
      missingQuestionIds.push(ref.questionId)
      statusByQuestionId[ref.questionId] = "missing"
    }
  }

  return {
    matchedByQuestionId,
    matchedRowsByQuestionId,
    missingQuestionIds,
    orphanQuestionIds,
    knownUnmappedQuestionIds,
    votacaoTituloToId,
    votacaoTituloToIds,
    statusByQuestionId,
  }
}
