import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"

export const size = ogSize
export const contentType = ogContentType

export default function OpenGraphImage() {
  return buildEditorialOg({
    eyebrow: "Radiografia dos candidatos",
    title: "Puxa Ficha",
    subtitle:
      "Consulta publica sobre candidatos das eleicoes brasileiras de 2026 com ficha completa, comparador e navegacao editorial.",
  })
}
