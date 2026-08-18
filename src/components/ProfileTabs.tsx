"use client"

import type { KeyboardEvent } from "react"

export interface Tab {
  id: string
  label: string
  count?: number
}

export function ProfileTabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
}) {
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab))

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()

    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowLeft"
            ? (index - 1 + tabs.length) % tabs.length
            : (index + 1) % tabs.length

    const nextTab = tabs[nextIndex]
    if (!nextTab) return
    onTabChange(nextTab.id)
    window.requestAnimationFrame(() => {
      document.getElementById(`profile-tab-${nextTab.id}`)?.focus()
    })
  }

  return (
    <div className="sticky top-16 z-30 w-full overflow-hidden border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl min-w-0 px-5 md:px-12">
        <nav aria-label="Seções do perfil">
          <div
            role="tablist"
            className="-mb-px flex w-full max-w-full gap-0 overflow-x-auto overscroll-x-contain scrollbar-none"
            aria-orientation="horizontal"
          >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                id={`profile-tab-${tab.id}`}
                type="button"
                role="tab"
                onClick={() => onTabChange(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                aria-selected={isActive}
                aria-controls={`profile-panel-${tab.id}`}
                tabIndex={isActive || index === activeIndex ? 0 : -1}
                className={`inline-flex max-w-[72vw] shrink-0 items-center gap-1.5 overflow-hidden border-b-2 px-4 py-3 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:max-w-none sm:px-5 sm:py-3.5 sm:text-[length:var(--text-body-sm)] ${
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span className="truncate">{tab.label}</span>
                {tab.count != null && tab.count > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background">
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
          </div>
        </nav>
      </div>
    </div>
  )
}
