import { buildEditorialOg } from "@/lib/og"

export function GET() {
  return buildEditorialOg({
    eyebrow: "Comparador",
    title: "Lado a lado",
    subtitle:
      "Compare dados públicos disponíveis de 2 a 4 candidatos em uma única leitura.",
  })
}
