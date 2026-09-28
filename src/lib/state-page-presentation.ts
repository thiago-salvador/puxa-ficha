import { getEstadoComPreposicao, getEstadoNome } from "@/lib/br-uf"

/**
 * Caminho canônico para /uf/<UF>/... quando a sigla chega em caixa alta ou
 * mista (/uf/BA, /uf/Ba/senado). Devolve null quando já está canônico ou
 * quando o segmento não é uma sigla válida (esse caso segue para o 404).
 * Roda no middleware: a página é ISR e não pode ler a query para redirecionar.
 */
export function getCanonicalUfPathname(pathname: string): string | null {
  const segments = pathname.split("/")
  if (segments[1] !== "uf" || !segments[2]) return null
  let segment = segments[2]
  try {
    segment = decodeURIComponent(segment)
  } catch {
    return null
  }
  if (!/^[a-z]{2}$/i.test(segment)) return null
  const lower = segment.toLowerCase()
  if (!getEstadoNome(lower) || segments[2] === lower) return null
  segments[2] = lower
  return segments.join("/")
}

export function getStatePagePresentation(uf: string) {
  const name = getEstadoNome(uf)
  if (!name) return null
  const code = uf.toUpperCase()
  const ofState = getEstadoComPreposicao(uf, "de")!
  return {
    name,
    ofState,
    inState: getEstadoComPreposicao(uf, "em")!,
    title: `Eleições 2026: Governo ${ofState} (${code}) | Puxa Ficha`,
    description: `Consulte candidaturas, programas por tema, pesquisas e indicadores ${ofState}, com fontes, períodos e limites de cobertura.`,
    path: `/uf/${uf.toLowerCase()}`,
    image: `/uf/${uf.toLowerCase()}/opengraph-image`,
  }
}
