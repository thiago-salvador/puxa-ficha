"use client"

import type { AnchorHTMLAttributes, MouseEvent } from "react"
import { safeHref } from "@/lib/utils"
import { ANALYTICS_EVENTS, getAnalyticsHostname } from "@/lib/analytics-events"
import { trackLaunchEvent } from "@/lib/analytics-client"

type TrackedExternalSourceLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  area: string
  href: string
}

export function TrackedExternalSourceLink({
  area,
  href,
  onClick,
  children,
  ...props
}: TrackedExternalSourceLinkProps) {
  const sourceHref = safeHref(href)
  if (!sourceHref) return <>{children}</>

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    trackLaunchEvent(ANALYTICS_EVENTS.externalSourceClick, {
      area,
      host: getAnalyticsHostname(sourceHref),
    })
    onClick?.(event)
  }

  return (
    <a href={sourceHref} onClick={handleClick} {...props}>
      {children}
    </a>
  )
}
