/**
 * Formação pública: grau TSE + instituição complementar, nunca diploma implícito.
 */

const INSTITUICAO_RE =
  /^(universidade|pontif[ií]cia universidade|instituto|faculdade)\b/i

export function pareceNomeDeInstituicao(valor: string | null | undefined): boolean {
  const texto = valor?.trim() ?? ""
  if (!texto) return false
  return INSTITUICAO_RE.test(texto)
}

export function formatFormacaoPublica(
  grau: string | null | undefined,
  instituicao: string | null | undefined,
): string | null {
  const g = grau?.trim() || null
  const i = instituicao?.trim() || null
  if (g && i) return `${g} · ${i}`
  return g ?? i
}

export function formacaoPublicaDe(candidato: {
  formacao?: string | null
  formacao_instituicao?: string | null
}): string | null {
  return formatFormacaoPublica(candidato.formacao, candidato.formacao_instituicao)
}
