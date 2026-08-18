"use client"

import { useEffect } from "react"

const MESSAGE_TYPE = "puxaficha:resize" as const

export function EmbedResizer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const send = (height: number) => {
      if (typeof window === "undefined" || window.parent === window) return
      window.parent.postMessage({ type: MESSAGE_TYPE, height: Math.ceil(height) }, "*")
    }

    const el = document.documentElement
    const ro = new ResizeObserver(() => {
      send(el.scrollHeight)
    })
    ro.observe(document.body)
    send(el.scrollHeight)

    return () => ro.disconnect()
  }, [])

  return <>{children}</>
}
