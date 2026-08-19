/**
 * Formação pública: grau TSE + instituição complementar, nunca diploma implícito.
 * Grau vem do TSE. Instituição só aparece junto com o grau. Sozinha, some.
 */

const INSTITUICAO_RE =
  /^(universidade|pontif[ií]cia universidade|centro universit[aá]rio|instituto|faculdade)\b/i

export function pareceNomeDeInstituicao(valor: string | null | undefined): boolean {
  const texto = valor?.trim() ?? ""
  if (!texto) return false
  return INSTITUICAO_RE.test(texto)
}

function humanizarGrauTse(valor: string | null | undefined): string | null {
  const texto = valor?.trim() || null
  if (!texto) return null
  if (texto.length > 4 && texto === texto.toLocaleUpperCase("pt-BR")) {
    const lower = texto.toLocaleLowerCase("pt-BR")
    return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1)
  }
  return texto
}

export function formatFormacaoPublica(
  grau: string | null | undefined,
  instituicao: string | null | undefined,
): string | null {
  let g = humanizarGrauTse(grau)
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
