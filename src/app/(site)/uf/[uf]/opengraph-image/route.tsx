import { getEstadoNome } from "@/lib/api"
import { buildEditorialOg } from "@/lib/og"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uf: string }> }
) {
  const { uf } = await params
  const nome = getEstadoNome(uf) ?? uf.toUpperCase()

  return buildEditorialOg({
    eyebrow: "Estado",
    title: nome,
    subtitle: `Indicadores territoriais e candidatos a governador de ${nome} nas eleições de 2026.`,
    meta: `${uf.toUpperCase()} · Puxa Ficha`,
  })
}
