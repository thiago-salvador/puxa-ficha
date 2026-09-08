import { getStatePagePresentation } from "@/lib/state-page-presentation"
import { buildEditorialOg } from "@/lib/og"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uf: string }> }
) {
  const { uf } = await params
  const presentation = getStatePagePresentation(uf)
  if (!presentation) return new Response("Estado não encontrado", { status: 404 })

  return buildEditorialOg({
    eyebrow: "Eleições 2026 · Governadores",
    title: presentation.name,
    subtitle: "Candidaturas · Programas por tema · Pesquisas · Contexto estadual",
    meta: `${uf.toUpperCase()} · Fontes e períodos de referência · Puxa Ficha`,
  })
}
