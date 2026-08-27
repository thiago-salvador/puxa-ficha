"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Check, ChevronDown, MoreHorizontal } from "lucide-react"

export interface Tab {
  id: string
  label: string
  count?: number
}

const MOBILE_PRIMARY_IDS = ["geral", "pesquisas", "programa"]
const MOBILE_TAB_LABELS: Record<string, string> = {
  geral: "Visão",
  pesquisas: "Pesquisas",
  programa: "Programa",
}

type TabChange = (id: string) => void

function TabCount({ count, inverted = false }: { count?: number; inverted?: boolean }) {
  if (count == null || count <= 0) return null
  return (
    <span className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold ${inverted ? "bg-background text-foreground" : "bg-foreground text-background"}`}>
      {count}
    </span>
  )
}

function onTabKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  visibleTabs: Tab[],
  idPrefix: string,
  onTabChange: TabChange,
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
  event.preventDefault()
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? visibleTabs.length - 1
      : event.key === "ArrowLeft"
        ? (index - 1 + visibleTabs.length) % visibleTabs.length
        : (index + 1) % visibleTabs.length
  const nextTab = visibleTabs[nextIndex]
  if (!nextTab) return
  onTabChange(nextTab.id)
  window.requestAnimationFrame(() => document.getElementById(`${idPrefix}${nextTab.id}`)?.focus())
}

function splitMobileTabs(tabs: Tab[]) {
  const primary = MOBILE_PRIMARY_IDS
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is Tab => Boolean(tab))
  const mobileTabs = tabs.reduce<Tab[]>((result, tab) => {
    if (result.length >= 3 || result.some((item) => item.id === tab.id)) return result
    return [...result, tab]
  }, primary)
  return {
    mobileTabs,
    moreTabs: tabs.filter((tab) => !mobileTabs.some((item) => item.id === tab.id)),
  }
}

function ProfileTabButton({
  tab,
  index,
  tabs,
  activeTab,
  idPrefix,
  className,
  label,
  onTabChange,
}: {
  tab: Tab
  index: number
  tabs: Tab[]
  activeTab: string
  idPrefix: string
  className: (isActive: boolean) => string
  label: React.ReactNode
  onTabChange: TabChange
}) {
  const isActive = activeTab === tab.id
  return (
    <button
      id={`${idPrefix}${tab.id}`}
      type="button"
      role="tab"
      onClick={() => onTabChange(tab.id)}
      onKeyDown={(event) => onTabKeyDown(event, index, tabs, idPrefix, onTabChange)}
      aria-selected={isActive}
      aria-controls={`profile-panel-${tab.id}`}
      tabIndex={isActive ? 0 : -1}
      className={className(isActive)}
    >
      {label}
      <TabCount count={tab.count} />
    </button>
  )
}

function DesktopTabs({ tabs, activeTab, onTabChange }: { tabs: Tab[]; activeTab: string; onTabChange: TabChange }) {
  return (
    <div role="tablist" aria-label="Seções do perfil" aria-orientation="horizontal" className="-mb-px hidden w-full overflow-x-auto scrollbar-none sm:flex">
      {tabs.map((tab, index) => (
        <ProfileTabButton
          key={tab.id}
          tab={tab}
          index={index}
          tabs={tabs}
          activeTab={activeTab}
          idPrefix="profile-tab-desktop-"
          label={tab.label}
          onTabChange={onTabChange}
          className={(isActive) => `inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-5 py-3.5 text-[length:var(--text-body-sm)] font-bold uppercase tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"}`}
        />
      ))}
    </div>
  )
}

function MobilePrimaryTabs({ tabs, activeTab, onTabChange }: { tabs: Tab[]; activeTab: string; onTabChange: TabChange }) {
  return (
    <div role="tablist" aria-label="Seções principais do perfil" aria-orientation="horizontal" className="grid min-w-0 flex-1 grid-cols-3">
      {tabs.map((tab, index) => (
        <ProfileTabButton
          key={tab.id}
          tab={tab}
          index={index}
          tabs={tabs}
          activeTab={activeTab}
          idPrefix="profile-tab-"
          label={<span className="truncate">{MOBILE_TAB_LABELS[tab.id] ?? tab.label}</span>}
          onTabChange={onTabChange}
          className={(isActive) => `inline-flex min-h-12 min-w-0 items-center justify-center gap-1 border-b-2 px-2 py-3 text-[10px] font-bold uppercase tracking-[0.06em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
        />
      ))}
    </div>
  )
}

function useDismissMoreMenu(open: boolean, close: () => void, container: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) close()
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") close()
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [close, container, open])
}

function MoreTabsMenu({ open, tabs, activeTab, onSelect }: { open: boolean; tabs: Tab[]; activeTab: string; onSelect: TabChange }) {
  if (!open) return null
  return (
    <div id="profile-tabs-more-menu" role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[min(65vh,440px)] w-64 overflow-y-auto rounded-[12px] border border-border bg-popover p-1.5 shadow-xl">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            onClick={() => onSelect(tab.id)}
            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-left text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "bg-foreground text-background" : "text-foreground"}`}
          >
            <span className="min-w-0 truncate">{tab.label}</span>
            <span className="flex shrink-0 items-center gap-2">
              <TabCount count={tab.count} inverted={isActive} />
              {isActive && <Check className="size-4" aria-hidden="true" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MoreTabs({ tabs, activeTab, onTabChange }: { tabs: Tab[]; activeTab: string; onTabChange: TabChange }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const activeMoreTab = tabs.find((tab) => tab.id === activeTab)
  const close = () => setOpen(false)
  useDismissMoreMenu(open, close, container)

  const selectTab = (id: string) => {
    onTabChange(id)
    close()
  }
  return (
    <div ref={container} className="relative shrink-0">
      {activeMoreTab && <span id={`profile-tab-${activeMoreTab.id}`} className="sr-only">{activeMoreTab.label}</span>}
      <button
        type="button"
        aria-label={activeMoreTab ? `Mais: ${activeMoreTab.label}` : "Mais"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="profile-tabs-more-menu"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex min-h-12 items-center gap-1 border-b-2 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.06em] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${activeMoreTab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
        <span>Mais</span>
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <MoreTabsMenu open={open} tabs={tabs} activeTab={activeTab} onSelect={selectTab} />
    </div>
  )
}

export function ProfileTabs({ tabs, activeTab, onTabChange }: { tabs: Tab[]; activeTab: string; onTabChange: TabChange }) {
  const { mobileTabs, moreTabs } = splitMobileTabs(tabs)
  return (
    <div className="sticky top-16 z-30 w-full border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl min-w-0 px-5 md:px-12">
        <nav aria-label="Seções do perfil" className="relative">
          <DesktopTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
          <div className="-mb-px flex min-w-0 items-stretch sm:hidden">
            <MobilePrimaryTabs tabs={mobileTabs} activeTab={activeTab} onTabChange={onTabChange} />
            {moreTabs.length > 0 && <MoreTabs tabs={moreTabs} activeTab={activeTab} onTabChange={onTabChange} />}
          </div>
        </nav>
      </div>
    </div>
  )
}
