import { ArrowRight } from "lucide-react"
import type { PatrimonioEleicaoPublico, ProcessosVerificacao } from "@/lib/types"
import {
  CHAVE_ESTADO_HISTORICO,
  CHAVE_ESTADO_VOTACOES,
  lerEstadoCelulaSuperficie,
  type VerificacaoCampos,
} from "@/lib/verificacao-campos"
import { formatDate } from "@/lib/utils"
import { NoticePanel } from "./NoticePanel"

interface EmptyStateProps {
  title: string
  description: string
  type?: "neutral" | "notable"
  suggestLabel?: string
  onSuggest?: () => void
}

export function EmptyState({ title, description, type = "neutral", suggestLabel, onSuggest }: EmptyStateProps) {
  return (
    <NoticePanel
      tone={type === "notable" ? "caution" : "neutral"}
      eyebrow={type === "notable" ? "Dado relevante" : undefined}
      title={title}
      description={description}
      align="center"
      rail={type === "notable"}
      className="mt-6"
      action={
        suggestLabel && onSuggest ? (
          <button
            onClick={onSuggest}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground px-4 py-1.5 text-[length:var(--text-caption)] font-bold text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            {suggestLabel}
            <ArrowRight className="size-3" />
          </button>
        ) : undefined
      }
    />
  )
}

/**
 * Correção de 2026-08-12: o estado vazio afirmava ausência na base do TSE
 * olhando só para `hasHistorico`, sem consultar o estado por eleição. Medido em
 * produção naquele dia: das 194 fichas públicas, 34 estavam sem patrimônio e 30
 * dessas não tinham UMA ausência conferida na fonte oficial, então a ficha dizia
 * "Nenhum patrimônio declarado no TSE" sobre coleta que nunca aconteceu (23
 * delas com o eyebrow "Dado relevante", que ainda dramatiza a invenção).
 *
 * O contrato do projeto já era explícito em `ui-labels.ts`: `vazio_confirmado` é
 * fonte oficial conferida sem bens, `nao_coletado` é coleta pendente e nunca
 * ausência presumida. É a mesma correção que `getFinanciamentoEmptyState`
 * recebeu em 10/08; patrimônio ficou para trás.
 *
 * `eleicoes` ausente ou nulo significa série desconhecida, e série desconhecida
 * não autoriza afirmar nada sobre o TSE.
 */
export function getPatrimonioEmptyState(
  hasHistorico: boolean,
  eleicoes?: ReadonlyArray<Pick<PatrimonioEleicaoPublico, "estado">> | null,
) {
  const semSerie = eleicoes === undefined || eleicoes === null
  const aplicaveis = (eleicoes ?? []).filter((eleicao) => eleicao.estado !== "publicado")
  const pendentes = aplicaveis.some((eleicao) => eleicao.estado === "nao_coletado")
  const confirmadas = aplicaveis.filter((eleicao) => eleicao.estado === "vazio_confirmado")

  if (!semSerie && aplicaveis.length === 0) {
    return {
      title: "Sem pleito com declaração de bens nesta ficha",
      description:
        "A trajetória pública desta ficha não registra candidatura com declaração de bens devida ao TSE. Isto não é uma consulta à base do TSE.",
      type: "neutral" as const,
    }
  }

  if (semSerie || pendentes || confirmadas.length === 0) {
    return {
      title: "Patrimônio ainda não coletado",
      description:
        "Isto não é uma consulta à base do TSE: nenhuma ausência de bens foi verificada na fonte oficial para os pleitos desta ficha. Pendência de coleta não é ausência de patrimônio.",
      type: "neutral" as const,
    }
  }

  if (hasHistorico) {
    return {
      title: "Nenhum patrimônio declarado no TSE",
      description:
        "A fonte oficial foi conferida em todos os pleitos aplicáveis e não registra bens declarados. Para um candidato com histórico de cargos públicos, essa ausência é uma informação relevante.",
      type: "notable" as const,
    }
  }
  return {
    title: "Sem bens declarados ao TSE",
    description:
      "A fonte oficial foi conferida em todos os pleitos aplicáveis e não registra declaração de bens.",
    type: "neutral" as const,
  }
}

/**
 * Honestidade sobre o vazio (2026-08-05): processos judiciais não têm ingest.
 * Os 30 processos do site vêm de verificação manual num grupo restrito de
 * candidatos. A copy anterior ("não foram encontrados... nas bases
 * consultadas") afirmava uma consulta que nunca aconteceu, e deixava o leitor
 * inferir ficha limpa.
 *
 * Correção de 2026-08-10: o DataJud continua sem expor as partes, mas o DJEN
 * (Comunicações Processuais do PJe/CNJ) expõe, nos campos `destinatarios`,
 * `destinatarioadvogados` e no inteiro teor do ato. A curadoria daquele dia
 * buscou 32 fichas por ali. Por isso os desfechos com linha registrada deixam
 * de falar como se ninguém tivesse procurado: só a ficha SEM linha nenhuma pode
 * dizer que não há tentativa registrada.
 */
export function getProcessosEmptyState(verificacao?: ProcessosVerificacao | null) {
  const data = verificacao?.executado_em ? formatDate(verificacao.executado_em) : null

  if (verificacao?.resultado === "vazio_confirmado") {
    return {
      title: "Nenhum processo confirmado no escopo consultado",
      description: `A busca concluída${data ? ` em ${data}` : ""} não encontrou processo publicável nas fontes verificadas. O resultado vale apenas para esse escopo e não equivale a uma certidão de ficha limpa.`,
      type: "neutral" as const,
    }
  }

  if (verificacao?.resultado === "encontrado") {
    return {
      title: "Ocorrências judiciais em revisão",
      description:
        "A busca encontrou ocorrências, mas nenhuma está pronta para exibição nesta ficha. Identidade, estado atual e redação editorial precisam ser confirmados antes da publicação.",
      type: "neutral" as const,
    }
  }

  /**
   * Curadoria de 10/08/2026: as 32 fichas de prioridade 1 e 2 foram buscadas no
   * Diário de Justiça Eletrônico Nacional, 8.842 comunicações lidas, e 7
   * fecharam como indeterminado (`cabo-daciolo`, `edmilson-costa`,
   * `samara-martins`, `jayme-campos`, `joao-campos`, `marcelo-maranata`,
   * `raquel-lyra`). Nelas a busca foi feita e foi exaustiva; o que falta é
   * segundo identificador no ato judicial, e em dois casos há CPF divergente
   * provando homônimo. Dizer "inconclusiva" sem dizer que a busca ocorreu
   * deixava o leitor inferir trabalho não feito.
   */
  if (verificacao?.resultado === "indeterminado") {
    return {
      title: "Busca feita, identidade não confirmada",
      description: `A busca judicial foi executada${data ? ` em ${data}` : ""} e nenhum registro pôde ser atribuído a esta pessoa: os documentos oficiais localizados não trazem um segundo identificador (CPF, cargo ou parte vinculada no mesmo processo) que feche a identidade. Como nomes se repetem, atribuir sem prova produziria acusação falsa. Nada foi atribuído, e isso não significa ficha limpa.`,
      type: "neutral" as const,
    }
  }

  if (verificacao?.resultado === "sem_achado_no_escopo") {
    return {
      title: "Busca feita, escopo limitado",
      description: `A curadoria${data ? ` de ${data}` : ""} cobriu apenas parte das fontes possíveis e não achou processo publicável dentro desse recorte. O recorte não cobre a Justiça inteira, então a ausência aqui não é conclusão nem ficha limpa.`,
      type: "neutral" as const,
    }
  }

  if (verificacao?.resultado === "erro") {
    return {
      title: "Não foi possível concluir a busca judicial",
      description:
        "Uma fonte ou etapa de identificação falhou. O resultado permanece pendente e não pode ser interpretado como ausência de processos.",
      type: "neutral" as const,
    }
  }

  return {
    title: "Processos judiciais ainda não verificados",
    description:
      "Ainda não há uma tentativa de busca com resultado registrado para esta ficha. A ausência de registros aqui não significa ficha limpa.",
    type: "neutral" as const,
  }
}

export function getVotosEmptyState(
  hasLegislativeHistory: boolean,
  verificacaoCampos?: VerificacaoCampos | null,
) {
  const estado = lerEstadoCelulaSuperficie(verificacaoCampos, CHAVE_ESTADO_VOTACOES)
  if (estado?.estado === "nao_aplicavel") {
    return {
      title: `Não se aplica: ${estado.motivo}`,
      description: `Regra verificada em ${estado.verificado_em}.`,
      type: "neutral" as const,
    }
  }

  if (!hasLegislativeHistory) {
    return {
      title: "Sem histórico legislativo estruturado",
      description:
        "O histórico público estruturado desta ficha ainda não traz mandato legislativo; por isso não exibimos votações registradas neste recorte.",
      type: "neutral" as const,
    }
  }
  return {
    title: "Votações ainda não coletadas",
    description:
      "As bases consultadas ainda não têm votações-chave estruturadas para esta ficha.",
    type: "neutral" as const,
  }
}

export function VotosEmptyState({
  hasLegislativeHistory,
  verificacaoCampos,
}: {
  hasLegislativeHistory: boolean
  verificacaoCampos?: VerificacaoCampos | null
}) {
  const estado = lerEstadoCelulaSuperficie(verificacaoCampos, CHAVE_ESTADO_VOTACOES)
  return (
    <div data-pf-votos-empty-state={estado?.estado ?? "pendente"}>
      <EmptyState {...getVotosEmptyState(hasLegislativeHistory, verificacaoCampos)} />
    </div>
  )
}

export function getTrajetoriaEmptyState(verificacaoCampos?: VerificacaoCampos | null) {
  const estado = lerEstadoCelulaSuperficie(verificacaoCampos, CHAVE_ESTADO_HISTORICO)
  if (estado?.estado === "vazio_confirmado") {
    return {
      title: "Sem candidatura anterior localizada",
      description: `Sem candidatura anterior localizada na varredura TSE (${estado.verificado_em}); candidatura 2026 em confirmação de registro`,
      type: "neutral" as const,
    }
  }

  return {
    title: "Trajetória ainda não confirmada",
    description:
      "Esta ficha ainda não tem histórico político estruturado. Isso não significa primeira candidatura nem ausência de cargos anteriores: a coleta ou a confirmação pode estar pendente.",
    type: "neutral" as const,
  }
}

export function getLegislacaoEmptyState(hasLegislativeHistory: boolean) {
  if (!hasLegislativeHistory) {
    return {
      title: "Sem histórico legislativo estruturado",
      description:
        "O histórico público estruturado desta ficha ainda não traz mandato legislativo; por isso não exibimos projetos ou atos legislativos neste recorte.",
      type: "neutral" as const,
    }
  }
  return {
    title: "Projetos de lei ainda não coletados",
    description:
      "As bases consultadas ainda não têm projetos ou atos legislativos com fonte estruturada para esta ficha.",
    type: "neutral" as const,
  }
}

/**
 * Honestidade sobre o vazio (2026-08-10): a copy anterior dizia "Não há
 * registros de financiamento de campanha para este candidato no TSE", que é uma
 * afirmação sobre a fonte oficial feita sem nenhuma consulta à fonte oficial.
 * Ela era falsa em casos provados contra o pacote do TSE: `flavio-bolsonaro`
 * tem R$ 5.988,00 em 2002, `cabo-daciolo` tem R$ 1.259,44 em 2006 e R$ 720,00
 * em 2008. A auditoria mediu o universo: de 718 candidaturas disputadas, 295
 * não têm linha aqui, e 153 delas têm prestação publicada pelo TSE.
 *
 * Este estado agora só aparece quando não há NENHUM pleito disputado a
 * descrever (os que existem viram linha própria, com estado e proveniência em
 * `financiamento-eleicoes.ts`), e não afirma mais nada sobre o acervo do TSE.
 */
export function getFinanciamentoEmptyState() {
  return {
    title: "Sem financiamento de campanha nesta ficha",
    description:
      "A trajetória pública desta ficha não registra candidatura com prestação de contas devida ao TSE. Isto não é uma consulta à base do TSE: nenhuma ausência foi verificada na fonte oficial.",
    type: "neutral" as const,
  }
}
