"use client"

import { useEffect } from "react"

/**
 * Faz as barras dos blocos `data-pf-revelar="auto"` crescerem quando entram na
 * tela. Só arma blocos que estão fora da tela na montagem, para não piscar o que
 * já está visível. Sem JS, sem IntersectionObserver ou com movimento reduzido,
 * nada muda: as barras ficam na largura final.
 */
export function RevelarBarras() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const alvos = Array.from(document.querySelectorAll<HTMLElement>('[data-pf-revelar="auto"]')).filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight,
    )
    if (alvos.length === 0) return
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue
          const el = entrada.target as HTMLElement
          el.dataset.pfRevelar = "visivel"
          observador.unobserve(el)
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    )
    for (const el of alvos) {
      el.dataset.pfRevelar = "aguardando"
      observador.observe(el)
    }
    return () => {
      observador.disconnect()
      // Desmontar (ou a montagem dupla do StrictMode) não pode deixar barra presa em scaleX(0):
      // o que não revelou volta a "auto" e a próxima montagem arma de novo.
      for (const el of alvos) {
        if (el.dataset.pfRevelar === "aguardando") el.dataset.pfRevelar = "auto"
      }
    }
  }, [])
  return null
}
