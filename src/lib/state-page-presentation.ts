import { getEstadoNome } from "@/lib/br-uf"

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
