import type { IngestResult } from "./types"

export interface EvidenciaColeta {
  aplicavel: boolean
  volumeFonte: number
  detalhe: string
}

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

/**
 * Fecha o desfecho sem confundir dados retornados pela fonte com linhas novas.
 * Erros ja registrados no resultado sempre ganham de vazio ou nao aplicavel.
 */
export function finalizarColeta(
  resultado: IngestResult,
  evidencia: EvidenciaColeta,
): void {
  if (resultado.errors.length > 0) {
    resultado.coleta_resultado = "erro"
    resultado.coleta_detalhe = resultado.errors.join("; ").slice(0, 500)
    delete resultado.coleta_volume
    return
  }

  resultado.coleta_detalhe = evidencia.detalhe

  if (!evidencia.aplicavel) {
    resultado.coleta_resultado = "nao_aplicavel"
    delete resultado.coleta_volume
    return
  }

  const volumeFonte = Math.max(0, Math.trunc(evidencia.volumeFonte))
  if (volumeFonte > 0) {
    resultado.coleta_resultado = "encontrado"
    resultado.coleta_volume = volumeFonte
    return
  }

  resultado.coleta_resultado = "vazio_confirmado"
  delete resultado.coleta_volume
}

export function registrarErroColeta(
  resultado: IngestResult,
  erro: unknown,
  contexto?: string,
): void {
  const detalhe = contexto ? `${contexto}: ${mensagemErro(erro)}` : mensagemErro(erro)
  resultado.errors.push(detalhe)
  finalizarColeta(resultado, {
    aplicavel: true,
    volumeFonte: 0,
    detalhe,
  })
}
