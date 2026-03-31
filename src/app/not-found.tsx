import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"

export default function NotFound() {
  return (
    <div className="mx-auto max-w-7xl px-5 md:px-12 min-h-[60vh] flex flex-col items-start justify-center">
      <h1 className="font-heading uppercase text-[clamp(6rem,20vw,14rem)] leading-none tracking-tight">
        404
      </h1>
      <SlashDivider className="mt-4 w-full" />
      <p className="mt-6 text-lg text-muted-foreground">
        Pagina nao encontrada
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-foreground hover:opacity-70 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para a home
      </Link>
    </div>
  )
}
