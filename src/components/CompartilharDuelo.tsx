"use client"

import { useState } from "react"
import { Download, Share2 } from "lucide-react"
import { IMAGEM_DUELO_PATH, modoCompartilhar, textoDoDuelo } from "@/lib/compartilhar-duelo"
import { diasAte2Turno } from "@/lib/segundo-turno-2026"

type FinalistaTexto = { nome_urna: string; percentual_validos: number | null }

/**
 * Compartilhar o duelo do 2º turno: Web Share quando o aparelho tem, senão
 * copia o link da home. O link "Baixar imagem" leva ao card gerado do snapshot.
 * O texto sai dos nomes e % do snapshot do TSE e da contagem de dias calculada
 * no clique, pelo relógio do aparelho (a página pode estar em cache).
 */
export function CompartilharDuelo({ finalistas, url }: { finalistas: [FinalistaTexto, FinalistaTexto]; url: string }) {
  const [aviso, setAviso] = useState("")
  const compartilhar = async () => {
    const nav = typeof navigator === "undefined" ? null : navigator
    const modo = modoCompartilhar(nav)
    const texto = textoDoDuelo(finalistas, diasAte2Turno(Date.now()))
    try {
      if (modo === "nativo" && nav) {
        await nav.share({ title: "Puxa Ficha: 2º turno", text: texto, url })
        return
      }
      if (modo === "copiar" && nav) {
        await nav.clipboard.writeText(url)
        setAviso("Link copiado.")
        return
      }
      setAviso("Não foi possível compartilhar daqui. Use o link da imagem ao lado.")
    } catch (error) {
      // Cancelar a folha de compartilhar não é erro para a pessoa.
      if (error instanceof DOMException && error.name === "AbortError") return
      setAviso("Não foi possível compartilhar daqui. Use o link da imagem ao lado.")
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1" data-pf-compartilhar-duelo>
      <button
        type="button"
        onClick={() => void compartilhar()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/60 px-5 text-[length:var(--text-body-sm)] font-bold text-white transition-colors duration-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none"
      >
        <Share2 className="size-4" aria-hidden="true" />
        Compartilhar
      </button>
      <a
        href={IMAGEM_DUELO_PATH}
        download="puxa-ficha-2o-turno.png"
        className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold text-white underline underline-offset-4 hover:text-white/80"
      >
        <Download className="size-4" aria-hidden="true" />
        Baixar imagem
      </a>
      <p role="status" aria-live="polite" className="w-full text-center text-[length:var(--text-caption)] font-medium text-white/80 empty:hidden">
        {aviso}
      </p>
    </div>
  )
}
