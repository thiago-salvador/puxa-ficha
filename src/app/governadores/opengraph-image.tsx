import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"

export const size = ogSize
export const contentType = ogContentType

export default function OpenGraphImage() {
  return buildEditorialOg({
    eyebrow: "Governadores",
    title: "Por estado",
    subtitle:
      "Mapa e diretorio para consultar candidatos a governador em cada UF nas eleicoes de 2026.",
  })
}
