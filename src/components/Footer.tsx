import Link from "next/link"
import { STATE_INDICATOR_FONTES_DOC } from "@/lib/state-indicator-fonte"
import { SlashDivider } from "./SlashDivider"

export function Footer() {
  return (
    <footer className="mt-20 px-5 pb-12 pt-0 md:px-12">
      <div className="mx-auto max-w-7xl">
        <SlashDivider className="mb-8" />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="font-heading text-[length:var(--text-body-lg)] uppercase tracking-[-0.01em] text-foreground">
              Puxa Ficha
            </span>
            <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              Projeto de Thiago Salvador
            </p>
          </div>
          <nav aria-label="Links do rodapé" className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            <div className="space-y-2">
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                Páginas
              </span>
              <ul>
                {[
                  { href: "/", label: "Presidência" },
                  { href: "/governadores", label: "Governadores" },
                  { href: "/parlamentares", label: "Parlamentares" },
                  { href: "/comparar", label: "Comparador" },
                  { href: "/rankings", label: "Listas" },
                  { href: "/doadores", label: "Doadores" },
                  { href: "/metodologia", label: "Metodologia" },
                  { href: "/sobre", label: "Sobre" },
                  { href: "/privacidade", label: "Privacidade" },
                  { href: "/termos", label: "Termos" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                Fontes consultadas
              </span>
              <ul>
                {[
                  { href: "https://dadosabertos.tse.jus.br", label: "TSE" },
                  { href: "https://dadosabertos.camara.leg.br", label: "Câmara" },
                  { href: "https://legis.senado.leg.br/dadosabertos", label: "Senado" },
                  { href: "https://portaldatransparencia.gov.br", label: "Transparência" },
                  { href: "https://pt.wikipedia.org", label: "Wikipedia" },
                  ...STATE_INDICATOR_FONTES_DOC.map((s) => ({
                    href: s.href,
                    label: s.footerLabel,
                  })),
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
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
              <ul>
                <li>
                  <a
                    href="https://instagram.com/salvador_thiago"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Instagram
                  </a>
                </li>
                <li>
                  <a
                    href="https://apoia.se/puxaficha"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Apoiar
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:contato@puxaficha.com.br"
                    className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Contato
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
