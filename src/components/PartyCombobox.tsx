"use client"

import { Combobox } from "@base-ui/react/combobox"
import { Check, ChevronDown, X } from "lucide-react"

interface PartyComboboxProps {
  options: string[]
  value: string
  onChange: (value: string) => void
}

export function PartyCombobox({
  options,
  value,
  onChange,
}: PartyComboboxProps) {
  return (
    <Combobox.Root
      items={options}
      value={value || null}
      onValueChange={(nextValue) => onChange(nextValue ?? "")}
    >
      <div className="relative min-w-[190px]">
        <Combobox.Input
          placeholder="Filtrar partido..."
          className="h-10 w-full rounded-full border border-foreground bg-transparent px-4 pr-16 text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground outline-none transition-colors placeholder:text-foreground/60"
          aria-label="Filtrar por partido"
        />
        <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-foreground">
          <ChevronDown className="size-4" />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/70 transition-colors hover:text-foreground"
            aria-label="Limpar partido"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={8}>
          <Combobox.Popup className="z-[75] w-[var(--anchor-width)] overflow-hidden rounded-[18px] border border-border bg-background shadow-xl outline-none">
            <Combobox.Empty className="px-4 py-3 text-[13px] font-medium text-muted-foreground">
              Nenhum partido encontrado.
            </Combobox.Empty>
            <Combobox.List className="max-h-72 overflow-y-auto p-2">
              {options.map((option) => (
                <Combobox.Item
                  key={option}
                  value={option}
                  className="flex cursor-pointer items-center justify-between rounded-[12px] px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-foreground outline-none transition-colors data-[highlighted]:bg-muted"
                >
                  <span>{option}</span>
                  <Combobox.ItemIndicator className="text-foreground">
                    <Check className="size-3.5" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
