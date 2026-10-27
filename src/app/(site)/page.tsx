import type { Metadata } from "next"
import { HomeArquivo2026 } from "@/components/HomeArquivo2026"
import { PaginaSegundoTurno } from "@/components/PaginaSegundoTurno"
import { metadadosDaHome } from "@/lib/arquivo-home"
import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"
import { IMAGEM_DUELO_PATH } from "@/lib/compartilhar-duelo"
import { buildTwitterMetadata } from "@/lib/metadata"

// Desde 27/10/2026, com o arquivo ligado, a home conta o projeto: o que o site reuniu, como funcionou e
// a linha do tempo. O 2º turno (resultado oficial, duelos e governadores) fica em /2o-turno.
// Com a flag desligada, a home volta a ser a página do 2º turno.
const { title, description } = metadadosDaHome(ARQUIVO_ELEICOES_2026.ativo)

// Card do duelo gerado do snapshot do TSE (src/app/(site)/og/segundo-turno); sem finalistas, a rota cai no card editorial.
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br",
    images: [{ url: IMAGEM_DUELO_PATH, width: 1200, height: 630, alt: "Os dois finalistas à Presidência no 2º turno, com o resultado do 1º turno" }],
  },
  twitter: buildTwitterMetadata({ title, description, image: IMAGEM_DUELO_PATH }),
}

export default function Home() {
  return ARQUIVO_ELEICOES_2026.ativo ? <HomeArquivo2026 /> : <PaginaSegundoTurno />
}
