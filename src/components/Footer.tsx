// cspell:words xdosalvador
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { isSenadoEnabled } from "@/lib/senado-feature"
import { STATE_INDICATOR_FONTES_DOC } from "@/lib/state-indicator-fonte"
import { SlashDivider } from "./SlashDivider"
import { SocialPlatformIcon } from "./SocialPlatformIcon"

type FooterLink = {
  href: string
  label: string
  external?: boolean
  icon?: string
  ariaLabel?: string
}

/** Senado só aparece com a flag ligada, a mesma régua do sitemap e das fichas. */
function eleicaoLinks(): FooterLink[] {
  return [
    { href: "/", label: "2º Turno" },
    { href: "/1o-turno", label: "1º Turno" },
    { href: "/governadores", label: "Governadores" },
    ...(isSenadoEnabled() ? [{ href: "/senado", label: "Senado" }] : []),
    { href: "/comparar", label: "Comparador" },
    { href: "/programas", label: "Programas" },
  ]
}

const EXPLORAR_LINKS: FooterLink[] = [
  { href: "/rankings", label: "Listas" },
  { href: "/doadores", label: "Doadores" },
  { href: "/colinha", label: "Colinha" },
  { href: "/quiz", label: "Quiz" },
  { href: "/dados-abertos", label: "Dados abertos" },
]

const PROJETO_LINKS: FooterLink[] = [
  { href: "/sobre", label: "Sobre" },
  { href: "/metodologia", label: "Metodologia" },
  { href: "mailto:contato@puxaficha.com.br", label: "Contato" },
]

const SOURCE_LINKS: FooterLink[] = [
  { href: "https://dadosabertos.tse.jus.br", label: "TSE", external: true },
  { href: "https://dadosabertos.camara.leg.br", label: "Câmara", external: true },
  { href: "https://legis.senado.leg.br/dadosabertos", label: "Senado", external: true },
  { href: "https://portaldatransparencia.gov.br", label: "Transparência", external: true },
  { href: "https://pt.wikipedia.org", label: "Wikipedia", external: true },
  ...STATE_INDICATOR_FONTES_DOC.map((s) => ({
    href: s.href,
    label: s.footerLabel,
    external: true,
  })),
]

const SOCIAL_LINKS: FooterLink[] = [
  { href: "https://instagram.com/salvador_thiago", label: "Instagram", external: true, icon: "instagram", ariaLabel: "Instagram de Thiago Salvador" },
  { href: "https://www.linkedin.com/in/salvadorthiago/", label: "LinkedIn", external: true, icon: "linkedin", ariaLabel: "LinkedIn de Thiago Salvador" },
  { href: "https://x.com/xdosalvador", label: "@xdosalvador", external: true, icon: "twitter", ariaLabel: "X de Thiago Salvador" },
  { href: "https://github.com/thiago-salvador", label: "GitHub", external: true, icon: "github", ariaLabel: "GitHub de Thiago Salvador" },
]

const APOIAR_HREF = "https://apoia.se/puxaficha"
const REPO_HREF = "https://github.com/thiago-salvador/puxa-ficha"

const LINK = "inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
const LINK_BARRA = "inline-flex min-h-11 items-center text-[length:var(--text-caption)] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"

function FooterLinkItem({ link, className = LINK }: { link: FooterLink; className?: string }) {
  if (link.external || link.href.startsWith("mailto:")) {
    return (
      <a
        href={link.href}
        {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        aria-label={link.ariaLabel}
        className={className}
      >
        {link.label}
      </a>
    )
  }
  return (
    <Link href={link.href} prefetch={false} aria-label={link.ariaLabel} className={className}>
      {link.label}
    </Link>
  )
}

function FooterLinkList({ links }: { links: FooterLink[] }) {
  return (
    <ul>
      {links.map((link) => (
        <li key={link.href}>
          <FooterLinkItem link={link} />
        </li>
      ))}
    </ul>
  )
}

const TITULO_GRUPO = "text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground"

export function Footer() {
  const grupos = [
    { title: "Eleição 2026", links: eleicaoLinks() },
    { title: "Explorar", links: EXPLORAR_LINKS },
    { title: "O projeto", links: PROJETO_LINKS },
  ]
  return (
    <footer className="mt-20 px-5 pb-8 pt-0 md:px-12">
      <div className="mx-auto max-w-7xl">
        <SlashDivider className="mb-10" />

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">Puxa Ficha</p>
            <p className="mt-3 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
              Projeto de mídia independente e de código aberto, de Thiago Salvador.
            </p>
          </div>
          <a
            href={APOIAR_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-[length:var(--text-body-sm)] font-bold text-background transition-colors duration-200 hover:bg-[var(--gray-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            data-pf-footer-apoiar
          >
            Apoiar o projeto <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>

        {/* Um único landmark: as versões desktop e mobile ficam dentro do
            mesmo <nav>, e só uma delas aparece por breakpoint. */}
        <nav aria-label="Links do rodapé" className="mt-10">
          <div className="hidden gap-8 sm:grid sm:grid-cols-3 lg:max-w-3xl">
            {grupos.map((grupo) => (
              <div key={grupo.title} className="space-y-2">
                <span className={TITULO_GRUPO}>{grupo.title}</span>
                <FooterLinkList links={grupo.links} />
              </div>
            ))}
          </div>
          <div className="grid gap-1 sm:hidden">
            {grupos.map((grupo) => (
              <details key={grupo.title} className="group border-b border-border/70">
                <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between ${TITULO_GRUPO} [&::-webkit-details-marker]:hidden`}>
                  {grupo.title}
                  <span aria-hidden="true" className="text-lg font-normal leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="pb-2 pl-1">
                  <FooterLinkList links={grupo.links} />
                </div>
              </details>
            ))}
          </div>
        </nav>

        <div className="mt-8 flex flex-col gap-1 border-t border-border pt-5 sm:flex-row sm:items-baseline sm:gap-4" data-pf-footer-fontes>
          <span className={`${TITULO_GRUPO} shrink-0`}>Fontes consultadas</span>
          <ul className="flex flex-wrap items-center gap-x-1" aria-label="Fontes consultadas">
            {SOURCE_LINKS.map((link, i) => (
              <li key={link.href} className="flex items-center gap-x-1">
                <FooterLinkItem link={link} className={LINK_BARRA} />
                {i < SOURCE_LINKS.length - 1 && <span aria-hidden="true" className="text-muted-foreground">·</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-3 text-[length:var(--text-caption)] font-medium text-muted-foreground">
            <span>© {new Date().getFullYear()} Puxa Ficha</span>
            <span aria-hidden="true">·</span>
            <a href={REPO_HREF} target="_blank" rel="noopener noreferrer" className={LINK_BARRA}>
              Código no GitHub
            </a>
            <span aria-hidden="true">·</span>
            <Link href="/privacidade" prefetch={false} className={LINK_BARRA}>
              Privacidade
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/termos" prefetch={false} className={LINK_BARRA}>
              Termos
            </Link>
          </p>
          <ul className="flex items-center gap-1" aria-label="Redes sociais">
            {SOCIAL_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.ariaLabel ?? link.label}
                  title={link.label}
                  className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--gray-100)] hover:text-foreground"
                >
                  <SocialPlatformIcon platform={link.icon!} className="size-[18px]" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
