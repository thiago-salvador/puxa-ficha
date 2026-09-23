import { getEstadoNome } from "@/lib/br-uf"

export function getCanonicalStateRedirectPath(
  uf: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item))
    else if (value !== undefined) query.append(key, value)
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : ""
  return `/uf/${uf.toLowerCase()}${suffix}`
}

export function getStatePagePresentation(uf: string) {
  const name = getEstadoNome(uf)
  if (!name) return null
  const code = uf.toUpperCase()
  const government = code === "DF" ? `Governo do ${name}` : `Governo de ${name}`
  return {
    name,
    title: `Eleições 2026: ${government} (${code}) | Puxa Ficha`,
    description: `Consulte candidaturas, programas por tema, pesquisas e indicadores de ${name}, com fontes, períodos e limites de cobertura.`,
    path: `/uf/${uf.toLowerCase()}`,
    image: `/uf/${uf.toLowerCase()}/opengraph-image`,
  }
}
