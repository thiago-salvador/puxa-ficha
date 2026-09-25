import { urlFonteEPortalJudiciario } from "@/lib/djen-consulta-url"
import { stripAccents } from "@/lib/strip-accents"
import type { Processo } from "@/lib/types"

export { urlPublicaDoProcesso } from "@/lib/djen-consulta-url"

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

type ProcessosBusca = Pick<import("@/lib/types").ProcessosVerificacao, "resultado"> &
  Partial<Pick<import("@/lib/types").ProcessosVerificacao, "executado_em" | "escopo">>

const PROCESSOS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export function processosVazioFrescor(verificacao: ProcessosBusca | null | undefined, now = new Date()): "atual" | "desatualizado" | "invalido" {
  if (verificacao?.resultado !== "vazio_confirmado" || !verificacao.escopo?.trim()) return "invalido"
  const checkedAt = verificacao.executado_em ? Date.parse(verificacao.executado_em) : Number.NaN
  if (!Number.isFinite(checkedAt) || checkedAt > now.getTime()) return "invalido"
  return now.getTime() - checkedAt > PROCESSOS_MAX_AGE_MS ? "desatualizado" : "atual"
}

/** A existência de linhas publicadas não encerra nem corrige um recibo de busca. */
export function processosBuscaAvisoComLinhas(
  verificacao: ProcessosBusca | null | undefined,
  now = new Date(),
  omittedCount = 0,
): { title: string; description: string } | null {
  const published = "Os registros abaixo têm fontes próprias; a contagem não comprova cobertura completa."
  if (!verificacao) return {
    title: "Busca judicial sem recibo",
    description: `Não há recibo da busca para esta ficha. ${published}`,
  }
  if (verificacao.resultado === "vazio_confirmado") return {
    title: "Recibo judicial contraditório",
    description: `O recibo informa vazio, mas há registros publicados. A divergência precisa de revisão. ${published}`,
  }
  if (verificacao.resultado === "erro") return {
    title: "Busca judicial não concluída",
    description: `Uma fonte ou etapa da busca falhou. ${published}`,
  }
  if (verificacao.resultado === "indeterminado") return {
    title: "Busca judicial indeterminada",
    description: `A busca não permitiu atribuir outras ocorrências com segurança. ${published}`,
  }
  if (verificacao.resultado === "sem_achado_no_escopo") return {
    title: "Cobertura judicial parcial",
    description: `A busca cobriu apenas parte das fontes. ${published}`,
  }
  if (omittedCount > 0) return {
    title: "Cobertura judicial parcial",
    description: `${omittedCount} registro(s) ficaram fora da contagem por falta de URL judicial com CNJ exato. ${published}`,
  }
  const checkedAt = verificacao.executado_em ? Date.parse(verificacao.executado_em) : Number.NaN
  if (!verificacao.escopo?.trim() || !Number.isFinite(checkedAt) || checkedAt > now.getTime()) return {
    title: "Frescor da busca judicial indefinido",
    description: `O recibo não comprova data e escopo válidos. ${published}`,
  }
  if (now.getTime() - checkedAt > PROCESSOS_MAX_AGE_MS) return {
    title: "Busca judicial desatualizada",
    description: `A busca tem mais de 14 dias. ${published}`,
  }
  return null
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
  return stripAccents((status ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizeProcessNarrative(value: string | null | undefined): string {
  return stripAccents(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Processos diferentes podem compartilhar uma única síntese editorial. A UI
 * agrupa somente descrições iguais dentro da mesma categoria, sem eliminar os
 * CNJs nem as fontes que sustentam o grupo.
 */
export function groupProcessosForDisplay<T extends Processo>(processos: T[]): T[][] {
  const groups = new Map<string, T[]>()

  for (const processo of processos) {
    const narrative = normalizeProcessNarrative(processo.descricao)
    const key = narrative ? `${processo.tipo}:${narrative}` : `id:${processo.id}`
    const current = groups.get(key)

    if (current) current.push(processo)
    else groups.set(key, [processo])
  }

  return [...groups.values()]
}

/**
 * Algumas cargas antigas usaram `status` como uma segunda narrativa. O badge
 * só deve aparecer quando acrescenta informação independente da descrição.
 */
export function processStatusRepeatsDescription(
  processo: Pick<Processo, "descricao" | "status">,
): boolean {
  const description = normalizeProcessNarrative(processo.descricao)
  const status = normalizeProcessNarrative(processo.status)

  if (!description || !status) return false
  if (description === status) return true
  if (Math.min(description.length, status.length) < 80) return false

  const descriptionWords = new Set(description.split(" "))
  const statusWords = new Set(status.split(" "))
  const smallerSize = Math.min(descriptionWords.size, statusWords.size)
  if (smallerSize === 0) return false

  let sharedWords = 0
  for (const word of descriptionWords) {
    if (statusWords.has(word)) sharedWords += 1
  }

  return sharedWords / smallerSize >= 0.8
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
  verificacao?: ProcessosBusca | null,
  now = new Date(),
  omittedCount = 0,
): ProcessosOverviewDisplay {
  const n = total ?? 0
  if (n > 0) {
    return {
      value: n,
      sub: [(criminais ?? 0) > 0 ? `${criminais} criminal` : null, omittedCount > 0 ? "cobertura parcial" : null].filter(Boolean).join(" · ") || undefined,
    }
  }
  if (omittedCount > 0) return { value: "—", sub: "cobertura parcial" }
  if (verificacao?.resultado === "vazio_confirmado") {
    const frescor = processosVazioFrescor(verificacao, now)
    if (frescor === "atual") return { value: 0, sub: "escopo verificado" }
    return { value: "—", sub: frescor === "desatualizado" ? "busca desatualizada" : "recibo incompleto" }
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

/** Lista, ficha e embed compartilham a mesma evidência para afirmar zero. */
export function processosResumoLabel(
  total: number | null | undefined,
  verificacao?: ProcessosBusca | null,
  now = new Date(),
  omittedCount = 0,
): string {
  const display = processosOverviewDisplay(total, undefined, verificacao, now, omittedCount)
  if (typeof display.value !== "number") return `Processos: ${display.sub}`
  return display.value === 1 ? "1 processo" : `${display.value} processos`
}

/** Sem recibo de ausência, a coluna não inventa uma contagem numérica. */
export function processosListaCount(
  total: number | null | undefined,
  verificacao?: ProcessosBusca | null,
  now = new Date(),
  omittedCount = 0,
): number | string {
  return processosOverviewDisplay(total, undefined, verificacao, now, omittedCount).value
}

export function processoFonteLabel(
  processo: Pick<import("@/lib/types").Processo, "status" | "url_fonte">,
): string {
  if (urlFonteEPortalJudiciario(processo.url_fonte)) return "Fonte oficial"
  if (isTerminalProcessStatus(processo.status)) return "Fonte jornalística"
  return "Fonte oficial"
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
