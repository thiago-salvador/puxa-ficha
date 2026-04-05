import type { Metadata } from "next"
import { AlertVerifyClient } from "@/components/alerts/AlertVerifyClient"
import { Footer } from "@/components/Footer"
import { SectionDivider } from "@/components/SectionHeader"
import { buildTwitterMetadata } from "@/lib/metadata"
import { normalizeOpaqueToken } from "@/lib/alerts-shared"

const title = "Confirmar alertas — Puxa Ficha"
const description = "Confirme seu email para ativar alertas sobre atualizações relevantes nas fichas acompanhadas."

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
    url: "https://puxaficha.com.br/alertas/verificar",
  },
  twitter: buildTwitterMetadata({
    title,
    description,
  }),
}

export default async function AlertasVerificarPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; manage?: string }>
}) {
  const sp = await searchParams
  const token = normalizeOpaqueToken(sp.token ?? "")
  const manageToken = normalizeOpaqueToken(sp.manage ?? "")

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
            Confirmar email
          </h1>
        </div>
      </section>

      <div className="pt-8 sm:pt-12">
        <SectionDivider />
      </div>

      <AlertVerifyClient initialManageToken={manageToken} initialToken={token} />
      <Footer />
    </div>
  )
}
