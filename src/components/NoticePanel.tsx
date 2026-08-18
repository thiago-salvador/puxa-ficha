import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "@/lib/utils"

export type NoticePanelTone = "neutral" | "caution" | "positive" | "critical"

const NOTICE_PANEL_STYLES: Record<
  NoticePanelTone,
  {
    rail: string
    eyebrow: string
    title: string
    description: string
  }
> = {
  neutral: {
    rail: "bg-foreground/18",
    eyebrow: "text-muted-foreground",
    title: "text-foreground",
    description: "text-muted-foreground",
  },
  caution: {
    rail: "bg-amber-500/65",
    eyebrow: "text-amber-800",
    title: "text-amber-950",
    description: "text-foreground",
  },
  positive: {
    rail: "bg-emerald-600/65",
    eyebrow: "text-emerald-800",
    title: "text-emerald-950",
    description: "text-foreground",
  },
  critical: {
    rail: "bg-red-600/65",
    eyebrow: "text-red-700",
    title: "text-red-900",
    description: "text-foreground",
  },
}

interface NoticePanelProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  tone?: NoticePanelTone
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  align?: "start" | "center"
  rail?: boolean
}

export function NoticePanel({
  tone = "neutral",
  eyebrow,
  title,
  description,
  action,
  align = "start",
  rail = true,
  className,
  children,
  ...props
}: NoticePanelProps) {
  const styles = NOTICE_PANEL_STYLES[tone]
  const isCentered = align === "center"

  const content = (
    <div className={cn(isCentered && "text-center")}>
      {eyebrow ? (
        <p
          className={cn(
            "text-[10px] font-bold uppercase tracking-[0.08em]",
            styles.eyebrow,
            title || description ? "mb-1.5" : "",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <p className={cn("text-[length:var(--text-body)] font-bold", styles.title)}>{title}</p>
      ) : null}
      {description ? (
        <div
          className={cn(
            "text-[length:var(--text-body-sm)] font-medium leading-relaxed",
            styles.description,
            title ? "mt-1.5" : "",
          )}
        >
          {description}
        </div>
      ) : null}
      {children ? <div className={cn(description || title ? "mt-3" : "")}>{children}</div> : null}
      {action ? <div className={cn(title || description || children ? "mt-4" : "")}>{action}</div> : null}
    </div>
  )

  return (
    <div
      data-pf-notice-panel=""
      data-pf-notice-tone={tone}
      className={cn(
        "rounded-[16px] border border-border/60 bg-card px-4 py-4 sm:px-5",
        className,
      )}
      {...props}
    >
      {rail && !isCentered ? (
        <div className="grid grid-cols-[3px_1fr] gap-3 sm:gap-4">
          <div className={cn("rounded-full", styles.rail)} aria-hidden />
          {content}
        </div>
      ) : (
        content
      )}
    </div>
  )
}
