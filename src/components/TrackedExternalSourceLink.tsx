"use client"

import type { AnchorHTMLAttributes, MouseEvent } from "react"
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
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    trackLaunchEvent(ANALYTICS_EVENTS.externalSourceClick, {
      area,
      host: getAnalyticsHostname(href),
    })
    onClick?.(event)
  }

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  )
}
