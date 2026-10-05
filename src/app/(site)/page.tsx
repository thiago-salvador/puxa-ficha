import type { Metadata } from "next"
import { Footer } from "@/components/Footer"
import { Resultado1TurnoBrasil } from "@/components/Resultado1TurnoBrasil"
import { carregarFotos1Turno } from "@/lib/fotos-1turno"
import { buildTwitterMetadata } from "@/lib/metadata"

// Desde 05/10/2026 a home é o resultado do 1º turno; a home anterior (finalistas) mora em /2o-turno.
const title = "Puxa Ficha | Resultado do 1º turno das eleições 2026"
const description =
  "Votos, porcentagem dos válidos e situação de cada candidato a Presidente, Governador e Senador no 1º turno, com a fonte oficial do TSE."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br",
  },
  twitter: buildTwitterMetadata({ title, description }),
}

export default async function Home() {
  const fotos = await carregarFotos1Turno(["Presidente", "Governador", "Senador"])
  return (
    <>
      <Resultado1TurnoBrasil fotos={fotos} />
      <Footer />
    </>
  )
}
