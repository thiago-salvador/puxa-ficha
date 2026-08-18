import { buildEditorialOg } from "@/lib/og"

export function GET() {
  return buildEditorialOg({
    eyebrow: "Governadores",
    title: "Por estado",
    subtitle:
      "Mapa e diretório para consultar candidatos a governador em cada UF nas eleições de 2026.",
  })
}
