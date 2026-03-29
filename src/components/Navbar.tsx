import Link from "next/link"

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Puxa Ficha
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            Candidatos
          </Link>
          <Link href="/comparar" className="text-muted-foreground hover:text-foreground transition-colors">
            Comparar
          </Link>
          <Link href="/sobre" className="text-muted-foreground hover:text-foreground transition-colors">
            Sobre
          </Link>
        </div>
      </nav>
    </header>
  )
}
