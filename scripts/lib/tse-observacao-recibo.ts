import type { EntradaColeta } from "./coleta-log"

/**
 * Fonte própria do recibo da observação semanal dos pacotes do TSE
 * (`scripts/observe-home-updates.ts`). Não é `tse` nem `tse-situacao` de
 * propósito: a observação não grava fato de ficha, então não pode ocupar em
 * `coleta_log_ultima` o lugar do recibo do ingest que grava. O escopo é global
 * porque o alvo é o pacote oficial, não um candidato; por isso a fonte não
 * entra na régua de cobertura por ficha.
 */
export const FONTE_TSE_OBSERVACAO = "tse-observacao"

export const TSE_OBSERVACAO_URL = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026"

const LIMITE_DETALHE_ERRO = 3
const LIMITE_MENSAGEM = 300

export interface ResumoObservacaoTse {
  ano: number
  baseline: number
  unchanged: number
  changed: number
  skipped: number
  /** Erros devolvidos pelos coletores na rodada. */
  errors: readonly string[]
  /** Exceção que interrompeu a observação antes da contagem final. */
  falha: string | null
}

function contagem(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function resumirErros(errors: readonly string[]): string {
  return errors
    .slice(0, LIMITE_DETALHE_ERRO)
    .map((error) => error.replace(/\s+/g, " ").trim().slice(0, LIMITE_MENSAGEM))
    .join("; ")
}

/**
 * Recibo global da rodada. `encontrado` só quando algum valor oficial dos
 * pacotes foi confirmado contra uma ficha publicada; falha que interrompe a
 * rodada, ou rodada sem nenhum valor confirmado, vira `erro`. Erros parciais
 * ficam no detalhe, sem apagar a leitura que de fato aconteceu. O detalhe diz
 * que a rodada não atualiza a ficha, para o recibo não ser lido como escrita.
 */
export function reciboObservacaoTse(resumo: ResumoObservacaoTse): EntradaColeta {
  const baseline = contagem(resumo.baseline)
  const unchanged = contagem(resumo.unchanged)
  const changed = contagem(resumo.changed)
  const skipped = contagem(resumo.skipped)
  const confirmados = baseline + unchanged + changed
  const pacotes = [
    `consulta_cand_${resumo.ano}`,
    `bem_candidato_${resumo.ano}`,
    `consulta_cand_complementar_${resumo.ano}`,
  ].join(", ")
  const base =
    `Observação dos pacotes oficiais do TSE (${pacotes}) contra fichas publicadas. ` +
    "Grava só o histórico verificado; não atualiza fatos da ficha. " +
    `Valores confirmados: ${confirmados} (linha de base ${baseline}, sem mudança ${unchanged}, ` +
    `mudança ${changed}); sem confirmação: ${skipped}.`
  const alvo = `observacao_candidaturas_${resumo.ano}`

  if (resumo.falha !== null || confirmados === 0) {
    const motivo = resumo.falha !== null
      ? `Rodada interrompida: ${resumirErros([resumo.falha])}`
      : "Nenhum valor oficial confirmado contra ficha publicada."
    return {
      fonte: FONTE_TSE_OBSERVACAO,
      escopo: "global",
      alvo,
      resultado: "erro",
      volume: 0,
      url: TSE_OBSERVACAO_URL,
      detalhe: `${base} ${motivo}`,
    }
  }

  const erros = resumo.errors.length > 0
    ? ` ${resumo.errors.length} erro(s) na rodada: ${resumirErros(resumo.errors)}`
    : ""
  return {
    fonte: FONTE_TSE_OBSERVACAO,
    escopo: "global",
    alvo,
    resultado: "encontrado",
    volume: confirmados,
    url: TSE_OBSERVACAO_URL,
    detalhe: `${base}${erros}`,
  }
}
