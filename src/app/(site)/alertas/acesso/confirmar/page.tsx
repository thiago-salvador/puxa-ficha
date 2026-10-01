import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { TriangleAlert } from "lucide-react"
import { Footer } from "@/components/Footer"
import { SectionDivider } from "@/components/SectionHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { buildTwitterMetadata } from "@/lib/metadata"
import { ALERT_PENDING_MANAGE_TOKEN_COOKIE_NAME } from "@/lib/alerts-session"
import { normalizeOpaqueToken } from "@/lib/alerts-shared"

const title = "Trocar de conta | Puxa Ficha"
const description = "Confirme se quer trocar a conta de alertas usada neste navegador."

export const metadata: Metadata = {
  title,
  description,
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/alertas/acesso/confirmar",
  },
  twitter: buildTwitterMetadata({
    title,
    description,
  }),
}

/**
 * Confirmação da troca de conta de alertas.
 *
 * GET /alertas/acesso manda para cá quando o navegador já tem sessão de outro
 * assinante. O token do link fica num cookie pendente (httpOnly, 10 min); esta
 * página só mostra o pedido e envia o form para POST /alertas/acesso, que checa a
 * origem, revalida o token e só então troca a sessão.
 */
export default async function AlertasAcessoConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string; hash?: string }>
}) {
  const sp = await searchParams
  const verify = normalizeOpaqueToken(sp.verify ?? "")
  const hash = sp.hash === "deletar-dados" || sp.hash === "cancelar-tudo" ? sp.hash : null
  const hasPendingSwitch = (await cookies()).has(ALERT_PENDING_MANAGE_TOKEN_COOKIE_NAME)

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/60" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Alertas
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Trocar de conta
          </h1>
        </div>
      </section>

      <div className="pt-8 sm:pt-12">
        <SectionDivider />
      </div>

      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        {hasPendingSwitch ? (
          <div className="rounded-[20px] border border-border/60 bg-card p-5 sm:p-6">
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Acesso aos alertas
            </p>
            <h2 className="mt-1 font-heading text-3xl uppercase leading-none text-foreground sm:text-4xl">
              Este link é de outra conta
            </h2>
            <p className="mt-3 text-[length:var(--text-body-sm)] text-foreground">
              Este navegador já está conectado a outra conta de alertas. Abrir o link não trocou a conta.
              Confirme só se foi você quem pediu este link e quer gerenciar os alertas dele aqui.
            </p>
            <form method="post" action="/alertas/acesso" className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              {verify ? <input type="hidden" name="verify" value={verify} /> : null}
              {!verify && hash ? <input type="hidden" name="hash" value={hash} /> : null}
              <Button type="submit" size="lg">
                Trocar para esta conta
              </Button>
              <Link
                href="/alertas/gerenciar"
                className="text-[length:var(--text-body-sm)] font-semibold text-foreground underline underline-offset-4"
              >
                Manter a conta atual
              </Link>
            </form>
          </div>
        ) : (
          <Alert>
            <TriangleAlert className="size-4" />
            <AlertTitle>Nenhuma troca pendente</AlertTitle>
            <AlertDescription>
              O pedido de troca expirou ou já foi usado. Para trocar de conta, abra de novo o link enviado por email.{" "}
              <Link href="/alertas/gerenciar" className="font-semibold underline underline-offset-4">
                Ir para a gestão dos alertas
              </Link>
            </AlertDescription>
          </Alert>
        )}
      </div>
      <Footer />
    </div>
  )
}
