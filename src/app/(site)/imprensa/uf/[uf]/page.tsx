import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Footer } from "@/components/Footer"
import { NoticePanel } from "@/components/NoticePanel"
import { getImprensaDataset } from "@/lib/imprensa-data"
import { IMPRENSA_UFS, chapaSummary, countRowsByCargo, isImprensaUf, rowGaps } from "@/lib/imprensa-uf-pack"
import { getImprensaUfUpdates } from "@/lib/imprensa-uf-updates"
import { formatUpdateValue } from "@/lib/verified-candidate-updates"
import { formatDisplayName } from "@/lib/display-name"

export const metadata: Metadata = {
  title: "Candidatos por estado | Puxa Ficha",
  description: "Recorte estadual de candidatos, fichas públicas, composição de chapa, atualizações verificadas e limites de cobertura.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

function fieldLabel(field: string): string {
  return field === "patrimonio" ? "Patrimônio" : field === "situacao" ? "Situação da candidatura" : "Partido"
}

function formatDetectedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(value))
}

export default async function ImprensaUfPage({ params }: { params: Promise<{ uf: string }> }) {
  const { uf: rawUf } = await params
  const uf = rawUf.toUpperCase()
  if (!isImprensaUf(uf)) notFound()

  let dataset: Awaited<ReturnType<typeof getImprensaDataset>> | null = null
  try {
    dataset = await getImprensaDataset({ cargo: null, uf })
  } catch {
    // A indisponibilidade da fonte é exibida separadamente de um recorte com zero linhas.
  }

  const rows = dataset?.rows ?? []
  const counts = dataset ? countRowsByCargo(dataset) : []
  const updates = dataset ? await getImprensaUfUpdates(rows.map((row) => row.slug)) : null

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-black px-5 pb-10 pt-24 text-white md:px-12 md:pb-14">
        <div className="mx-auto max-w-7xl">
          <Link href="/imprensa" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Sala de imprensa</Link>
          <p className="mt-8 text-sm font-bold uppercase tracking-[0.12em] text-white/70">Pacote por estado</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight md:text-6xl">{uf}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-white/80">Candidatos publicados neste recorte, com links para as fichas e indicação dos dados disponíveis e das lacunas.</p>
          <p role="note" className="mt-6 max-w-3xl border-l-4 border-amber-500 bg-amber-50 p-3 font-semibold text-amber-950">Confira os dados na fonte original antes de publicar.</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 md:px-12 md:py-14">
        <div className="mb-10 flex flex-wrap gap-2" aria-label="Pacotes por estado">
          {IMPRENSA_UFS.map((code) => <Link key={code} href={`/imprensa/uf/${code.toLowerCase()}`} aria-current={code === uf ? "page" : undefined} className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-bold ${code === uf ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-muted"}`}>{code}</Link>)}
        </div>

        {dataset === null ? (
          <NoticePanel tone="caution" eyebrow="Fonte temporariamente indisponível" description="Não foi possível carregar os candidatos deste estado. A contagem não está disponível neste momento." className="max-w-3xl" />
        ) : (
          <>
            <section aria-labelledby="totais-title" className="max-w-4xl">
              <h2 id="totais-title" className="text-2xl font-bold text-foreground">Candidatos por cargo</h2>
              <p className="mt-2 text-muted-foreground">Total no recorte: <strong className="text-foreground">{rows.length}</strong> · export atualizado em <time data-generated-at={dataset.generatedAt} dateTime={dataset.generatedAt}>{formatDetectedAt(dataset.generatedAt)}</time>.</p>
              {counts.length ? <ul className="mt-4 flex flex-wrap gap-3">{counts.map(({ cargo, total }) => <li key={cargo} className="rounded-xl border border-border bg-card px-4 py-3"><strong>{cargo}</strong>: {total}</li>)}</ul> : <p className="mt-4">Nenhum candidato publicado neste recorte.</p>}
            </section>

            <section aria-labelledby="candidatos-title" className="mt-12">
              <h2 id="candidatos-title" className="text-2xl font-bold text-foreground">Fichas e composição de chapa</h2>
              {rows.length === 0 ? <p className="mt-4 text-muted-foreground">Não há candidatos publicados para este estado no export consultado.</p> : (
                <ul className="mt-5 grid gap-4 md:grid-cols-2">
                  {rows.map((row) => {
                    const gaps = rowGaps(row)
                    return <li key={row.slug} className="rounded-2xl border border-border bg-card p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{row.cargo} · {row.partido ?? "partido sem dado"}</p>
                      <h3 className="mt-2 text-xl font-bold text-foreground"><Link href={row.fichaUrl} className="underline underline-offset-4">{row.nome}</Link></h3>
                      <p className="mt-3 text-sm text-foreground">{chapaSummary(row)}</p>
                      {gaps.length ? <p className="mt-3 text-sm text-muted-foreground"><strong className="text-foreground">Lacunas:</strong> {gaps.join("; ")}.</p> : <p className="mt-3 text-sm text-muted-foreground">Sem lacuna indicada nos campos publicados neste pacote.</p>}
                    </li>
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        <section aria-labelledby="updates-title" className="mt-14 border-t border-border pt-10">
          <h2 id="updates-title" className="text-2xl font-bold text-foreground">Mudanças verificadas</h2>
          {updates === null || updates.status === "unavailable" || (updates.total === null && updates.updates.length === 0) ? (
            <NoticePanel tone="caution" eyebrow="Registro temporariamente indisponível" description="Não foi possível consultar as mudanças verificadas deste recorte. Isso não confirma que não houve mudanças." className="mt-5 max-w-3xl" />
          ) : updates.total === 0 ? (
            <p className="mt-4 text-muted-foreground">Nenhuma mudança verificada foi encontrada neste recorte.</p>
          ) : (
            <>
              <p className="mt-2 text-muted-foreground">{updates.total === null ? "Registros encontrados; total indisponível." : `${updates.total} registro(s) verificado(s).`}{updates.total !== null && updates.total > updates.updates.length ? " Exibindo os 20 mais recentes." : ""}</p>
              <ul className="mt-5 grid max-w-4xl gap-4">
                {updates.updates.map((update) => <li key={update.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-wrap justify-between gap-2"><strong>{formatDisplayName(update.candidate_name)}</strong><time dateTime={update.detected_at} className="text-sm text-muted-foreground">Detectada em {formatDetectedAt(update.detected_at)}</time></div>
                  <p className="mt-2 text-sm font-semibold">{fieldLabel(update.field)} · {update.year}</p>
                  <p className="mt-2 text-sm">Antes: {formatUpdateValue(update, update.before_value)} · Depois: {formatUpdateValue(update, update.after_value)}</p>
                  <a href={update.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Ver fonte oficial</a>
                </li>)}
              </ul>
            </>
          )}
        </section>

        <p className="mt-12 max-w-3xl border-l-4 border-amber-600 bg-amber-50 p-4 font-semibold text-amber-950">Confira os dados na fonte original antes de publicar.</p>
        <Link href="/imprensa/mesa" className="mt-8 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Abrir Mesa de apuração</Link>
      </main>
      <Footer />
    </div>
  )
}
