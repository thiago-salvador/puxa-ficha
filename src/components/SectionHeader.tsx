import { SlashDivider } from "./SlashDivider"

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
      {children}
    </p>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-1 font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground sm:text-[length:var(--text-heading)] lg:text-[length:var(--text-heading-lg)]">
      {children}
    </h2>
  )
}

export function SectionDivider() {
  return (
    <div className="mx-auto max-w-7xl px-5 md:px-12">
      <SlashDivider />
    </div>
  )
}
