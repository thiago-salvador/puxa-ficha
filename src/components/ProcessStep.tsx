import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ProcessStepProps extends ComponentPropsWithoutRef<"div"> {
  index: number
  title: string
  description: ReactNode
  isLast?: boolean
}

export function ProcessStep({
  index,
  title,
  description,
  isLast = false,
  className,
  ...props
}: ProcessStepProps) {
  return (
    <div
      data-pf-process-step=""
      data-pf-process-step-index={String(index)}
      className={cn("relative flex gap-4 pb-8 sm:gap-5", className)}
      {...props}
    >
      {!isLast ? (
        <div className="absolute left-[18px] top-[48px] h-[calc(100%-28px)] w-px bg-border/70 sm:left-[20px]" aria-hidden />
      ) : null}
      <div className="relative z-10 flex size-9 shrink-0 items-start justify-center rounded-[10px] border border-border/60 bg-background pt-2 font-heading text-[18px] leading-none text-foreground sm:size-10 sm:text-[20px]">
        {String(index).padStart(2, "0")}
      </div>
      <div className="pt-0.5">
        <p className="text-[length:var(--text-body-sm)] font-bold text-foreground sm:text-[length:var(--text-body)]">
          {title}
        </p>
        <div className="mt-1 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground sm:text-[length:var(--text-body-sm)]">
          {description}
        </div>
      </div>
    </div>
  )
}
