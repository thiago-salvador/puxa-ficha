import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"

export const size = ogSize
export const contentType = ogContentType

export default function OpenGraphImage() {
  return buildEditorialOg({
    eyebrow: "Comparador",
    title: "Lado a lado",
    subtitle:
      "Compare patrimonio, processos, partidos e alertas de 2 a 4 candidatos em uma unica leitura.",
  })
}
