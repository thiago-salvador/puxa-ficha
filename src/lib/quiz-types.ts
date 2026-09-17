import type { QuizVotacaoResolutionStatus } from "@/lib/quiz-votacao-references"

export type QuizVotoNormalizado =
  | "sim"
  | "nao"
  | "abstencao"
  | "ausente"
  | "obstrucao"
  | "artigo_17"

type PosicaoDeclaradaTipo = "a_favor" | "contra" | "ambiguo"

export interface QuizPosicaoDeclarada {
  tema: string
  posicao: PosicaoDeclaradaTipo
  descricao?: string | null
  fonte?: string | null
  url_fonte?: string | null
}

export interface QuizContradicaoVoto {
  votacao_titulo: string
  descricao: string
}

export interface QuizCandidatoData {
  id: string
  slug: string
  nome_urna: string
  partido_sigla: string
  foto_url: string | null
  cargo_disputado: string
  estado: string | null
  votos: Record<string, QuizVotoNormalizado>
  espectro_override?: { eixo_economico: number; eixo_social: number } | null
  /** Contagem de projetos por valor bruto de `projetos_lei.tema` (legado, fora do score). */
  pls_por_tema?: Record<string, number>
  /** Primeiro `url_inteiro_teor` encontrado por tema (legado, fora do score). */
  pl_url_exemplo_por_tema?: Record<string, string>
  /** Posições curadas com verificado=true. */
  posicoes_declaradas?: QuizPosicaoDeclarada[]
  /** Votacoes do quiz marcadas com contradicao no banco. */
  contradicoes_voto?: QuizContradicaoVoto[]
  mudancas_partido_count?: number
  /** Resumo TSE (maior doador / total), fora do score. */
  financiamento_contexto?: string | null
  /** Centroide editorial dos doadores, fora do score. */
  financiamento_doacao_perfil?: {
    eixo_economico: number
    eixo_social: number
    cobertura_classificada: number
  } | null
}

export interface QuizAlignmentDataset {
  candidatos: QuizCandidatoData[]
  /** UUIDs de votacoes_chave usadas pelo quiz neste build */
  votacoes_mapeadas: string[]
  /** titulo exato em votacoes_chave -> id (runtime) */
  votacao_titulo_to_id: Record<string, string>
  /** Título editorial -> todos os IDs oficiais equivalentes, inclusive entre casas. */
  votacao_titulo_to_ids?: Readonly<Record<string, readonly string[]>>
  /** Estado explícito da resolução por pergunta do quiz. */
  votacao_status_por_pergunta?: Readonly<Record<string, QuizVotacaoResolutionStatus>>
  /** titulo da votacao -> URL publica da proposicao (Câmara/Senado), quando houver id na base */
  votacao_fonte_por_titulo?: Record<string, string | null>
  /** ID oficial da votação -> URL pública da proposição, preservando a casa/evento. */
  votacao_fonte_por_id?: Readonly<Record<string, string | null>>
}

type QuizConfiabilidade = "alta" | "media" | "baixa"

export interface QuizScoreExplanation {
  resumo: string
  user_position: { eco: number | null; soc: number | null }
  candidato_position: { eco: number | null; soc: number | null }
  peso_voto_usado: number
  peso_espectro_usado: number
  /** Fração efetiva de posições diretas comparadas. */
  peso_posicoes_usado?: number
  /** Sempre 0: projetos não entram no score. */
  peso_projetos_usado?: number
  /** Sempre 0: financiamento não entra no score. */
  peso_financiamento_usado?: number
}

export interface QuizVoteCompareItem {
  pergunta_id: string
  pergunta_texto: string
  votacao_titulo: string
  alinha: boolean
  /** Pagina publica da proposicao (Câmara/Senado), quando disponivel no dataset. */
  fonte_url?: string | null
}

export interface QuizScoreDetalhe {
  /** Score médio 0-1 por eixo das comparações diretas. */
  por_eixo: Record<string, number>
  concordancias_voto: QuizVoteCompareItem[]
  divergencias_voto: QuizVoteCompareItem[]
  alertas_contradicao: QuizContradicaoVoto[]
  mudancas_partido_count: number
}

export interface QuizScoreResult {
  candidato_slug: string
  score_final: number | null
  score_votacoes: number | null
  score_espectro: number | null
  score_posicoes: number | null
  score_projetos: number | null
  score_financiamento: number | null
  concordancias_voto_count: number
  divergencias_voto_count: number
  votos_comparados: number
  votacoes_mapeadas_total: number
  /** Perguntas com evidência direta e resposta válida do usuário. */
  perguntas_comparadas: number
  /** Perguntas comparadas cuja evidência escolhida foi posição curada. */
  posicoes_comparadas: number
  /** Perguntas do quiz sem voto nominal nem posição curada aplicável. */
  perguntas_sem_evidencia: number
  /** Respostas válidas, excluindo ausência e sem_opiniao. */
  perguntas_respondidas: number
  confiabilidade: QuizConfiabilidade
  espectro_partidario_mapeado: boolean
  explanation: QuizScoreExplanation
  detalhe?: QuizScoreDetalhe
}
