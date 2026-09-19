// cspell:words xdosalvador
import Link from "next/link"
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

const PAGE_LINKS: FooterLink[] = [
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

const PROJECT_LINKS: FooterLink[] = [
  { href: "https://instagram.com/salvador_thiago", label: "Instagram", external: true, icon: "instagram" },
  { href: "https://www.linkedin.com/in/salvadorthiago/", label: "LinkedIn", external: true, icon: "linkedin" },
  {
    href: "https://x.com/xdosalvador",
    label: "@xdosalvador",
    external: true,
    icon: "twitter",
    ariaLabel: "X de Thiago Salvador",
  },
  {
    href: "https://github.com/thiago-salvador",
    label: "GitHub",
    external: true,
    icon: "github",
    ariaLabel: "GitHub de Thiago Salvador",
  },
  { href: "https://apoia.se/puxaficha", label: "Apoiar", external: true },
  { href: "mailto:contato@puxaficha.com.br", label: "Contato" },
]

const FOOTER_GROUPS = [
  { title: "Páginas", links: PAGE_LINKS },
  { title: "Fontes consultadas", links: SOURCE_LINKS },
  { title: "Projeto", links: PROJECT_LINKS },
]

function FooterLinkItem({ link }: { link: FooterLink }) {
  const className =
    "inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
  const icon = link.icon ? <SocialPlatformIcon platform={link.icon} className="mr-2 size-4" /> : null

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={link.ariaLabel}
        className={className}
      >
        {icon}
        {link.label}
      </a>
    )
  }

  return (
    <Link href={link.href} prefetch={false} aria-label={link.ariaLabel} className={className}>
      {icon}
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

export function Footer() {
  return (
    <footer className="mt-20 px-5 pb-12 pt-0 md:px-12">
      <div className="mx-auto max-w-7xl">
        <SlashDivider className="mb-8" />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="shrink-0">
            <span className="font-heading text-[length:var(--text-body-lg)] uppercase tracking-[-0.01em] text-foreground">
              Puxa Ficha
            </span>
            <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              Projeto de Thiago Salvador
            </p>
          </div>
          <nav aria-label="Links do rodapé" className="hidden grid-cols-1 gap-8 sm:grid sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                  {group.title}
                </span>
                <FooterLinkList links={group.links} />
              </div>
            ))}
          </nav>
          <nav aria-label="Links do rodapé" className="grid gap-1 sm:hidden">
            {FOOTER_GROUPS.map((group) => (
              <details key={group.title} className="group border-b border-border/70">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground [&::-webkit-details-marker]:hidden">
                  {group.title}
                  <span aria-hidden="true" className="text-lg font-normal leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="pb-2 pl-1">
                  <FooterLinkList links={group.links} />
                </div>
              </details>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
