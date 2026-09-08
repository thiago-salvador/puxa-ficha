import Link from "next/link"
import { History } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"
import { formatUpdateValue, type VerifiedUpdatesResource } from "@/lib/verified-candidate-updates"

const FIELD_LABELS = { patrimonio: "Patrimônio declarado", situacao: "Situação da candidatura", partido: "Partido declarado na eleição" }

export function HomeRecentUpdates({ resource = { status: "unavailable", updates: [] } }: { resource?: VerifiedUpdatesResource }) {
  const available = resource.status === "available"
  return (
    <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12 lg:pt-12" aria-labelledby="updates-title">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em]">O que mudou</p>
      <h2 id="updates-title" className="mt-1 font-heading text-[clamp(28px,5vw,48px)] uppercase leading-[0.95]">Atualizações recentes</h2>
      <SlashDivider className="mb-8 mt-6 sm:mt-8" />
      {available && resource.updates.length > 0 ? (
        <>
          <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">Diferenças verificadas entre duas consultas ao TSE. A data indica quando detectamos a alteração, não quando ela aconteceu.</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resource.updates.map((update) => (
              <li key={update.id} className="rounded-xl border border-border bg-muted p-5">
                <p className="text-xs font-semibold uppercase tracking-wide">{FIELD_LABELS[update.field]} · {update.year}</p>
                <h3 className="mt-3 font-heading text-2xl uppercase leading-tight">{update.candidate_name}</h3>
                <dl className="mt-4 space-y-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Antes</dt><dd className="break-words">{formatUpdateValue(update, update.before_value)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Agora</dt><dd className="break-words font-semibold">{formatUpdateValue(update, update.after_value)}</dd></div>
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">Detectado em <time dateTime={update.detected_at}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(update.detected_at))}</time> (Brasília)</p>
                <div className="mt-3 flex flex-wrap gap-x-5">
                  <Link href={`/candidato/${update.candidate_slug}`} className="inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-4">Ver ficha<span className="sr-only"> de {update.candidate_name}</span></Link>
                  <a href={update.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-4">Fonte: TSE<span className="sr-only"> (abre em nova aba)</span></a>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
      <div className="flex gap-4 rounded-xl border border-border bg-muted p-5 sm:p-6">
        <History className="mt-1 size-5 shrink-0" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold">{available ? "Ainda não há mudanças verificadas neste histórico." : "O histórico de mudanças verificadas ainda não está disponível."}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{available ? "A primeira consulta cria a referência inicial. Novas diferenças no patrimônio declarado e na situação da candidatura aparecerão aqui depois de verificadas. Isso não significa que nenhuma mudança ocorreu fora das fontes consultadas." : "Você pode consultar as informações e as fontes disponíveis em cada ficha. A data de coleta de um dado não significa que houve uma mudança na candidatura."}</p>
          <Link href="/metodologia" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-4">Entenda como consultamos as fontes</Link>
        </div>
      </div>
      )}
    </section>
  )
}
