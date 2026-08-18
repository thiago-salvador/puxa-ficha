import { buildEditorialOg } from "@/lib/og"

export function GET() {
  return buildEditorialOg({
    eyebrow: "Candidatos mapeados",
    title: "Puxa Ficha",
    subtitle:
      "Fontes públicas consultadas para comparar candidatos mapeados em 2026.",
  })
}
