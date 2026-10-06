"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { MEU_ESTADO_EVENTO, armazenamentoLocal, lerUfSalva, ordenarComMeuEstado, salvarUf } from "@/lib/meu-estado"

function assinar(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(MEU_ESTADO_EVENTO, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(MEU_ESTADO_EVENTO, callback)
  }
}

const lerSalva = () => lerUfSalva(armazenamentoLocal())

/**
 * Lista dos duelos de governador com o controle "Meu estado". A UF escolhida
 * fica salva só neste navegador (mesma chave do índice de governadores) e o
 * duelo dela sobe para o topo, destacado. No servidor e na hidratação nada está
 * escolhido; a ordem muda só depois de montar, sem divergência de HTML.
 */
export function MeuEstadoDuelos({
  duelos,
  estados,
}: {
  /** Um item por UF com 2º turno, já na ordem padrão; `conteudo` é o duelo renderizado no servidor. */
  duelos: Array<{ uf: string; conteudo: ReactNode }>
  /** As 27 UFs, para escolher mesmo um estado sem 2º turno. */
  estados: Array<{ uf: string; nome: string }>
}) {
  const salva = useSyncExternalStore(assinar, lerSalva, () => null)
  // Com armazenamento bloqueado a escolha vale só nesta visita.
  const [escolhaLocal, setEscolhaLocal] = useState<string | null | undefined>(undefined)
  const [salvou, setSalvou] = useState(true)
  const uf = escolhaLocal !== undefined ? escolhaLocal : salva
  const escolher = (valor: string) => {
    // Só aceita uma das 27 UFs conhecidas; o valor do select não vira link nem storage sem passar por aqui.
    const nova = estados.find((e) => e.uf === valor)?.uf ?? null
    setEscolhaLocal(nova)
    const ok = salvarUf(armazenamentoLocal(), nova)
    setSalvou(ok)
    if (ok) window.dispatchEvent(new Event(MEU_ESTADO_EVENTO))
  }
  const ordenados = ordenarComMeuEstado(duelos, uf)
  const temDuelo = uf ? duelos.some((d) => d.uf === uf) : false
  const estadoEscolhido = estados.find((e) => e.uf === uf)
  const nomeEscolhido = estadoEscolhido?.nome
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2" data-pf-meu-estado={uf ?? ""}>
        <label className="flex items-center gap-3 text-[length:var(--text-body-sm)] font-bold text-foreground">
          Meu estado
          <select
            value={uf ?? ""}
            onChange={(e) => escolher(e.target.value)}
            className="min-h-11 rounded-full border border-border bg-background px-4 text-[length:var(--text-body-sm)] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <option value="">Escolher</option>
            {estados.map((e) => (
              <option key={e.uf} value={e.uf}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        <p role="status" aria-live="polite" className="text-[length:var(--text-caption)] font-medium text-muted-foreground empty:hidden">
          {estadoEscolhido && !temDuelo ? (
            <>
              {nomeEscolhido} não tem 2º turno para governador.{" "}
              <Link href={`/1o-turno/${estadoEscolhido.uf.toLowerCase()}`} className="inline-flex min-h-11 items-center gap-1 font-bold text-foreground underline underline-offset-4">
                Ver o resultado <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </>
          ) : uf && temDuelo ? (
            `${nomeEscolhido} aparece primeiro. ${salvou ? "Salvo só neste navegador." : "Vale só nesta visita."}`
          ) : (
            ""
          )}
        </p>
      </div>
      <ul className="border-b border-border" data-pf-revelar="auto">
        {ordenados.map((d) => {
          const meu = d.uf === uf
          return (
            <li
              key={d.uf}
              data-pf-duelo-2turno-uf={d.uf.toLowerCase()}
              data-pf-meu-estado-item={meu ? "sim" : undefined}
              className={`border-t border-border ${meu ? "-mx-4 bg-[var(--gray-50)] px-4 sm:-mx-6 sm:px-6" : ""}`}
            >
              {meu && (
                <p className="pt-4 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">Meu estado</p>
              )}
              {d.conteudo}
            </li>
          )
        })}
      </ul>
    </>
  )
}
