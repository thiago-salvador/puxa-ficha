"use client"
// cspell:ignore recolhivel

import { useId, useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

/**
 * Conteúdo recolhido só no celular (abaixo de `sm`), atrás de um botão. Do
 * `sm` em diante o botão some e o conteúdo fica sempre aberto. O estado inicial
 * é o mesmo no servidor e no navegador (fechado), então não há salto de layout
 * nem divergência de hidratação.
 */
export function RecolhivelNoCelular({ rotulo, children, tom = "escuro" }: { rotulo: string; children: ReactNode; tom?: "claro" | "escuro" }) {
  const [aberto, setAberto] = useState(false)
  const id = useId()
  const escuro = tom === "escuro"
  return (
    <div data-pf-recolhivel-celular={aberto ? "aberto" : "fechado"}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 border-t py-2 text-left text-[length:var(--text-body-sm)] font-bold sm:hidden ${escuro ? "border-white/30 text-white" : "border-border text-foreground"}`}
      >
        {rotulo}
        {aberto ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
      </button>
      <div id={id} className={aberto ? "pt-3 sm:pt-0" : "max-sm:hidden"}>
        {children}
      </div>
    </div>
  )
}
