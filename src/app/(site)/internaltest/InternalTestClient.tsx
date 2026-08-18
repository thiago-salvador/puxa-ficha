"use client"

import { useRef, useSyncExternalStore } from "react"

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getServerSnapshot() {
  return false
}

export function ReducedMotionReader() {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerSnapshot
  )
  return (
    <p className="mt-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-[length:var(--text-caption)] text-muted-foreground">
      Estado detectado no navegador:{" "}
      <strong className="text-foreground">{reduced ? "reduzido" : "normal"}</strong>
      . No macOS: Ajustes &gt; Acessibilidade &gt; Tela &gt; Reduzir movimento.
    </p>
  )
}

export function ScrollBehaviorDemo() {
  const targetRef = useRef<HTMLDivElement>(null)

  const scroll = (behavior: ScrollBehavior) => {
    targetRef.current?.scrollIntoView({ behavior, block: "start" })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => scroll("smooth")}
          className="rounded-lg border border-border bg-background px-3 py-2 text-[length:var(--text-caption)] font-semibold hover:bg-secondary"
        >
          Scroll suave
        </button>
        <button
          type="button"
          onClick={() => scroll("auto")}
          className="rounded-lg border border-border bg-background px-3 py-2 text-[length:var(--text-caption)] font-semibold hover:bg-secondary"
        >
          Scroll instantaneo
        </button>
      </div>
      <p className="text-[length:var(--text-caption)] text-muted-foreground">
        Sugestao: no comparador, usar <code className="rounded bg-muted px-1">behavior: reduced ? &quot;auto&quot; : &quot;smooth&quot;</code>.
      </p>
      <div
        ref={targetRef}
        className="scroll-mt-24 rounded-lg border border-dashed border-muted-foreground/40 bg-secondary/30 px-4 py-8 text-center text-[length:var(--text-caption)] text-muted-foreground"
      >
        Alvo do scroll (use os botoes acima)
      </div>
    </div>
  )
}
