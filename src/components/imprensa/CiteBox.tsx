"use client"

import { useRef, useState } from "react"
import styles from "./imprensa-shell.module.css"

type CopyState = "idle" | "copied" | "selected"

/**
 * Citação pronta com botão de copiar. Sem acesso à área de transferência, o
 * texto fica selecionado para a pessoa copiar pelo teclado.
 */
export function CiteBox({ citation, label = "Como citar" }: { citation: string; label?: string }) {
  const textRef = useRef<HTMLParagraphElement>(null)
  const [state, setState] = useState<CopyState>("idle")

  function selectText() {
    const node = textRef.current
    const selection = typeof window === "undefined" ? null : window.getSelection()
    if (!node || !selection) return
    selection.removeAllRanges()
    selection.selectAllChildren(node)
    setState("selected")
  }

  function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      selectText()
      return
    }
    navigator.clipboard.writeText(citation).then(() => setState("copied"), selectText)
  }

  return (
    <div className={`${styles.tokens} ${styles.cite}`}>
      <p className={styles.citeLabel}>{label}</p>
      <p ref={textRef} className={styles.citeText}>{citation}</p>
      <div className={styles.citeActions}>
        <button type="button" className={styles.citeButton} onClick={handleCopy}>Copiar citação</button>
        <span role="status" aria-live="polite" className={styles.citeStatus}>
          {state === "copied" ? "Citação copiada" : state === "selected" ? "Citação selecionada. Use o atalho de copiar do teclado." : ""}
        </span>
      </div>
    </div>
  )
}
