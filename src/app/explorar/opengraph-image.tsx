import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"

export const size = ogSize
export const contentType = ogContentType

export default function OpenGraphImage() {
  return buildEditorialOg({
    eyebrow: "Explorar",
    title: "Candidatos 2026",
    subtitle:
      "Modo visual em tela cheia para navegar pelos nomes da corrida presidencial antes do calendario eleitoral apertar.",
  })
}
