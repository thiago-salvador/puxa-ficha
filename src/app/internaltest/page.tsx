import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { safeHref } from "@/lib/utils"
import { ReducedMotionReader, ScrollBehaviorDemo } from "./InternalTestClient"

/** SVG local: build nao precisa buscar rede. Em producao, fotos raster remotas usariam Image sem unoptimized + remotePatterns. */
const DEMO_LOCAL = "/vercel.svg"

export const metadata: Metadata = {
  title: "Internal test — Puxa Ficha",
  description: "Previa de melhorias sugeridas no front-end. Nao indexar.",
  robots: { index: false, follow: false },
}

function Block({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-b border-border py-14 last:border-b-0"
    >
      <h2 className="font-heading text-[length:var(--text-heading-sm)] uppercase tracking-tight text-foreground sm:text-[length:var(--text-heading)]">
        {title}
      </h2>
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  )
}

function Explain({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose-prose max-w-none text-[length:var(--text-body)] leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}

function Compare({
  leftLabel,
  rightLabel,
  left,
  right,
}: {
  leftLabel: string
  rightLabel: string
  left: React.ReactNode
  right: React.ReactNode
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-3 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {leftLabel}
        </p>
        <div className="rounded-xl border border-border bg-card p-4">{left}</div>
      </div>
      <div>
        <p className="mb-3 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
          {rightLabel}
        </p>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">{right}</div>
      </div>
    </div>
  )
}

export default function InternalTestPage() {
  const okUrl = "https://pt.wikipedia.org/wiki/Eleições_no_Brasil"
  const badUrl = "javascript:alert(1)"
  const ok = safeHref(okUrl)
  const bad = safeHref(badUrl)

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#conteudo-interno"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:overflow-visible focus:rounded-lg focus:border focus:border-border focus:bg-foreground focus:px-4 focus:py-3 focus:text-[13px] focus:font-semibold focus:text-background focus:shadow-lg"
      >
        Pular para o conteudo (demo de skip link)
      </a>

      <div className="mx-auto max-w-4xl px-5 pb-24 pt-24 md:px-8">
        <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Rota interna
        </p>
        <h1
          id="conteudo-interno"
          className="mt-2 font-heading text-[length:var(--text-heading-lg)] uppercase leading-[0.9] tracking-tight text-foreground"
        >
          Internal test
        </h1>
        <p className="mt-4 max-w-2xl text-[length:var(--text-body)] text-muted-foreground">
          Blocos comparativos com as sugestoes do audit de front-end (
          <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">cursorfront.md</code>
          ) e notas do Context7. Nada aqui altera a home nem as fichas ate voce decidir aplicar no projeto.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="text-[length:var(--text-caption)] font-semibold text-foreground underline underline-offset-4 hover:text-muted-foreground"
          >
            Voltar ao inicio
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="text-[length:var(--text-caption)] text-muted-foreground">
            <code className="rounded bg-muted px-1">/internaltest</code> bloqueado em{" "}
            <code className="rounded bg-muted px-1">robots.txt</code>
          </span>
        </div>

        <div className="mt-16 space-y-0">
          <Block id="skip-link" title="1. Skip link">
            <Explain>
              <p>
                Primeiro link da pagina, visivel apenas ao receber foco por teclado (Tab). Ajuda leitores de tela e
                navegacao sem repetir o menu. Patron recomendado: apontar para <code className="text-foreground">#main-content</code> no layout raiz.
              </p>
            </Explain>
            <p className="text-[length:var(--text-caption)] text-muted-foreground">
              Experimente: pressione Tab ao carregar esta pagina. O link &quot;Pular para o conteudo&quot; deve aparecer no canto superior esquerdo.
            </p>
          </Block>

          <Block id="next-image" title="2. next/image vs img">
            <Explain>
              <p>
                A documentacao do Next.js recomenda <code className="text-foreground">Image</code> para URLs remotas com{" "}
                <code className="text-foreground">remotePatterns</code>: otimizacao de formato/tamanho,{" "}
                <code className="text-foreground">sizes</code> para layout responsivo e menos trabalho para o navegador no LCP.
                Hoje as fichas usam <code className="text-foreground">&lt;img&gt;</code> com eslint desligado. Abaixo o mesmo arquivo local; para{" "}
                <code className="text-foreground">foto_url</code> de candidatos (remotas), o ganho e maior (tamanhos, formatos, LCP).
              </p>
            </Explain>
            <Compare
              leftLabel="Padrao atual (img)"
              rightLabel="Sugestao (next/image)"
              left={
                <div className="flex flex-col items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={DEMO_LOCAL}
                    alt="Logo demo"
                    width={120}
                    height={24}
                    className="h-6 w-auto rounded-md border border-border p-2"
                    loading="lazy"
                  />
                  <span className="text-center text-[length:var(--text-caption)] text-muted-foreground">
                    Sem pipeline de otimizacao do Next
                  </span>
                </div>
              }
              right={
                <div className="flex flex-col items-center gap-3">
                  <Image
                    src={DEMO_LOCAL}
                    alt="Logo demo"
                    width={120}
                    height={24}
                    unoptimized
                    className="h-6 w-auto rounded-md border border-border p-2"
                  />
                  <span className="text-center text-[length:var(--text-caption)] text-muted-foreground">
                    <code className="rounded bg-muted px-1">next/image</code> (SVG com{" "}
                    <code className="rounded bg-muted px-1">unoptimized</code> conforme doc Next). Fotos JPG/WebP remotas usariam otimizacao automatica.
                  </span>
                </div>
              }
            />
          </Block>

          <Block id="safe-href" title="3. Links externos seguros (safeHref)">
            <Explain>
              <p>
                A funcao <code className="text-foreground">safeHref</code> em <code className="text-foreground">src/lib/utils.ts</code>{" "}
                so aceita <code className="text-foreground">http:</code> e <code className="text-foreground">https:</code>. Alinha com o plano de hardening de noticias: evita{" "}
                <code className="text-foreground">javascript:</code> em <code className="text-foreground">href</code>.
              </p>
            </Explain>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[length:var(--text-caption)] font-bold text-foreground">URL https</p>
                <p className="mt-1 break-all font-mono text-[12px] text-muted-foreground">{okUrl}</p>
                <p className="mt-2 text-[length:var(--text-caption)]">
                  safeHref retorna:{" "}
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{ok ? "link valido" : "null"}</span>
                </p>
                {ok && (
                  <a
                    href={ok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-[length:var(--text-caption)] font-semibold underline"
                  >
                    Abrir (demo)
                  </a>
                )}
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[length:var(--text-caption)] font-bold text-foreground">URL javascript:</p>
                <p className="mt-1 break-all font-mono text-[12px] text-muted-foreground">{badUrl}</p>
                <p className="mt-2 text-[length:var(--text-caption)]">
                  safeHref retorna:{" "}
                  <span className="font-mono text-red-600 dark:text-red-400">{bad === null ? "null" : String(bad)}</span>
                </p>
                <p className="mt-3 text-[length:var(--text-caption)] text-muted-foreground">
                  Na UI: renderizar texto sem &lt;a&gt; ou botao desabilitado com aviso.
                </p>
              </div>
            </div>
          </Block>

          <Block id="reduced-motion" title="4. prefers-reduced-motion">
            <Explain>
              <p>
                O <code className="text-foreground">globals.css</code> ja desliga <code className="text-foreground">hero-fade</code>,{" "}
                <code className="text-foreground">stagger-item</code> etc. quando o usuario pede menos movimento. Falta alinhar{" "}
                <strong className="text-foreground">GSAP no menu</strong> e <strong className="text-foreground">scrollIntoView suave</strong> no comparador ao mesmo criterio.
              </p>
            </Explain>
            <div className="flex flex-wrap items-center gap-8 rounded-xl border border-border bg-card p-6">
              <div className="flex flex-col items-center gap-2">
                <div className="size-10 rounded-full bg-foreground animate-bounce" />
                <span className="max-w-[140px] text-center text-[length:var(--text-caption)] text-muted-foreground">
                  Sempre anima (ignora preferencia do SO)
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="size-10 animate-bounce rounded-full bg-muted-foreground/40 motion-reduce:animate-none" />
                <span className="max-w-[160px] text-center text-[length:var(--text-caption)] text-muted-foreground">
                  Com <code className="rounded bg-muted px-0.5">motion-reduce:animate-none</code>
                </span>
              </div>
            </div>
            <ReducedMotionReader />
          </Block>

          <Block id="scroll-smooth" title="5. Scroll suave no comparador">
            <Explain>
              <p>
                Ao selecionar candidatos, o painel usa <code className="text-foreground">scrollIntoView(&#123; behavior: &quot;smooth&quot; &#125;)</code>. Para respeitar acessibilidade, o comportamento suave deve ser condicional.
              </p>
            </Explain>
            <ScrollBehaviorDemo />
          </Block>

          <Block id="base-ui-menu" title="6. Menu mobile (Base UI / documentacao)">
            <Explain>
              <p>
                A documentacao do Base UI (mesma familia dos primitivos do shadcn atual) descreve{" "}
                <code className="text-foreground">Menu</code> e <code className="text-foreground">Dialog</code> com{" "}
                <strong className="text-foreground">Portal</strong>, <strong className="text-foreground">foco</strong> e{" "}
                <strong className="text-foreground">restauracao de foco</strong> ao fechar. O Navbar hoje anima com GSAP sobre markup customizado.
              </p>
              <p className="mt-3">
                Esta pagina nao substitui o menu inteiro (mudanca grande). Quando for aplicar, o caminho e compor{" "}
                <code className="text-foreground">Menu.Root / Trigger / Portal / Popup</code> ou Dialog full-screen e manter o visual com Tailwind.
              </p>
            </Explain>
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
              Menu.Root -&gt; Menu.Trigger (hamburger)
              <br />
              -&gt; Menu.Portal -&gt; Menu.Positioner -&gt; Menu.Popup (links + fechar)
              <br />
              <span className="text-foreground">+ onOpenChange, Escape, focus trap (primitivos)</span>
            </div>
          </Block>

          <Block id="sitemap" title="7. Sitemap (nota)">
            <Explain>
              <p>
                O audit sugeriu incluir <code className="text-foreground">/explorar</code> em{" "}
                <code className="text-foreground">sitemap.ts</code>. Isso nao muda UI; so SEO. Pode ser feito em PR separado.
              </p>
            </Explain>
          </Block>
        </div>
      </div>
    </div>
  )
}
