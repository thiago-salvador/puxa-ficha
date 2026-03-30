import { getCandidatosComResumo } from "@/lib/api"
import { CandidatoSlider } from "@/components/CandidatoSlider"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Explorar candidatos — Puxa Ficha",
  description:
    "Navegue pelos pre-candidatos a presidente 2026 em tela cheia. Dados publicos oficiais.",
}

export const revalidate = 3600

export default async function ExplorarPage() {
  const resumos = await getCandidatosComResumo()

  resumos.sort((a, b) =>
    a.candidato.nome_urna.localeCompare(b.candidato.nome_urna, "pt-BR")
  )

  const candidatos = resumos.map((r) => ({
    slug: r.candidato.slug,
    nome_urna: r.candidato.nome_urna,
    partido_sigla: r.candidato.partido_sigla,
    cargo: r.candidato.cargo_atual || r.candidato.cargo_disputado,
    foto_url: r.candidato.foto_url,
    processos: r.processos,
    patrimonio: r.patrimonio,
  }))

  return <CandidatoSlider candidatos={candidatos} />
}
