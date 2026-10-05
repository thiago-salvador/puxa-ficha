import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Footer } from "@/components/Footer"
import { Resultado1TurnoUf } from "@/components/Resultado1TurnoUf"
import { getEstadoComPreposicao, getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import { carregarFotos1Turno } from "@/lib/fotos-1turno"
import { buildTwitterMetadata } from "@/lib/metadata"

// Só as 27 UFs em minúsculas existem; qualquer outro valor, inclusive "SP", é 404 de verdade.
// Não gerar a variante maiúscula: em disco que não diferencia maiúsculas (APFS), o SP.html do
// redirect sobrescreve o sp.html e a página entra em loop de redirect (achado do QA de 05/10).
export const dynamicParams = false

export async function generateStaticParams() {
  return getEstadoUFs().map((uf) => ({ uf }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uf: string }>
}): Promise<Metadata> {
  const { uf } = await params
  const nome = getEstadoNome(uf)
  if (!nome) return {}
  const title = `1º turno ${getEstadoComPreposicao(uf, "em") ?? `em ${nome}`}: resultado de Governador e Senado | Puxa Ficha`
  const description = `Votos, porcentagem dos válidos e situação de cada candidato a Governador e Senador ${getEstadoComPreposicao(uf, "em") ?? `em ${nome}`} no 1º turno, com a fonte oficial do TSE.`
  const path = `/1o-turno/${uf.toLowerCase()}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: `https://puxaficha.com.br${path}` },
    twitter: buildTwitterMetadata({ title, description }),
  }
}

export default async function PrimeiroTurnoUfPage({
  params,
}: {
  params: Promise<{ uf: string }>
}) {
  const { uf } = await params
  if (!getEstadoNome(uf)) notFound()
  const fotos = await carregarFotos1Turno(["Governador", "Senador"])

  return (
    <>
      <Resultado1TurnoUf uf={uf} fotos={fotos} />
      <Footer />
    </>
  )
}
