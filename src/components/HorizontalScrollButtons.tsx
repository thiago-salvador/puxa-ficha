"use client"

import type { RefObject } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "./ui/button"

interface HorizontalScrollButtonsProps {
  scrollRef: RefObject<HTMLElement | null>
  ariaLabel: string
}

export function HorizontalScrollButtons({ scrollRef, ariaLabel }: HorizontalScrollButtonsProps) {
  function scrollByDirection(direction: "left" | "right") {
    const element = scrollRef.current
    if (!element) return

    const distance = Math.max(160, Math.round(element.clientWidth * 0.72))
    element.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    })
  }

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="pointer-events-auto size-7 bg-background/95 shadow-sm"
        aria-label={`Rolar ${ariaLabel} para a esquerda`}
        onClick={() => scrollByDirection("left")}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="pointer-events-auto size-7 bg-background/95 shadow-sm"
        aria-label={`Rolar ${ariaLabel} para a direita`}
        onClick={() => scrollByDirection("right")}
      >
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
