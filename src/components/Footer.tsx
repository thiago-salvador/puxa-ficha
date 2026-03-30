import { SlashDivider } from "./SlashDivider"

export function Footer() {
  return (
    <footer className="mt-20 px-5 pb-12 pt-0 md:px-12">
      <div className="mx-auto max-w-7xl">
        <SlashDivider className="mb-8" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <span className="font-heading text-[16px] uppercase tracking-[-0.01em] text-black">
            Puxa Ficha
          </span>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/30">
              TSE &middot; Camara &middot; Senado
            </span>
            <span className="text-[11px] font-medium text-black/20">
              Projeto de Thiago Salvador
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
