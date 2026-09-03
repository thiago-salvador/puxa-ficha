import type { IngestResult } from "./types"

/**
 * Fracao maxima de candidatos com erro que uma fonte pode ter sem reprovar a
 * execucao inteira.
 *
 * Antes o pipeline saia 1 com `totalErrors > 0`: um candidato que caiu num
 * soluco de rede da origem pintava de vermelho um run que gravou milhares de
 * linhas. Vermelho que aparece por ruido deixa de ser sinal, e a falha de
 * verdade (fonte inteira fora do ar) se perde no meio.
 *
 * O erro por candidato nao some: `registrarColetaDeResultados` grava cada um em
 * `coleta_log` com `resultado: "erro"`, que e a fonte da auditoria de frescor.
 * O limiar decide o codigo de saida, nao o registro.
 */
export const ERRO_MAX_FRACAO_PADRAO = 0.25

export interface ToleranciaFonte {
  fonte: string
  /** Resultados que representam tentativa real: `skipped` nao conta. */
  tentativas: number
  comErro: number
  fracao: number
  /** Toda tentativa da fonte terminou em erro. */
  fonteMorta: boolean
  reprovada: boolean
}

/**
 * Le o limiar de `PF_INGEST_ERRO_MAX_FRACAO`. Falha fechado: valor fora de
 * [0,1] ou nao numerico aborta, porque um typo virando 0 ou 1 silenciosamente
 * troca o contrato de saida do pipeline sem ninguem perceber.
 */
export function parseErroMaxFracao(raw: string | undefined): number {
  const texto = raw?.trim()
  if (!texto) return ERRO_MAX_FRACAO_PADRAO

  const valor = Number(texto)
  if (!Number.isFinite(valor) || valor < 0 || valor > 1) {
    throw new Error(
      `PF_INGEST_ERRO_MAX_FRACAO precisa ser uma fracao entre 0 e 1; recebido: ${texto}`,
    )
  }
  return valor
}

export function avaliarToleranciaPorFonte(
  resultados: IngestResult[],
  limiar: number,
): ToleranciaFonte[] {
  const porFonte = new Map<string, { tentativas: number; comErro: number }>()

  for (const resultado of resultados) {
    if (resultado.skipped) continue
    const atual = porFonte.get(resultado.source) ?? { tentativas: 0, comErro: 0 }
    atual.tentativas += 1
    if (resultado.errors.length > 0) atual.comErro += 1
    porFonte.set(resultado.source, atual)
  }

  return [...porFonte.entries()].map(([fonte, { tentativas, comErro }]) => {
    const fracao = tentativas > 0 ? comErro / tentativas : 0
    const fonteMorta = tentativas > 0 && comErro === tentativas
    return {
      fonte,
      tentativas,
      comErro,
      fracao,
      fonteMorta,
      reprovada: fonteMorta || fracao > limiar,
    }
  })
}

export function formatarTolerancia(t: ToleranciaFonte): string {
  const pct = (t.fracao * 100).toFixed(1)
  return `${t.fonte}: ${t.comErro}/${t.tentativas} candidato(s) com erro (${pct}%)`
}
