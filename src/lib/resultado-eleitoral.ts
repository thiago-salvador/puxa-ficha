/**
 * Resultado de um pleito, lido do REGISTRO — nunca inferido da forma da linha.
 *
 * O defeito que este módulo substitui deduzia derrota de duas coisas que não
 * dizem nada sobre resultado: `periodo_inicio === periodo_fim` e a palavra
 * "tse" aparecer em qualquer lugar da observação. Isso publicava 157 linhas com
 * "Não Eleito" cujo raw diz ELEITO, incluindo "2002 - Não Eleito" e
 * "2022 - Não Eleito" na ficha do Lula.
 *
 * Dois eixos separados, como no próprio TSE, que distingue `descricaoSituacao`
 * (Deferido/Indeferido) de `descricaoTotalizacao` (Eleito/Não eleito/Concorrendo):
 *
 * - `situacao`: o que aconteceu com o REGISTRO da candidatura.
 * - `resultado`: o que aconteceu na TOTALIZAÇÃO dos votos.
 *
 * Lula 2018 é o caso que exige os dois: registro indeferido, e por isso nem
 * chegou a ter totalização ("Concorrendo" congelado no payload do TSE). Chamar
 * isso de "Não Eleito" afirma uma disputa que não houve.
 *
 * Precedência: campo estruturado (`eleito_por`) primeiro, `observacoes` só como
 * fallback quando o estruturado está mudo. Não existe inferência
 * `tipo_evento='mandato'` ⇒ eleito: mandato sem resultado com lastro fica
 * `desconhecido` e a ficha imprime só o período.
 */

import { stripAccents } from "@/lib/strip-accents"

export type ResultadoEleitoral =
  | "eleito"
  | "eleito_por_qp"
  | "eleito_por_media"
  | "nao_eleito"
  | "suplente"
  /** Cargo não obtido em pleito popular: nomeação, sucessão, mesa diretora, direção partidária. */
  | "nao_aplicavel"
  /** Sem lastro, ou fontes em conflito. A ficha não afirma nada. */
  | "desconhecido"

/** Situação do registro da candidatura, eixo independente da totalização. */
export type SituacaoRegistro = "indeferido" | "inapto" | "cancelado" | null

export interface ClassificacaoEleitoral {
  resultado: ResultadoEleitoral
  situacao: SituacaoRegistro
  /** Campo que decidiu o `resultado`, para auditoria e manifesto. */
  fonte: "eleito_por" | "observacoes" | "conflito" | "ausente"
}

type LinhaClassificavel = {
  eleito_por?: string | null
  observacoes?: string | null
}

function normalizar(valor: string | null | undefined): string {
  return stripAccents((valor ?? ""))
    .trim()
    .toLowerCase()
}

/**
 * Valores observados em `historico_politico.eleito_por` na base (conferidos por
 * contagem antes de escrever este mapa). Valor fora do mapa é MUDO, não é erro:
 * cai no fallback de `observacoes`.
 */
const ELEITO_POR: ReadonlyMap<string, ResultadoEleitoral> = new Map([
  ["voto direto", "eleito"],
  ["eleito", "eleito"],
  ["voto popular", "eleito"],
  ["segundo turno", "eleito"],
  ["voto direto/suplencia", "eleito"],
  ["eleito por qp", "eleito_por_qp"],
  ["eleito por media", "eleito_por_media"],
  ["media", "eleito_por_media"],
  ["nao eleito", "nao_eleito"],
  ["suplente", "suplente"],
  ["suplencia", "suplente"],
  ["suplencia/efetivacao", "suplente"],
  // Cargo que não vem de urna. Marcar como não aplicável impede tanto o falso
  // "Não Eleito" quanto o falso "Eleito" em presidência de casa legislativa.
  ["nomeacao", "nao_aplicavel"],
  ["sucessao constitucional", "nao_aplicavel"],
  ["sucessao", "nao_aplicavel"],
  ["mesa diretora", "nao_aplicavel"],
  ["eleicao interna", "nao_aplicavel"],
  ["voto legislativo", "nao_aplicavel"],
  ["eleicao partidaria", "nao_aplicavel"],
])

/** `NÃO ELEITO` precisa ser testado antes de `ELEITO`, que é seu sufixo. */
const OBS_NAO_ELEITO = /n(a|ã)o[\s-]*eleit[oa]/i
const OBS_ELEITO_QP = /eleit[oa]\s+por\s+qp\b|quociente\s+partidario/i
const OBS_ELEITO_MEDIA = /eleit[oa]\s+por\s+m(e|é)dia/i
const OBS_ELEITO = /\beleit[oa]\b/i
const OBS_SUPLENTE = /\bsuplente\b/i

const OBS_INDEFERIDO = /\bindeferid[oa]\b/i
const OBS_INAPTO = /\binapt[oa]\b|situacao\s+inapto/i
const OBS_CANCELADO = /\b(cancelad[oa]|registro\s+cassad[oa]|impugnad[oa])\b/i

function situacaoDoRegistro(item: LinhaClassificavel): SituacaoRegistro {
  const bruto = item.observacoes ?? ""
  if (OBS_INDEFERIDO.test(bruto)) return "indeferido"
  if (normalizar(item.eleito_por) === "inapto" || OBS_INAPTO.test(bruto)) return "inapto"
  if (OBS_CANCELADO.test(bruto)) return "cancelado"
  return null
}

function resultadoPelaObservacao(observacoes: string | null | undefined): ResultadoEleitoral | null {
  const bruto = observacoes ?? ""
  if (!bruto.trim()) return null
  if (OBS_NAO_ELEITO.test(bruto)) return "nao_eleito"
  if (OBS_ELEITO_QP.test(bruto)) return "eleito_por_qp"
  if (OBS_ELEITO_MEDIA.test(bruto)) return "eleito_por_media"
  if (OBS_SUPLENTE.test(bruto)) return "suplente"
  if (OBS_ELEITO.test(bruto)) return "eleito"
  return null
}

const VITORIAS: ReadonlySet<ResultadoEleitoral> = new Set([
  "eleito",
  "eleito_por_qp",
  "eleito_por_media",
])

/** `true` quando o resultado afirma que a pessoa venceu o pleito. */
export function ehVitoria(resultado: ResultadoEleitoral): boolean {
  return VITORIAS.has(resultado)
}

export function resolveResultadoEleitoral(item: LinhaClassificavel): ClassificacaoEleitoral {
  const situacao = situacaoDoRegistro(item)
  const peloEstruturado = ELEITO_POR.get(normalizar(item.eleito_por)) ?? null
  const pelaObservacao = resultadoPelaObservacao(item.observacoes)

  if (peloEstruturado != null) {
    // Estruturado é a autoridade, mas não contra um desmentido explícito do
    // raw. Quando os dois brigam, a ficha cala em vez de escolher um lado.
    const resultadosCompativeis =
      pelaObservacao == null ||
      peloEstruturado === pelaObservacao ||
      (ehVitoria(peloEstruturado) && ehVitoria(pelaObservacao))
    const desmentido = !resultadosCompativeis || (ehVitoria(peloEstruturado) && situacao != null)
    if (desmentido) return { resultado: "desconhecido", situacao, fonte: "conflito" }
    return { resultado: peloEstruturado, situacao, fonte: "eleito_por" }
  }

  if (pelaObservacao != null) return { resultado: pelaObservacao, situacao, fonte: "observacoes" }

  return { resultado: "desconhecido", situacao, fonte: "ausente" }
}

const ROTULO_RESULTADO: Readonly<Record<ResultadoEleitoral, string | null>> = {
  eleito: "Eleito",
  eleito_por_qp: "Eleito por quociente partidário",
  eleito_por_media: "Eleito por média",
  nao_eleito: "Não Eleito",
  suplente: "Suplente",
  nao_aplicavel: null,
  desconhecido: null,
}

const ROTULO_SITUACAO: Readonly<Record<NonNullable<SituacaoRegistro>, string>> = {
  indeferido: "Registro indeferido",
  inapto: "Registro inapto",
  cancelado: "Registro cancelado",
}

/**
 * Texto público do desfecho, ou `null` quando não há o que afirmar.
 * Situação do registro vence a totalização: candidatura indeferida não
 * "perdeu a eleição", ela não chegou a disputar.
 */
export function formatDesfechoEleitoralPublico(
  classificacao: ClassificacaoEleitoral,
): string | null {
  if (classificacao.situacao != null) return ROTULO_SITUACAO[classificacao.situacao]
  return ROTULO_RESULTADO[classificacao.resultado]
}
