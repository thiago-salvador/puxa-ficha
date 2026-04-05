"use client"

import { Menu } from "@base-ui/react/menu"
import { Check, ChevronDown } from "lucide-react"

export type SortKey = "nome" | "patrimonio" | "processos"

const OPTIONS: { value: SortKey; label: string }[] = [
  { value: "nome", label: "A-Z" },
  { value: "patrimonio", label: "Patrimonio" },
  { value: "processos", label: "Processos" },
]

interface SortOrderMenuProps {
  value: SortKey
  onChange: (value: SortKey) => void
}

export function SortOrderMenu({ value, onChange }: SortOrderMenuProps) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]!

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        type="button"
        className="flex h-10 items-center gap-2 rounded-full border border-foreground bg-transparent px-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground outline-none transition-colors"
        aria-label="Ordenar candidatos"
      >
        {current.label}
        <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start">
          <Menu.Popup className="z-[75] min-w-[var(--anchor-width)] overflow-hidden rounded-[18px] border border-border bg-background shadow-xl outline-none">
            <Menu.RadioGroup
              value={value}
              onValueChange={(v) => onChange(v as SortKey)}
            >
              {OPTIONS.map((opt) => (
                <Menu.RadioItem
                  key={opt.value}
                  value={opt.value}
                  className="flex cursor-pointer items-center justify-between gap-8 px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-foreground outline-none transition-colors data-[highlighted]:bg-muted"
                >
                  {opt.label}
                  <Menu.RadioItemIndicator className="text-foreground">
                    <Check className="size-3.5" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
