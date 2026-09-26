/**
 * Vínculo público compromisso do programa x evidência. Só chega aqui o que a
 * view `compromisso_evidencia_publica` devolve (verificado, candidato público,
 * relação `relacionada` ou `sustenta`). Todo texto exibido vem da fonte.
 */
export const TIPOS_EVIDENCIA_PUBLICA = ["votacao_chave", "projeto_lei", "posicao_declarada", "fala", "contradicao"] as const
export type TipoEvidenciaPublica = (typeof TIPOS_EVIDENCIA_PUBLICA)[number]
export type RelacaoPublica = "relacionada" | "sustenta"

export type CompromissoEvidenciaPublica = {
  id: string
  temaId: string
  tipo: TipoEvidenciaPublica
  relacao: RelacaoPublica
  /** Identificação curta da fonte, montada de campos da fonte (ex.: "PL 1234/2020", "Voto: Sim"). */
  referencia: string
  /** Texto da fonte, sem edição: ementa, citação, título da votação ou do ponto. */
  texto: string
  data: string | null
  url: string | null
}

/**
 * Fonte do recibo por candidato em `coleta_log`. Gravado pelo publicador da
 * cascata (`scripts/promessa-evidencia-recibos.ts`) a cada execução, um por
 * candidato com programa aprovado. É o que separa "processado sem vínculo" de
 * "nunca processado" na ficha.
 */
export const FONTE_RECIBO_PROMESSA = "promessa-evidencia"

/** Recibo lido de `coleta_log_ultima`, já validado. */
export type ReciboPromessaEvidencia = {
  resultado: "encontrado" | "vazio_confirmado" | "sem_achado_no_escopo" | "nao_aplicavel" | "erro" | "indeterminado"
  executadoEm: string
  /** Programa processado na execução (`programa=` no detalhe). */
  programaChave: string | null
  /** Pares do pré-filtro avaliados pela cascata (`pares_avaliados=` no detalhe). */
  paresAvaliados: number | null
}

/**
 * Estado honesto da seção "Evidências relacionadas" de uma ficha.
 *
 * - `com_vinculos`: há vínculo publicado para mostrar.
 * - `nenhum_par`: processado; o pré-filtro não achou registro público do
 *   candidato em eixo comum com os temas do programa.
 * - `avaliados_nao_publicados`: processado; houve pares candidatos, mas nenhum
 *   passou nos critérios automáticos de publicação.
 * - `vinculos_sem_exibicao`: o recibo registra vínculo publicado, mas nenhum
 *   pôde ser exibido (fonte ausente ou não exibível na ficha).
 * - `sem_documento_oficial`: não há programa oficial para comparar.
 * - `nao_processado`: sem recibo concluído para o programa atual.
 * - `erro_leitura`: a leitura falhou agora; nada pode ser afirmado.
 */
export type EstadoEvidenciasPrograma =
  | { estado: "com_vinculos"; itens: CompromissoEvidenciaPublica[]; processadoEm: string | null }
  | { estado: "nenhum_par"; processadoEm: string }
  | { estado: "avaliados_nao_publicados"; processadoEm: string; paresAvaliados: number | null }
  | { estado: "vinculos_sem_exibicao"; processadoEm: string }
  | { estado: "sem_documento_oficial" }
  | { estado: "nao_processado" }
  | { estado: "erro_leitura" }

const RESULTADOS_RECIBO = new Set<ReciboPromessaEvidencia["resultado"]>([
  "encontrado", "vazio_confirmado", "sem_achado_no_escopo", "nao_aplicavel", "erro", "indeterminado",
])

/** Formato do `detalhe` do recibo: pares `chave=valor` separados por `;`. */
export function detalheReciboPromessa(campos: { programaChave: string; paresAvaliados: number; publicados: number; versao: string }): string {
  return `programa=${campos.programaChave};pares_avaliados=${campos.paresAvaliados};publicados=${campos.publicados};cascata=${campos.versao}`
}

/** Valida a linha crua de `coleta_log_ultima`; forma inesperada vira `null`. */
export function lerReciboPromessa(linha: unknown): ReciboPromessaEvidencia | null {
  if (!linha || typeof linha !== "object") return null
  const { resultado, executado_em: executadoEm, detalhe } = linha as Record<string, unknown>
  if (typeof resultado !== "string" || !RESULTADOS_RECIBO.has(resultado as ReciboPromessaEvidencia["resultado"])) return null
  if (typeof executadoEm !== "string" || Number.isNaN(Date.parse(executadoEm))) return null
  const campos = new Map(
    (typeof detalhe === "string" ? detalhe : "").split(";").map((par) => {
      const i = par.indexOf("=")
      return i > 0 ? [par.slice(0, i).trim(), par.slice(i + 1).trim()] as const : ["", ""] as const
    }),
  )
  const pares = Number(campos.get("pares_avaliados"))
  return {
    resultado: resultado as ReciboPromessaEvidencia["resultado"],
    executadoEm,
    programaChave: campos.get("programa") || null,
    paresAvaliados: campos.has("pares_avaliados") && Number.isInteger(pares) && pares >= 0 ? pares : null,
  }
}

/**
 * Decide o estado da seção a partir do que foi lido. Puro: a regra inteira
 * cabe num teste. Vínculo publicado sempre aparece; sem vínculo, só o recibo do
 * programa atual autoriza dizer que houve processamento.
 */
export function estadoDasEvidencias(input: {
  itens: CompromissoEvidenciaPublica[] | null
  recibo: ReciboPromessaEvidencia | null
  reciboFalhou: boolean
  programaChave: string
}): EstadoEvidenciasPrograma {
  const { itens, recibo, reciboFalhou, programaChave } = input
  if (itens === null) return { estado: "erro_leitura" }
  const reciboAtual = recibo && recibo.programaChave === programaChave ? recibo : null
  if (itens.length > 0) return { estado: "com_vinculos", itens, processadoEm: reciboAtual?.executadoEm ?? null }
  if (reciboFalhou) return { estado: "erro_leitura" }
  if (!reciboAtual) return { estado: "nao_processado" }
  switch (reciboAtual.resultado) {
    case "vazio_confirmado":
      return { estado: "nenhum_par", processadoEm: reciboAtual.executadoEm }
    case "sem_achado_no_escopo":
      return { estado: "avaliados_nao_publicados", processadoEm: reciboAtual.executadoEm, paresAvaliados: reciboAtual.paresAvaliados }
    // Vínculo publicado cuja fonte a ficha não consegue exibir (ex.: votação
    // sem título, fala fora do catálogo). Não é "nenhum passou nos critérios".
    case "encontrado":
      return { estado: "vinculos_sem_exibicao", processadoEm: reciboAtual.executadoEm }
    default:
      return { estado: "nao_processado" }
  }
}

export type EvidenciasPorTema = Map<string, CompromissoEvidenciaPublica[]>

export function agruparEvidenciasPorTema(itens: ReadonlyArray<CompromissoEvidenciaPublica>): EvidenciasPorTema {
  const grupos: EvidenciasPorTema = new Map()
  const ordenados = [...itens].sort((a, b) =>
    (b.data ?? "").localeCompare(a.data ?? "") || a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id))
  for (const item of ordenados) grupos.set(item.temaId, [...(grupos.get(item.temaId) ?? []), item])
  return grupos
}

const CARGOS_CONGRESSO = new Set(["Deputado Federal", "Senador"])

export function teveMandatoNoCongresso(historico: ReadonlyArray<{ cargo_canonico?: string | null; tipo_evento?: string | null }>): boolean {
  return historico.some((h) => h.tipo_evento === "mandato" && CARGOS_CONGRESSO.has(h.cargo_canonico ?? ""))
}

/**
 * Primeira URL segura de `pontos_atencao.fontes`. Em produção a coluna guarda
 * lista de strings; formatos antigos usam objetos `{ url }`. Os dois valem.
 */
export function primeiraUrlDeFontes(fontes: ReadonlyArray<unknown> | null | undefined): string | null {
  for (const fonte of fontes ?? []) {
    const url = urlSeguraDeFonte(typeof fonte === "string" ? fonte : (fonte as { url?: unknown } | null)?.url)
    if (url) return url
  }
  return null
}

/** Só URL http(s) vira link; qualquer outra coisa some. */
export function urlSeguraDeFonte(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  try {
    const url = new URL(valor.trim())
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}
