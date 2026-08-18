/**
 * Sanitização pública ÚNICA de textos editoriais (observações, fontes, perfis).
 *
 * Duas exigências que brigam, e é por isso que este módulo existe:
 *
 * 1. O identificador interno do TSE não pode ser publicado. Tirar só o rótulo
 *    `SQ_CANDIDATO` e deixar o número é não tirar nada.
 * 2. A URL não pode ser tocada. Ela é a prova, e o id dentro dela é o que faz o
 *    link resolver.
 *
 * Duas ORDENS importam aqui, e as duas já falharam antes:
 *
 * - **URL sai primeiro.** A máscara de CPF/CNPJ casa sequências de 11 e de 14
 *   dígitos, então um id desse tamanho dentro da URL virava
 *   "[documento mascarado]" e o link quebrava calado.
 * - **SQ/id sai antes da máscara.** Com a máscara primeiro,
 *   `SQ_CANDIDATO 28000160782` (11 dígitos) vira
 *   `SQ_CANDIDATO [documento mascarado]`: o rótulo interno sobrevive porque a
 *   regra do par já não acha o número.
 */

import { sanitizePublicText } from "@/lib/public-text"

const DOCUMENT_LIKE_SEQUENCE_RE =
  /(^|[^\d])((?:\d{3}\.?\d{3}\.?\d{3}-?\d{2})|(?:\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})|\d{11}|\d{14})(?=$|[^\d])/g

function mascararDocumentosCru(value: string): string {
  return value.replace(
    DOCUMENT_LIKE_SEQUENCE_RE,
    (_match, prefix: string) => `${prefix}[documento mascarado]`,
  )
}

/**
 * URL até o próximo ESPAÇO. Parar em `)` truncava URL do TSE com parêntese, e
 * truncar link é o mesmo defeito de mascarar dentro dele. A pontuação que
 * encerra frase volta ao texto, fora da URL.
 */
const URL_RE = /https?:\/\/\S+/g

function separarPontuacaoFinal(url: string): { limpa: string; cauda: string } {
  let limpa = url
  let cauda = ""
  for (;;) {
    const ultimo = limpa.at(-1)
    if (ultimo == null) break
    const ehPontuacao = ".,;:!?".includes(ultimo)
    const ehFechaSemPar =
      (ultimo === ")" && !limpa.includes("(")) ||
      (ultimo === "]" && !limpa.includes("[")) ||
      (ultimo === "}" && !limpa.includes("{")) ||
      `"'>`.includes(ultimo)
    if (!ehPontuacao && !ehFechaSemPar) break
    cauda = ultimo + cauda
    limpa = limpa.slice(0, -1)
  }
  return { limpa, cauda }
}

/** Marcador de URL retirada. Sem dígito por dentro, base 26 para não colidir. */
function TOKEN(i: number): string {
  let n = i
  let sufixo = ""
  do {
    sufixo = String.fromCharCode(65 + (n % 26)) + sufixo
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `[[URL${sufixo}]]`
}

/**
 * Retira as URLs, roda `fn` no texto sem elas e devolve as URLs no lugar, byte a
 * byte. É a única forma honesta de limpar o texto sem arriscar a prova.
 */
function preservandoUrls(valor: string, fn: (semUrls: string) => string): string {
  const urls: string[] = []
  const comToken = valor.replace(URL_RE, (bruta) => {
    const { limpa, cauda } = separarPontuacaoFinal(bruta)
    urls.push(limpa)
    return `${TOKEN(urls.length - 1)}${cauda}`
  })
  const limpo = fn(comToken)
  return urls.reduce((acc, url, i) => acc.split(TOKEN(i)).join(url), limpo)
}

/**
 * Máscara de documento que NUNCA entra em URL. É esta que o resto do código usa,
 * inclusive para `redes_sociais` e qualquer outro campo que carregue link: a
 * versão crua não é exportada de propósito.
 */
export function maskDocumentLikeSequences(value: string | null | undefined): string {
  return preservandoUrls(value ?? "", mascararDocumentosCru)
}

/** `SQ_CANDIDATO 280000625869`, `SQ 90000012450`, `SQ_CANDIDATO=280000625869`. */
const SQ_COM_VALOR = /\bSQ(?:[_\s]*CANDIDATO)?\b\s*[:=]?\s*\d{6,}/gi
/** Forma já meio traduzida, quando a substituição antiga rodou antes. */
const SQ_JA_TRADUZIDO = /\bidentificador oficial do TSE\s*[:=]?\s*\d{6,}/gi
/** O rótulo sozinho ("identidade confirmada pelo SQ_CANDIDATO"). */
const SQ_SEM_VALOR = /\bSQ[_\s]*CANDIDATO\b/gi
/**
 * Identificador com rótulo genérico: "DivulgaCandContas 2022 id 270001654140".
 * Só 10 dígitos ou mais, para não comer ano nem número de votação.
 */
const ID_SOLTO = /\b(?:id|identificador|sq)\b\s*[:=]?\s*\d{10,}/gi

const ROTULO = "identificador oficial do TSE"

function limparJargao(texto: string): string {
  const semIdentificador = texto
    .replace(SQ_JA_TRADUZIDO, ROTULO)
    .replace(SQ_COM_VALOR, ROTULO)
    .replace(ID_SOLTO, ROTULO)
    .replace(SQ_SEM_VALOR, ROTULO)
  return sanitizePublicText(mascararDocumentosCru(semIdentificador))
    .replace(/\bconsulta_cand(?:_[0-9]{4})?\b/gi, "base oficial de candidaturas do TSE")
    .replace(/\buma?\s+row\b/gi, "um registro")
    .replace(/\brows\b/gi, "registros")
    .replace(/\brow\b/gi, "registro")
}

export function sanitizeObservacaoPublica(value: string | null | undefined): string | null {
  if (value == null) return null
  return preservandoUrls(value, limparJargao)
}

/**
 * Mesma limpeza para a lista de fontes. A varredura de 10/08 achou 65 entradas
 * em 63 fichas com identificador numérico solto FORA de URL. O valor continua no
 * banco; o que muda é o que a ficha publica.
 */
export function sanitizeFontePublica(value: string | null | undefined): string | null {
  if (value == null) return null
  return preservandoUrls(value, limparJargao)
}
