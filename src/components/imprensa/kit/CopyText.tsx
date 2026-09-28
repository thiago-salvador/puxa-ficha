"use client"

import { useId, useRef, useState } from "react"
import styles from "./kit-copy.module.css"

type CopyState = "idle" | "copied" | "selected"

/**
 * Texto de apresentação com botão de copiar. Copia os parágrafos separados
 * por linha em branco. Sem acesso à área de transferência, o texto fica
 * selecionado para a pessoa copiar pelo teclado.
 */
export function CopyText({ label, paragraphs }: { label: string; paragraphs: readonly string[] }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [state, setState] = useState<CopyState>("idle")

  function selectText() {
    const node = bodyRef.current
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
    navigator.clipboard.writeText(paragraphs.join("\n\n")).then(() => setState("copied"), selectText)
  }

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.label}>{label}</h3>
      <div ref={bodyRef} className={styles.body}>
        {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={handleCopy}>
          Copiar texto<span className={styles.srOnly}> de {label}</span>
        </button>
        <span role="status" aria-live="polite" className={styles.status}>
          {state === "copied" ? "Texto copiado" : state === "selected" ? "Texto selecionado. Use o atalho de copiar do teclado." : ""}
        </span>
      </div>
    </article>
  )
}
