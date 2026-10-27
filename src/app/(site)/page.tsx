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

// Com o arquivo, a home usa o card geral do site (o mesmo do layout): o card do duelo é do 2º turno e foi para
// /2o-turno. Sem o arquivo, o card do duelo gerado do snapshot do TSE (src/app/(site)/og/segundo-turno);
// sem finalistas, a rota cai no card editorial.
const imagem = ARQUIVO_ELEICOES_2026.ativo
  ? { url: "/opengraph-image", alt: "Puxa Ficha" }
  : { url: IMAGEM_DUELO_PATH, alt: "Os dois finalistas à Presidência no 2º turno, com o resultado do 1º turno" }

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br",
    images: [{ ...imagem, width: 1200, height: 630 }],
  },
  twitter: buildTwitterMetadata({ title, description, image: imagem.url }),
}

export default function Home() {
  return ARQUIVO_ELEICOES_2026.ativo ? <HomeArquivo2026 /> : <PaginaSegundoTurno />
}
