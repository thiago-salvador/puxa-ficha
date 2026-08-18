"use client"

import { useEffect, useState, type ComponentProps, type ComponentType } from "react"
import type { CandidatoGrid as CandidatoGridComponent } from "@/components/CandidatoGrid"

type CandidatoGridProps = ComponentProps<typeof CandidatoGridComponent>
const MOBILE_DEFER_TIMEOUT_MS = 600

function CandidatoGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-[260px] rounded-[8px] border border-border bg-muted/25" />
      ))}
    </div>
  )
}

function useDeferredBelowFoldLoad() {
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    if (!window.matchMedia("(max-width: 640px)").matches) {
      const frame = window.requestAnimationFrame(() => setShouldLoad(true))
      return () => window.cancelAnimationFrame(frame)
    }

    const timeout = window.setTimeout(() => setShouldLoad(true), MOBILE_DEFER_TIMEOUT_MS)
    const onScroll = () => {
      setShouldLoad(true)
    }
    window.addEventListener("scroll", onScroll, { once: true, passive: true })
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener("scroll", onScroll)
    }
  }, [])

  return shouldLoad
}

export function DeferredCandidatoGrid(props: CandidatoGridProps) {
  const shouldLoad = useDeferredBelowFoldLoad()
  const [Grid, setGrid] = useState<ComponentType<CandidatoGridProps> | null>(null)

  useEffect(() => {
    if (!shouldLoad || Grid) return
    let active = true
    void import("@/components/CandidatoGrid").then((mod) => {
      if (active) setGrid(() => mod.CandidatoGrid)
    })
    return () => {
      active = false
    }
  }, [Grid, shouldLoad])

  return (
    <div>
      {Grid ? <Grid {...props} /> : <CandidatoGridSkeleton />}
    </div>
  )
}
