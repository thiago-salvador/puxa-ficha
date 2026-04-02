import { getEstadoNome } from "@/lib/api"
import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"

export const size = ogSize
export const contentType = ogContentType

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ uf: string }>
}) {
  const { uf } = await params
  const nome = getEstadoNome(uf) ?? uf.toUpperCase()

  return buildEditorialOg({
    eyebrow: "Governadores",
    title: nome,
    subtitle: `Ficha completa e comparacao dos candidatos a governador de ${nome} nas eleicoes de 2026.`,
    meta: `${uf.toUpperCase()} · Puxa Ficha`,
  })
}
