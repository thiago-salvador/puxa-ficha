export type QuizVotoNormalizado = "sim" | "nao" | "abstencao" | "ausente" | "obstrucao"

export type PosicaoDeclaradaTipo = "a_favor" | "contra" | "ambiguo"

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
  /** Contagem de projetos por valor bruto de `projetos_lei.tema` (fase 2). */
  pls_por_tema?: Record<string, number>
  /** Primeiro `url_inteiro_teor` encontrado por tema (fase 2, link no detalhe). */
  pl_url_exemplo_por_tema?: Record<string, string>
  /** Posicoes curadas com verificado=true (fase 2). */
  posicoes_declaradas?: QuizPosicaoDeclarada[]
  /** Votacoes do quiz marcadas com contradicao no banco. */
  contradicoes_voto?: QuizContradicaoVoto[]
  mudancas_partido_count?: number
}

export interface QuizAlignmentDataset {
  candidatos: QuizCandidatoData[]
  /** UUIDs de votacoes_chave usadas pelo quiz neste build */
  votacoes_mapeadas: string[]
  /** titulo exato em votacoes_chave -> id (runtime) */
  votacao_titulo_to_id: Record<string, string>
  /** titulo da votacao -> URL publica da proposicao (Câmara/Senado), quando houver id na base */
  votacao_fonte_por_titulo?: Record<string, string | null>
}

export type QuizConfiabilidade = "alta" | "media" | "baixa"

export interface QuizScoreExplanation {
  resumo: string
  user_position: { eco: number; soc: number }
  candidato_position: { eco: number; soc: number }
  peso_voto_usado: number
  peso_espectro_usado: number
  /** Fracao efetiva posicoes declaradas no blend fase 2 (0 se fase 1). */
  peso_posicoes_usado?: number
  /** Fracao efetiva projetos por tema no blend fase 2. */
  peso_projetos_usado?: number
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
  /** Score medio 0-1 por eixo (votos + espectro simplificado por eixo). */
  por_eixo: Record<string, number>
  concordancias_voto: QuizVoteCompareItem[]
  divergencias_voto: QuizVoteCompareItem[]
  alertas_contradicao: QuizContradicaoVoto[]
  mudancas_partido_count: number
}

export interface QuizScoreResult {
  candidato_slug: string
  score_final: number
  score_votacoes: number | null
  score_espectro: number
  score_posicoes: number | null
  score_projetos: number | null
  votos_comparados: number
  confiabilidade: QuizConfiabilidade
  explanation: QuizScoreExplanation
  detalhe?: QuizScoreDetalhe
}
