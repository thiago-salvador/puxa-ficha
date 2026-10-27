import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PaginaSegundoTurno } from "@/components/PaginaSegundoTurno"
import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"
import { IMAGEM_DUELO_PATH } from "@/lib/compartilhar-duelo"
import { buildTwitterMetadata } from "@/lib/metadata"

// O 2º turno foi a home de 05/10 a 27/10/2026. Com o arquivo ligado, a home conta o projeto e o 2º turno
// (resultado oficial, duelos, governadores e pesquisas) mora aqui. Sem o arquivo, a página é a home.
const title = "Resultado do 2º turno das eleições 2026 | Puxa Ficha"
const description =
  "Resultado oficial do 2º turno de 25 de outubro de 2026, com a fonte do TSE: presidente e governadores eleitos, o lado a lado dos finalistas e as pesquisas do confronto."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/2o-turno" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/2o-turno",
    images: [{ url: IMAGEM_DUELO_PATH, width: 1200, height: 630, alt: "Os dois finalistas à Presidência no 2º turno, com o resultado do 1º turno" }],
  },
  twitter: buildTwitterMetadata({ title, description, image: IMAGEM_DUELO_PATH }),
}

export default function SegundoTurnoPage() {
  if (!ARQUIVO_ELEICOES_2026.ativo) redirect("/")
  return <PaginaSegundoTurno />
}
