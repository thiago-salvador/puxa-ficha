import type { TCUConsultaFonte, TCUVerificacao } from "./types"

/** Recibo `tcu` já validado quanto a resultado terminal e data de execução. */
export interface ReciboTCU {
  resultado: TCUVerificacao["resultado"]
  executado_em: string
  volume: unknown
  url: unknown
  detalhe: unknown
  escopo: unknown
}

const CONSULTAS_TCU = [
  ["responsaveis_inabilitados", "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados", "inabilitados_itens"] as const,
  ["responsaveis_contas_irregulares", "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares", "cadirreg_itens"] as const,
]

function safeTcuUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:" && parsed.hostname === "certidoes.apps.tcu.gov.br" && !parsed.search && !parsed.hash
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}

/**
 * Deriva o recibo público da consulta TCU.
 *
 * "Encontrado" só vale quando o recibo registra, por cadastro consultado, a
 * contagem de itens devolvidos pelo TCU. Recibos antigos gravavam no volume o
 * número de linhas escritas pelo coletor, não o número de registros no TCU;
 * sem a contagem por cadastro eles não sustentam achado nem ausência e ficam
 * como consulta pendente.
 */
export function derivarTCUVerificacao(recibo: ReciboTCU): TCUVerificacao {
  const { resultado } = recibo
  const volume = typeof recibo.volume === "number" && Number.isFinite(recibo.volume) && recibo.volume >= 0
    ? Math.trunc(recibo.volume)
    : null
  const detalheFonte = typeof recibo.detalhe === "string" ? recibo.detalhe : ""
  const fontes: TCUConsultaFonte[] = CONSULTAS_TCU.flatMap(([cadastro, consultaUrl, volumeKey]) => {
    const volumeMatch = detalheFonte.match(new RegExp(`${volumeKey}=(\\d+)`))
    if (!detalheFonte.includes(consultaUrl) && !volumeMatch) return []
    const fonteVolume = volumeMatch ? Number(volumeMatch[1]) : null
    return [{
      cadastro,
      url: consultaUrl,
      resultado: fonteVolume === null ? "pendente" as const : fonteVolume > 0 ? "encontrado" as const : "vazio_confirmado" as const,
      volume: fonteVolume,
    }]
  })
  const registrosEncontrados = fontes.reduce(
    (total, fonte) => total + (fonte.resultado === "encontrado" && fonte.volume !== null ? fonte.volume : 0),
    0,
  )
  const semContagemPorCadastro = resultado === "encontrado" && registrosEncontrados === 0
  const estado: TCUVerificacao["estado"] =
    resultado === "encontrado" && registrosEncontrados > 0
      ? "encontrado_em_revisao"
      : resultado === "vazio_confirmado"
        ? "vazio_verificado"
        : "pendente"
  const url = estado === "encontrado_em_revisao"
    ? fontes.find((fonte) => fonte.resultado === "encontrado")?.url ?? null
    : fontes[0]?.url ?? safeTcuUrl(recibo.url)
  const detalhe = estado === "encontrado_em_revisao"
    ? `Consulta TCU encontrou ${registrosEncontrados} registro${registrosEncontrados === 1 ? "" : "s"}; revisão editorial pendente.`
    : estado === "vazio_verificado"
      ? "Consultas oficiais TCU retornaram zero registros no escopo verificado."
      : semContagemPorCadastro
        ? "Consulta TCU antiga, sem contagem de registros por cadastro; nova consulta pendente. O resultado não deve ser interpretado como achado nem como ausência."
        : "Consulta TCU inconclusiva; o resultado não deve ser interpretado como ausência."
  return {
    fonte: "tcu",
    resultado,
    estado,
    executado_em: recibo.executado_em,
    volume: estado === "encontrado_em_revisao" ? registrosEncontrados : volume,
    detalhe,
    url,
    escopo: typeof recibo.escopo === "string" ? recibo.escopo : null,
    fontes,
  }
}
