"use client"

import { useState } from "react"
import Image from "next/image"
import {
  cn,
  FALLBACK_GRADIENT,
  getWikimediaThumbnailUrl,
  getInitials,
  isUiAvatarsPlaceholder,
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
  fetchPriority?: "high" | "low" | "auto"
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
  fetchPriority,
  className,
  fallbackClassName,
  initialsClassName,
}: CandidatePhotoProps) {
  const [failed, setFailed] = useState(false)
  const safeSrc = safeHref(src)
  const imageWidth = Math.ceil((width ?? height ?? 384) * (priority ? 1.5 : 1))
  const displaySrc = safeSrc && !isUiAvatarsPlaceholder(safeSrc)
    ? getWikimediaThumbnailUrl(safeSrc, imageWidth)
    : null

  if (!displaySrc || failed) {
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
      src={displaySrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      fill={fill}
      sizes={sizes}
      priority={priority}
      fetchPriority={fetchPriority ?? (priority ? "high" : undefined)}
      unoptimized={priority ? false : shouldBypassImageOptimization(displaySrc)}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
