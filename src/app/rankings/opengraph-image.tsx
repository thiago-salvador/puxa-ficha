import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"

export const size = ogSize
export const contentType = ogContentType

export default function OpenGraphImage() {
  return buildEditorialOg({
    eyebrow: "Rankings",
    title: "Rankings tematicos",
    subtitle: "Ordenacoes publicas por gastos parlamentares, patrimonio e trajetoria partidaria.",
    meta: "Puxa Ficha",
  })
}
