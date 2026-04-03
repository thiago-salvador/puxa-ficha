"use client"

import { useState } from "react"
import Image from "next/image"
import {
  cn,
  FALLBACK_GRADIENT,
  getInitials,
  safeHref,
  shouldBypassImageOptimization,
} from "@/lib/utils"

interface CandidatePhotoProps {
  src: string | null | undefined
  alt: string
  name: string
  width?: number
  height?: number
  fill?: boolean
  sizes?: string
  priority?: boolean
  className?: string
  fallbackClassName?: string
  initialsClassName?: string
}

export function CandidatePhoto({
  src,
  alt,
  name,
  width,
  height,
  fill,
  sizes,
  priority = false,
  className,
  fallbackClassName,
  initialsClassName,
}: CandidatePhotoProps) {
  const [failed, setFailed] = useState(false)
  const safeSrc = safeHref(src)

  if (!safeSrc || failed) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center overflow-hidden text-white",
          fallbackClassName ?? className
        )}
        style={{ background: FALLBACK_GRADIENT }}
      >
        <span
          className={cn(
            "select-none font-bold leading-none tracking-tighter",
            initialsClassName ?? "text-xl"
          )}
        >
          {getInitials(name)}
        </span>
      </div>
    )
  }

  return (
    <Image
      src={safeSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      fill={fill}
      sizes={sizes}
      priority={priority}
      unoptimized={shouldBypassImageOptimization(safeSrc)}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
