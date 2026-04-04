import Link from "next/link"
import { SlashDivider } from "./SlashDivider"

export function Footer() {
  return (
    <footer className="mt-20 px-5 pb-12 pt-0 md:px-12">
      <div className="mx-auto max-w-7xl">
        <SlashDivider className="mb-8" />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="font-heading text-[16px] uppercase tracking-[-0.01em] text-foreground">
              Puxa Ficha
            </span>
            <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              Projeto de Thiago Salvador
            </p>
          </div>
          <nav className="grid grid-cols-3 gap-4 sm:flex sm:gap-8">
            <div className="space-y-2">
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                Paginas
              </span>
              <ul className="space-y-1.5">
                {[
                  { href: "/", label: "Presidencia" },
                  { href: "/governadores", label: "Governadores" },
                  { href: "/comparar", label: "Comparador" },
                  { href: "/sobre", label: "Sobre" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                Fontes
              </span>
              <ul className="space-y-1.5">
                {[
                  { href: "https://dadosabertos.tse.jus.br", label: "TSE" },
                  { href: "https://dadosabertos.camara.leg.br", label: "Camara" },
                  { href: "https://legis.senado.leg.br/dadosabertos", label: "Senado" },
                  { href: "https://portaldatransparencia.gov.br", label: "Transparencia" },
                  { href: "https://pt.wikipedia.org", label: "Wikipedia" },
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                Projeto
              </span>
              <ul className="space-y-1.5">
                <li>
                  <a
                    href="https://github.com/thiago-salvador/puxa-ficha"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="https://instagram.com/salvador_thiago"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Instagram
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </div>
    </footer>
  )
}
