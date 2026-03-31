"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

export function ExpandableCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-[12px] border border-border/50 sm:rounded-[16px]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left sm:px-5 sm:py-4"
      >
        <div>
          <div className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">{title}</div>
          {subtitle && (
            <div className="mt-0.5 text-[length:var(--text-caption)] font-semibold text-muted-foreground sm:text-[length:var(--text-body-sm)]">
              {subtitle}
            </div>
          )}
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t border-border/50 px-4 py-3 sm:px-5 sm:py-4">{children}</div>}
    </div>
  )
}
