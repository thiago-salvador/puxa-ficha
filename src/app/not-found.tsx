import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Footer } from "@/components/Footer"
import { GlobalSearchProvider } from "@/components/GlobalSearchProvider"
import { Navbar } from "@/components/Navbar"
import { SlashDivider } from "@/components/SlashDivider"

export const metadata: Metadata = {
  title: "Página não encontrada | Puxa Ficha",
}

export default function NotFound() {
  return (
    <>
      <GlobalSearchProvider>
        <Navbar />
        <main
          id="main-content"
          className="mx-auto flex min-h-[60vh] max-w-7xl flex-col items-start justify-center px-5 pt-20 md:px-12"
        >
          <h1 className="font-heading uppercase text-[clamp(6rem,20vw,14rem)] leading-none tracking-tight">
            404
          </h1>
          <SlashDivider className="mt-4 w-full" />
          <p className="mt-6 text-lg text-muted-foreground">
            Página não encontrada
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex min-h-11 items-center gap-2 text-[length:var(--text-eyebrow)] font-medium uppercase tracking-[0.2em] text-foreground transition-opacity hover:opacity-70"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para a home
          </Link>
        </main>
      </GlobalSearchProvider>
      <Footer />
    </>
  )
}
