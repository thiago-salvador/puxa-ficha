/**
 * Marcador de decisão editorial em `compromisso_evidencia`, sem coluna nova.
 *
 * Convenção: a cascata automática sempre grava `revisado_por` começando por
 * `PREFIXO_REVISOR_CASCATA` (ex.: "cascata c2 (jev + verificador)"), e a
 * retirada automática da reconciliação não mexe em `revisado_por`. Qualquer
 * outro `revisado_por` preenchido é decisão editorial, publicada ou retirada:
 * revisão da fila, mesa de curadoria ou retirada por
 * `promessa-evidencia-decidir.ts`, com o revisor nomeado em `revisado_por`
 * (pessoa, ou julgamento editorial apoiado no Jev). A cascata não sobrescreve nem retira linha com decisão editorial.
 */

export const PREFIXO_REVISOR_CASCATA = "cascata "

export function ehDecisaoEditorial(revisadoPor: string | null | undefined): boolean {
  if (typeof revisadoPor !== "string") return false
  const valor = revisadoPor.trim()
  return valor.length > 0 && !valor.startsWith(PREFIXO_REVISOR_CASCATA)
}

/** Chave natural do vínculo (a mesma do `UNIQUE NULLS NOT DISTINCT` da tabela). */
export function chaveDoVinculo(v: {
  programa_chave: string
  frase_id?: string | null
  tema_id: string | null
  tipo_evidencia: string
  evidencia_ref: string
}): string {
  return [v.programa_chave, v.frase_id ?? "", v.tema_id ?? "", v.tipo_evidencia, v.evidencia_ref].join("|")
}
