/**
 * Display honesto do contador de processos judiciais (2026-08-05).
 *
 * Processos não têm ingest: as linhas existentes vêm de verificação manual em
 * parte dos candidatos (critério em docs/criterio-processos-judiciais.md), e
 * não existe base pública que permita busca por pessoa. Um "0" no card de
 * overview afirmava ficha limpa para quem ninguém verificou. Zero sem
 * verificação vira "—" com a legenda "não verificado"; contagem positiva
 * continua numérica, com o destaque criminal existente.
 */
export interface ProcessosOverviewDisplay {
  value: string | number
  sub?: string
}

export const PROCESS_STATUS_NEUTRAL =
  "comunicacao_processual_publicada_merito_nao_inferido"

const TERMINAL_PROCESS_STATUS = new Set([
  "absolvido",
  "anulado",
  "arquivado",
  "extinto",
  "prescrito",
])

function normalizeProcessStatus(status: string | null | undefined): string {
  return (status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/** Status terminal governa cor, gravidade e linguagem temporal da UI. */
export function isTerminalProcessStatus(status: string | null | undefined): boolean {
  const normalized = normalizeProcessStatus(status)
  return [...TERMINAL_PROCESS_STATUS].some(
    (terminal) => normalized === terminal || normalized.startsWith(`${terminal}_`),
  )
}

export function isProcessStatusNeutral(
  status: string | null | undefined,
): boolean {
  return normalizeProcessStatus(status) === PROCESS_STATUS_NEUTRAL
}

export function processoPodeContarComoCriminal(
  processo: Pick<import("@/lib/types").Processo, "status" | "tipo">,
): boolean {
  return (
    processo.tipo === "criminal" &&
    !isTerminalProcessStatus(processo.status) &&
    !isProcessStatusNeutral(processo.status)
  )
}

export function processoBorderColor(
  processo: Pick<import("@/lib/types").Processo, "status" | "tipo" | "gravidade">,
): string {
  if (isTerminalProcessStatus(processo.status)) return "#d4d4d4"
  if (
    (processo.tipo === "criminal" && processo.gravidade !== null) ||
    processo.gravidade === "alta"
  ) return "#dc2626"
  if (processo.gravidade === "media") return "#f59e0b"
  return "#d4d4d4"
}

export function processoTemporalLabel(
  processo: Pick<import("@/lib/types").Processo, "status" | "data_inicio" | "data_decisao">,
): { label: string; date: string } | null {
  if (isTerminalProcessStatus(processo.status)) {
    return processo.data_decisao ? { label: "Decisão em", date: processo.data_decisao } : null
  }
  return processo.data_inicio ? { label: "Desde", date: processo.data_inicio } : null
}

export function processosOverviewDisplay(
  total: number | null | undefined,
  criminais?: number | null,
  verificacao?: Pick<import("@/lib/types").ProcessosVerificacao, "resultado"> | null,
): ProcessosOverviewDisplay {
  const n = total ?? 0
  if (n > 0) {
    return {
      value: n,
      sub: (criminais ?? 0) > 0 ? `${criminais} criminal` : undefined,
    }
  }
  if (verificacao?.resultado === "vazio_confirmado") {
    return { value: 0, sub: "escopo verificado" }
  }
  /**
   * Legenda por desfecho registrado (2026-08-10). Enquanto todo zero sem
   * contagem lia "não verificado", a ficha dizia que ninguém procurou para 169
   * das 194, inclusive para as 7 que a curadoria do DJEN buscou de ponta a
   * ponta e fechou como identidade não confirmada. Só a ausência de linha
   * autoriza dizer que não houve tentativa.
   */
  switch (verificacao?.resultado) {
    case "indeterminado":
      return { value: "—", sub: "identidade não confirmada" }
    case "encontrado":
      return { value: "—", sub: "em revisão editorial" }
    case "sem_achado_no_escopo":
      return { value: "—", sub: "escopo limitado" }
    case "erro":
      return { value: "—", sub: "busca não concluída" }
    case "nao_aplicavel":
      return { value: "—", sub: "não se aplica" }
    default:
      return { value: "—", sub: "não verificado" }
  }
}

function processosNaoVerificado(total: number | null | undefined): boolean {
  return typeof processosOverviewDisplay(total).value !== "number"
}

/**
 * Lista compacta (cards e coluna Processos): 0 processos é o display pedido
 * para ausência de contagem, não uma afirmação de ficha limpa. A ficha e o
 * overview continuam em `processosOverviewDisplay` ("—" + legenda).
 */
export function processosResumoLabel(total: number | null | undefined): string {
  if (processosNaoVerificado(total)) return "0 processos"
  return total === 1 ? "1 processo" : `${total} processos`
}

/** Número da coluna Processos na lista: 0 quando não há contagem verificada. */
export function processosListaCount(total: number | null | undefined): number {
  if (processosNaoVerificado(total)) return 0
  return total ?? 0
}

/**
 * Decide o selo "maior" pela mesma régua usada para exibir processos.
 * Se algum selecionado não tiver uma contagem verificada, não há comparação
 * honesta possível e nenhum candidato recebe o selo.
 */
export function processosMaiorVerificadoNaComparacao(
  total: number | null | undefined,
  totaisSelecionados: Array<number | null | undefined>,
): boolean {
  const displays = totaisSelecionados.map((item) => processosOverviewDisplay(item))
  if (displays.some((display) => typeof display.value !== "number")) return false

  const totalDisplay = processosOverviewDisplay(total)
  if (typeof totalDisplay.value !== "number") return false

  const valores = displays.map((display) => display.value as number)
  const max = Math.max(...valores)
  const todosIguais = valores.every((valor) => valor === max)

  return totalDisplay.value === max && totalDisplay.value > 0 && !todosIguais
}
