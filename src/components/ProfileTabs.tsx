"use client"

import { useState } from "react"

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
  return (
    <div className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-5 md:px-12">
        <nav className="-mb-px flex gap-0 overflow-x-auto scrollbar-none" aria-label="Secoes do perfil">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 border-b-2 px-4 py-3 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] transition-colors sm:px-5 sm:py-3.5 sm:text-[length:var(--text-body-sm)] ${
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function useProfileTabs(defaultTab: string) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  return { activeTab, setActiveTab }
}
