/**
 * Situação do registro na linha da candidatura corrente da trajetória.
 *
 * `historico_politico.observacoes` é texto livre gravado uma vez. A situação do
 * registro no TSE muda depois (julgamento, recurso), e quem atualiza essa
 * mudança escreve só `candidatos.situacao_candidatura`: o ingest agendado e as
 * migrations de mudança de situação nunca reescrevem a observação. Resultado
 * medido em produção em 24/09/2026: 24 fichas com a linha de 2026 afirmando uma
 * situação que o cabeçalho da mesma ficha desmentia ("aguardando julgamento" em
 * ficha deferida, "aguarda julgamento" em ficha indeferida com recurso,
 * "deferido" em ficha pendente de julgamento).
 *
 * A fonte única da situação é `situacao_candidatura`. Na linha da candidatura
 * corrente, este módulo retira da observação toda afirmação sobre a situação do
 * registro (congelada no dia em que o texto foi escrito) e acrescenta a
 * situação vigente, com o mesmo valor que o cabeçalho mostra. O resto da
 * observação (partido, fonte, contexto) fica como está.
 *
 * Só age quando a situação vigente é um estado emitido pelo TSE. Estados
 * editoriais ("candidatura declarada", "incerto") ou ausência de situação não
 * dão base para desmentir o texto, então a observação fica intacta.
 *
 * Módulo puro: sem import de next/*, server-only, fs ou Supabase.
 */

import { SITUACAO_CANDIDATURA_DOMINIO } from "@/lib/situacao-candidatura"

/** Estados do domínio que só existem com registro na base do TSE. */
const SITUACOES_EDITORIAIS: ReadonlySet<string> = new Set(["candidatura declarada", "incerto"])

export const SITUACAO_REGISTRO_TSE: readonly string[] = SITUACAO_CANDIDATURA_DOMINIO.filter(
  (situacao) => !SITUACOES_EDITORIAIS.has(situacao),
)

const SITUACOES_REGISTRO_TSE: ReadonlySet<string> = new Set(SITUACAO_REGISTRO_TSE)

/** Frase que carrega a situação vigente na linha. */
const PREFIXO_SITUACAO_VIGENTE = "Situação do registro no TSE:"

/**
 * Formas de afirmar a situação do registro que a base tem hoje, cada uma
 * medida em produção. A ordem importa: frases inteiras saem antes das
 * orações soltas.
 */
const REMOCOES: readonly RegExp[] = [
  // "Na consulta ao TSE de 12 de setembro de 2026, o registro estava deferido."
  /\s*Na consulta ao TSE de [^.]*?, o registro estava [^.]*\./gi,
  // "Em consulta ao DivulgaCandContas/TSE em 09/09/2026, o pedido de registro consta como Indeferido ..."
  /\s*Em consulta ao [^.]*?, o pedido de registro consta como [^.]*\./gi,
  // Frase já anexada por este módulo (idempotência).
  /\s*Situa[çc][ãa]o do registro no TSE:[^.]*\./gi,
  // "(aguardando julgamento, DivulgaCand 15/08 pós-prazo)"
  /\s*\([^()]*\b(?:aguardando julgamento|aguarda julgamento|pendente de julgamento|deferid[oa]|indeferid[oa]|p[óo]s-prazo)[^()]*\)/gi,
  // "TSE: aguardando julgamento, concorrendo; registro de candidatura, ..."
  /\b(?:aguardando julgamento|aguarda julgamento|pendente de julgamento|(?:in)?deferid[oa](?: em prazo recursal ou com recurso| com recurso)?)\s*,\s*concorrendo\s*;\s*/gi,
  // "... consta na base oficial de candidaturas do TSE e aguarda julgamento; ..."
  /\s+e aguarda julgamento\b/gi,
  // "; registro pendente não equivale a candidatura deferida"
  /\s*;\s*registro pendente n[ãa]o equivale a candidatura deferid[oa]/gi,
  // "; não equivale a registro de candidatura deferido no TSE"
  /\s*;\s*n[ãa]o equivale a registro de candidatura deferid[oa][^.;]*/gi,
  // "; sem registro deferido no TSE na data de curadoria (NOVO 2026)"
  /\s*;\s*sem registro deferido no TSE[^.;(]*?(?=\s*\(|[.;]|$)/gi,
  // ", ainda dependente de convenção/registro eleitoral"
  /,\s*ainda dependente de conven[çc][ãa]o\/registro eleitoral/gi,
  // Forma antiga: "; situação: registrada, aguardando julgamento"
  /\s*;\s*situa[çc][ãa]o:\s*[^.;]*/gi,
]

/**
 * Qualquer resto de afirmação de situação depois das remoções dirigidas. Se
 * sobrar, a frase inteira sai: melhor perder uma frase do que publicar uma
 * situação que o cabeçalho desmente.
 */
const RESIDUO_SITUACAO =
  /aguard\w*\s+julgamento|pendente de julgamento|registro pendente|\b(?:in)?deferid[oa]s?\b|prazo recursal|dependente de conven/i

function removerFrasesComResiduo(texto: string): string {
  return texto
    .split(/(?<=\.)\s+/)
    .filter((frase) => !RESIDUO_SITUACAO.test(frase))
    .join(" ")
}

function arrumarEspacos(texto: string): string {
  return texto
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/([.;,])\1+/g, "$1")
    .trim()
}

/**
 * Tira da observação toda afirmação sobre a situação do registro. Pura e
 * idempotente. Devolve `null` quando não sobra texto.
 */
export function removerSituacaoCongeladaDaObservacao(
  observacoes: string | null | undefined,
): string | null {
  if (!observacoes?.trim()) return null
  let texto = observacoes
  for (const padrao of REMOCOES) texto = texto.replace(padrao, "")
  texto = arrumarEspacos(texto)
  if (RESIDUO_SITUACAO.test(texto)) texto = arrumarEspacos(removerFrasesComResiduo(texto))
  if (!texto || /^[.;,:\s]*$/.test(texto)) return null
  return /[.!?]$/.test(texto) ? texto : `${texto}.`
}

/** `true` quando o valor é um estado de registro emitido pelo TSE. */
function ehSituacaoRegistroTse(situacao: string | null | undefined): situacao is string {
  return situacao != null && SITUACOES_REGISTRO_TSE.has(situacao.trim())
}

/**
 * Observação pública da linha da candidatura corrente: sem a situação
 * congelada e com a situação vigente. Sem situação do TSE conhecida, devolve a
 * observação original.
 */
export function observacaoComSituacaoVigente(
  observacoes: string | null | undefined,
  situacaoCandidatura: string | null | undefined,
): string | null {
  if (!ehSituacaoRegistroTse(situacaoCandidatura)) return observacoes ?? null
  const base = removerSituacaoCongeladaDaObservacao(observacoes)
  const vigente = `${PREFIXO_SITUACAO_VIGENTE} ${situacaoCandidatura.trim()}.`
  return base ? `${base} ${vigente}` : vigente
}
