"use client"

import { useEffect, useState } from "react"

export interface SobreNavItem {
  id: string
  label: string
}

/** Índice lateral da /sobre: marca a seção que está no topo da tela. */
export function SobreNav({ items }: { items: SobreNavItem[] }) {
  const [ativo, setAtivo] = useState(items[0]?.id ?? "")

  useEffect(() => {
    // A ativa é a última seção cujo topo já passou da linha logo abaixo do header fixo.
    // São só seis medições por evento; sem rAF, que o navegador estrangula em aba de fundo.
    const atualizar = () => {
      const linha = 120
      let atual = items[0]?.id ?? ""
      for (const item of items) {
        const el = document.getElementById(item.id)
        if (el && el.getBoundingClientRect().top <= linha) atual = item.id
      }
      // No fim da rolagem a última seção pode não chegar à linha; nesse caso ela é a ativa.
      const noFim = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      if (noFim && items.length > 0) atual = items[items.length - 1].id
      setAtivo(atual)
    }
    atualizar()
    window.addEventListener("scroll", atualizar, { passive: true })
    return () => window.removeEventListener("scroll", atualizar)
  }, [items])

  return (
    <nav aria-label="Nesta página" className="sticky top-24">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Nesta página</p>
      <ul className="mt-4 space-y-1">
        {items.map((item) => {
          const atual = item.id === ativo
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={atual ? "location" : undefined}
                className={`-ml-3 block border-l-[3px] py-1.5 pl-3 text-[length:var(--text-body)] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                  atual
                    ? "border-foreground font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
