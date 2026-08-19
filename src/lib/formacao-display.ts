/**
 * Formação pública: grau TSE + instituição complementar, nunca diploma implícito.
 */

const INSTITUICAO_RE =
  /^(universidade|pontif[ií]cia universidade|centro universit[aá]rio|instituto|faculdade)\b/i

export function pareceNomeDeInstituicao(valor: string | null | undefined): boolean {
  const texto = valor?.trim() ?? ""
  if (!texto) return false
  return INSTITUICAO_RE.test(texto)
}

export function formatFormacaoPublica(
  grau: string | null | undefined,
  instituicao: string | null | undefined,
): string | null {
  let g = grau?.trim() || null
  let i = instituicao?.trim() || null
  if (pareceNomeDeInstituicao(g)) {
    if (!i) i = g
    g = null
  }
  if (g && i) return `${g} · ${i}`
  if (g) return g
  return null
}

export function formacaoPublicaDe(candidato: {
  formacao?: string | null
  formacao_instituicao?: string | null
}): string | null {
  return formatFormacaoPublica(candidato.formacao, candidato.formacao_instituicao)
}
