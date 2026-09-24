import type { Metadata } from "next"
import Link from "next/link"
import {
  type FreshnessStatus,
  type ImprensaFreshnessSource,
} from "@/lib/imprensa-frescor"
import { getImprensaFreshnessDataset } from "@/lib/imprensa-frescor-server"

export const metadata: Metadata = {
  title: "Frescor das fontes | Puxa Ficha",
  description: "Últimas coletas públicas demonstráveis e limites de atualização das fontes do Puxa Ficha.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

const STATUS_LABELS: Record<FreshnessStatus, string> = {
  sem_agenda: "Coleta registrada, sem agenda demonstrada",
  limiar_excedido: "Último sucesso além do limiar de frescor",
  erro_na_fonte: "Erro na tentativa mais recente entre alvos",
  sem_prova: "Sem coleta bem-sucedida demonstrada",
}

function formatDate(value: string | null): string {
  if (!value) return "Não demonstrado"
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? "Data inválida" : date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" })
}

function statusClass(status: FreshnessStatus): string {
  if (status === "sem_agenda") return "border-amber-200 bg-amber-50 text-amber-950"
  if (status === "limiar_excedido") return "border-orange-200 bg-orange-50 text-orange-950"
  if (status === "erro_na_fonte") return "border-red-200 bg-red-50 text-red-900"
  return "border-neutral-200 bg-neutral-50 text-neutral-800"
}

function cadenceLabel(cadence: string): string {
  if (cadence === "daily") return "Diária"
  if (cadence === "weekly") return "Semanal"
  if (cadence === "on_demand") return "Sob demanda"
  return "Não demonstrada"
}

function SourceCard({ item }: { item: ImprensaFreshnessSource }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">Fonte</p>
          <h2 className="mt-1 text-[length:var(--text-heading-sm)] font-semibold text-foreground">{item.source.label}</h2>
        </div>
        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-[length:var(--text-caption)] font-bold ${statusClass(item.status)}`}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 text-[length:var(--text-body-sm)] sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-foreground">Última tentativa</dt>
          <dd className="mt-1 text-muted-foreground">{formatDate(item.ultimaColetaTentada)} · entre os alvos registrados</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Resultado dessa tentativa</dt>
          <dd className="mt-1 text-muted-foreground">{item.resultadoDaColeta ?? "Não demonstrado"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Última coleta bem-sucedida</dt>
          <dd className="mt-1 text-muted-foreground">{formatDate(item.ultimaColetaBemSucedida)} · entre os alvos registrados</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Verificação do campo</dt>
          <dd className="mt-1 text-muted-foreground">{formatDate(item.verificacaoDoCampo)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Atualização da ficha</dt>
          <dd className="mt-1 text-muted-foreground">{formatDate(item.atualizacaoDaFicha)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Próxima coleta</dt>
          <dd className="mt-1 text-muted-foreground">{formatDate(item.proximaColetaDemonstrada)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Periodicidade no catálogo</dt>
          <dd className="mt-1 text-muted-foreground">{cadenceLabel(item.source.cadence)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Limiar de frescor do catálogo</dt>
          <dd className="mt-1 text-muted-foreground">{item.source.maxAgeHours === null ? "Não definido" : `${item.source.maxAgeHours} horas`}</dd>
        </div>
      </dl>

      <p className="mt-5 text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
        A linha de coleta confirma uma tentativa da fonte. Ela não confirma, sozinha, a verificação de um campo nem a atualização da ficha.
      </p>
      <a className="mt-3 inline-block text-[length:var(--text-caption)] font-semibold text-foreground underline underline-offset-4" href={item.source.authorityUrl} rel="noreferrer">
        Abrir fonte oficial
      </a>
    </article>
  )
}

export default async function ImprensaFrescorPage() {
  let dataset: Awaited<ReturnType<typeof getImprensaFreshnessDataset>> | null = null
  let error: string | null = null
  try {
    dataset = await getImprensaFreshnessDataset()
  } catch {
    error = "Não foi possível consultar os recibos de coleta agora."
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-black text-white">
        <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-20">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-neutral-400">Mesa de apuração</p>
          <h1 className="mt-2 font-heading text-[clamp(40px,8vw,76px)] uppercase leading-[0.88]">Frescor das fontes</h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-neutral-300">
            O painel mostra a última coleta bem-sucedida que pode ser demonstrada no recibo operacional e preserva os limites entre coleta, verificação do campo e atualização da ficha.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
        <div className="mb-8 flex flex-wrap gap-4 text-[length:var(--text-body-sm)]">
          <Link className="font-semibold text-foreground underline underline-offset-4" href="/imprensa">Voltar à Mesa de apuração</Link>
          <Link className="font-semibold text-foreground underline underline-offset-4" href="/metodologia">Metodologia e fontes</Link>
        </div>

        {error ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">
            <h2 className="font-semibold">Frescor indisponível</h2>
            <p className="mt-2 text-[length:var(--text-body-sm)]">{error} A falha não é convertida em ausência de coleta.</p>
          </section>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {dataset?.sources.map((item) => <SourceCard key={item.source.id} item={item} />)}
            </div>
            <p className="mt-8 border-t border-border pt-5 text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
              Atualizado em {formatDate(dataset?.generatedAt ?? null)}. O limiar vem do catálogo interno de frescor. “Além do limiar” significa que até o sucesso mais recente entre os alvos registrados ficou antigo; um sucesso recente não comprova que todos os alvos estejam em dia. Sem horário nominal de execução comprovado, a próxima coleta permanece sem data.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
