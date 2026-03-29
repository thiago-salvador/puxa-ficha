import Link from "next/link"
import { Shield } from "lucide-react"

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Shield className="h-5 w-5 text-primary" />
          <span>Puxa Ficha</span>
        </Link>
        <div className="flex items-center gap-4 text-sm sm:gap-6">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <span className="hidden sm:inline">Candidatos</span>
            <span className="sm:hidden">Home</span>
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
