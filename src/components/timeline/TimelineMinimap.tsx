"use client"

import { useCallback, useRef, useState } from "react"
import { clampTimeWindow } from "@/lib/timeline-utils"

export interface TimelineMinimapProps {
  extentMin: number
  extentMax: number
  viewMin: number
  viewMax: number
  onWindowChange: (min: number, max: number) => void
  /** Accessible label (nome do candidato). */
  label: string
}

/**
 * Faixa proporcional a carreira inteira; retangulo = janela visivel na timeline.
 * Clique fora do retangulo centraliza a janela no ano clicado; arrastar o retangulo faz pan.
 */
export function TimelineMinimap({
  extentMin,
  extentMax,
  viewMin,
  viewMax,
  onWindowChange,
  label,
}: TimelineMinimapProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ clientX: 0, viewMin: 0, viewMax: 0 })

  const span = Math.max(extentMax - extentMin, 1)
  const wLeft = (viewMin - extentMin) / span
  const wWidth = Math.max((viewMax - viewMin) / span, 0.03)

  const applyPointerWindow = useCallback(
    (nextMin: number, nextMax: number) => {
      const c = clampTimeWindow(nextMin, nextMax, extentMin, extentMax)
      onWindowChange(c.min, c.max)
    },
    [extentMin, extentMax, onWindowChange],
  )

  function hitBrush(clientX: number, track: HTMLDivElement): boolean {
    const rect = track.getBoundingClientRect()
    const x = clientX - rect.left
    const frac = x / rect.width
    return frac >= wLeft && frac <= wLeft + wWidth
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const track = trackRef.current
    if (!track) return

    if (hitBrush(e.clientX, track)) {
      draggingRef.current = true
      setDragging(true)
      dragStartRef.current = { clientX: e.clientX, viewMin, viewMax }
      track.setPointerCapture(e.pointerId)
    } else {
      const rect = track.getBoundingClientRect()
      const frac = (e.clientX - rect.left) / rect.width
      const clickYear = extentMin + frac * span
      const winSpan = viewMax - viewMin
      applyPointerWindow(clickYear - winSpan / 2, clickYear + winSpan / 2)
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const deltaYears = ((e.clientX - dragStartRef.current.clientX) / rect.width) * span
    applyPointerWindow(dragStartRef.current.viewMin + deltaYears, dragStartRef.current.viewMax + deltaYears)
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    const track = trackRef.current
    if (track && track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div className="w-full">
      <p className="mb-1.5 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
        Mapa da carreira ({extentMin} a {extentMax})
      </p>
      <div
        ref={trackRef}
        role="presentation"
        className="relative h-7 w-full touch-none rounded-md border border-border/50 bg-secondary/30"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={`Minimap da timeline de ${label}: janela ${Math.round(viewMin)} a ${Math.round(viewMax)}`}
      >
        <div
          className={`absolute inset-y-0 rounded border border-foreground/50 bg-foreground/15 ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{
            left: `${wLeft * 100}%`,
            width: `${wWidth * 100}%`,
            minWidth: 8,
          }}
        />
      </div>
    </div>
  )
}
