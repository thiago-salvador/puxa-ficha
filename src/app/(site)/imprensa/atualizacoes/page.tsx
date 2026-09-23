import type { Metadata } from "next"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { NoticePanel } from "@/components/NoticePanel"
import { SectionDivider, SectionLabel, SectionTitle } from "@/components/SectionHeader"
import { formatUpdateValue } from "@/lib/verified-candidate-updates"
import { getImprensaAtualizacoesPage } from "@/lib/imprensa-atualizacoes"

export const metadata: Metadata = {
  title: "Atualizações verificadas | Puxa Ficha",
  description: "Alterações observadas em fontes oficiais e verificadas para candidatos publicados.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/imprensa/atualizacoes" },
}
export const dynamic = "force-dynamic"

function formatDetectedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
}

function fieldLabel(field: string): string {
  return field === "patrimonio" ? "Patrimônio" : field === "situacao" ? "Situação da candidatura" : "Partido"
}

export default async function ImprensaAtualizacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const rawPage = params.page ?? "1"
  const parsedPage = /^\d{1,4}$/.test(rawPage) ? Number(rawPage) : 1
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const resource = await getImprensaAtualizacoesPage(page)

  return (
    <div className="min-h-screen bg-background">
      <section className="bg-black px-5 pb-12 pt-28 text-white sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
        <div className="mx-auto max-w-7xl">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white/70">Mesa de apuração</p>
          <h1 className="mt-2 max-w-3xl font-heading text-[clamp(36px,8vw,80px)] uppercase leading-[0.88]">Atualizações verificadas</h1>
          <p className="mt-4 max-w-2xl text-[length:var(--text-body)] font-medium leading-relaxed text-white/80">
            Mudanças observadas em fontes oficiais e liberadas para consulta pública. A data abaixo é a data de detecção da mudança.
          </p>
        </div>
      </section>

      <div className="pt-8 sm:pt-12"><SectionDivider /></div>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <Link href="/imprensa" className="mb-8 inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4">Voltar à Mesa de apuração</Link>
        <div className="max-w-3xl">
          <SectionLabel>Fonte e detecção</SectionLabel>
          <SectionTitle>Registro público de mudanças</SectionTitle>
          <p className="mt-4 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground sm:text-[length:var(--text-body)]">
            Cada registro aponta para a fonte oficial usada na verificação. A página não interpreta a mudança como correção editorial nem afirma quando o fato ocorreu.
          </p>
        </div>

        {resource.status === "unavailable" ? (
          <NoticePanel tone="caution" eyebrow="Fonte temporariamente indisponível" description="Não foi possível carregar o registro verificado agora. Tente novamente em instantes." className="mt-8 max-w-2xl" />
        ) : resource.updates.length === 0 ? (
          <NoticePanel tone="neutral" eyebrow="Sem registros nesta página" description="Nenhuma atualização verificada foi encontrada neste recorte." className="mt-8 max-w-2xl" />
        ) : (
          <>
            <ol className="mt-8 grid max-w-4xl gap-4" aria-label="Atualizações verificadas">
              {resource.updates.map((update) => (
                <li key={update.id} className="rounded-[16px] border border-border/60 bg-card p-5 sm:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className="text-[length:var(--text-body-lg)] font-bold text-foreground">{update.candidate_name}</h2>
                    <time dateTime={update.detected_at} className="text-[length:var(--text-caption)] font-semibold text-muted-foreground">Detectada em {formatDetectedAt(update.detected_at)}</time>
                  </div>
                  <p className="mt-2 text-[length:var(--text-body-sm)] font-bold uppercase tracking-[0.08em] text-muted-foreground">{fieldLabel(update.field)} · {update.year}</p>
                  <dl className="mt-4 grid gap-3 text-[length:var(--text-body-sm)] sm:grid-cols-2">
                    <div><dt className="font-semibold text-muted-foreground">Antes</dt><dd className="mt-1 font-medium text-foreground">{formatUpdateValue(update, update.before_value)}</dd></div>
                    <div><dt className="font-semibold text-muted-foreground">Depois</dt><dd className="mt-1 font-medium text-foreground">{formatUpdateValue(update, update.after_value)}</dd></div>
                  </dl>
                  <a href={update.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4">Ver fonte oficial<span aria-hidden="true" className="ml-1">↗</span></a>
                </li>
              ))}
            </ol>
            <nav aria-label="Paginação das atualizações" className="mt-8 flex flex-wrap items-center gap-3">
              {resource.page > 1 ? <Link href={`/imprensa/atualizacoes?page=${resource.page - 1}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 font-semibold">Anterior</Link> : null}
              <span className="text-[length:var(--text-body-sm)] font-semibold text-muted-foreground">Página {resource.page}</span>
              {resource.hasNext ? <Link href={`/imprensa/atualizacoes?page=${resource.page + 1}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 font-semibold">Próxima</Link> : null}
            </nav>
          </>
        )}
      </main>
      <Footer />
    </div>
  )
}
