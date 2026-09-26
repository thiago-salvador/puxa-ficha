import type { Metadata } from "next"
import Link from "next/link"
import { getImprensaDatasetCached } from "@/lib/imprensa-cache"
import { normalizeImprensaFilters } from "@/lib/imprensa-data"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { isSenadoEnabled } from "@/lib/senado-feature"

// cspell:ignore numeros confianca

export const metadata: Metadata = {
  title: "Imprensa | Puxa Ficha",
  description: "Informações, fontes, recortes e ferramentas públicas do Puxa Ficha para apuração jornalística.",
}

const aviso = "Confira os dados na fonte original antes de publicar."

function counts(rows: Array<{ cargo: string; uf: string | null; sites: { estado: string }; chapa: { estado: string }; processos: { estado: string } }>) {
  const by = (pick: (row: (typeof rows)[number]) => string) => Object.fromEntries(
    [...new Set(rows.map(pick))].sort().map((key) => [key, rows.filter((row) => pick(row) === key).length]),
  )
  return {
    cargos: by((row) => row.cargo),
    ufs: new Set(rows.map((row) => row.uf).filter(Boolean)).size,
    processos: by((row) => row.processos.estado),
    sites: by((row) => row.sites.estado),
    chapas: by((row) => row.chapa.estado),
  }
}

export default async function ImprensaSala() {
  const alertsEnabled = isAlertsEmailFeatureEnabled()
  const senateEnabled = isSenadoEnabled()
  let summary: ReturnType<typeof counts> | null = null
  let generatedAt: string | null = null
  try {
    const dataset = await getImprensaDatasetCached(normalizeImprensaFilters({}))
    summary = counts(dataset.rows)
    generatedAt = dataset.generatedAt
  } catch {
    // Uma falha de consulta não deve parecer uma contagem igual a zero.
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pb-10 pt-24 text-foreground sm:px-8">
      <header className="max-w-3xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Puxa Ficha · imprensa</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Sala de imprensa</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">Fontes, recortes e ferramentas públicas para consultar informações sobre candidaturas e conferir cada dado na origem.</p>
        <p role="note" className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 font-semibold text-amber-950">{aviso}</p>
      </header>

      <nav aria-label="Tarefas de imprensa" className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link className="rounded-xl border border-border p-5 font-semibold hover:bg-muted" href="/imprensa/mesa">Achar fonte sobre um candidato</Link>
        <Link className="rounded-xl border border-border p-5 font-semibold hover:bg-muted" href="/api/imprensa/export?format=csv">Baixar recorte</Link>
        <Link className="rounded-xl border border-border p-5 font-semibold hover:bg-muted" href={alertsEnabled ? "/imprensa/mesa#alertas" : "/imprensa/atualizacoes"}>Receber atualizações</Link>
      </nav>

      <div className="mt-10 space-y-12">
        <section id="o-que-e" aria-labelledby="o-que-e-title">
          <h2 id="o-que-e-title" className="text-2xl font-bold">O que é e o que não é</h2>
          <p className="mt-3 max-w-3xl leading-7">O Puxa Ficha reúne informações públicas de candidaturas e suas fontes. Não recomenda voto. Um processo listado não equivale a condenação. Falta de dado não significa zero.</p>
        </section>

        <section id="numeros" aria-labelledby="numeros-title">
          <h2 id="numeros-title" className="text-2xl font-bold">Números ao vivo</h2>
          {summary ? <>
            <p className="mt-2">{Object.values(summary.cargos).reduce((sum, n) => sum + n, 0)} candidatos · {summary.ufs} UFs com registros · coleta {generatedAt ? new Date(generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "sem data"}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CountCard title="Candidatos por cargo" values={summary.cargos} />
              <CountCard title="Processos por estado do dado" values={summary.processos} />
              <CountCard title="Sites por estado do dado" values={summary.sites} />
              <CountCard title="Chapas por estado do dado" values={summary.chapas} />
            </div>
          </> : <p role="status" className="mt-3">Contagens temporariamente indisponíveis. Uma falha de consulta não representa zero.</p>}
        </section>

        <section id="confianca" aria-labelledby="confianca-title">
          <h2 id="confianca-title" className="text-2xl font-bold">Fontes e confiança</h2>
          <p className="mt-3 leading-7">Consulte as fontes oficiais e o SHA-256 dos arquivos do TSE na Mesa. Cada grupo de dados informa seu estado e a data disponível. O código do projeto usa Apache-2.0; correções podem ser acompanhadas por issue ou pull request.</p>
          <Link className="mt-3 inline-block underline" href="/imprensa/mesa#dicionario">Ver estados e dicionário de campos</Link>
        </section>

        <section id="pautas" aria-labelledby="pautas-title">
          <h2 id="pautas-title" className="text-2xl font-bold">Recortes para apuração</h2>
          <p className="mt-3">Abra a Mesa e aplique os filtros. Os links não antecipam achados.</p>
          <div className="mt-3 flex flex-wrap gap-4"><Link className="underline" href="/imprensa/mesa?cargo=Presidente">Presidência</Link><Link className="underline" href="/imprensa/mesa?cargo=Governador">Governos estaduais</Link>{senateEnabled ? <Link className="underline" href="/imprensa/mesa?cargo=Senador">Senado</Link> : null}</div>
        </section>

        <section id="ferramentas" aria-labelledby="ferramentas-title">
          <h2 id="ferramentas-title" className="text-2xl font-bold">Ferramentas</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <li><Link className="underline" href="/imprensa/mesa">Mesa de apuração</Link></li>
            <li><a className="underline" href="/api/imprensa/export?format=csv">Baixar CSV</a> · <a className="underline" href="/api/imprensa/export?format=json">Baixar JSON</a></li>
            <li><Link className="underline" href="/embed">Embed</Link> · <Link className="underline" href="/imprensa/mesa#linhas">Card público nas fichas</Link></li>
            <li><Link className="underline" href="/comparar">Comparador</Link> · <Link className="underline" href={alertsEnabled ? "/imprensa/mesa#alertas" : "/imprensa/atualizacoes"}>Alertas por cargo e UF</Link></li>
            <li><Link className="underline" href="/imprensa/mesa#linhas">Como citar</Link></li>
          </ul>
        </section>

        <section id="kit" aria-labelledby="kit-title"><h2 id="kit-title" className="text-2xl font-bold">Kit de imprensa</h2><p className="mt-3">Logo, screenshots, textos e PDF: em preparação.</p></section>
        <section id="contato" aria-labelledby="contato-title"><h2 id="contato-title" className="text-2xl font-bold">Contato</h2><p className="mt-3">Para dúvidas e correções: <a className="underline" href="mailto:contato@puxaficha.com.br">contato@puxaficha.com.br</a>.</p></section>
        <section id="perguntas" aria-labelledby="perguntas-title"><h2 id="perguntas-title" className="text-2xl font-bold">Perguntas frequentes</h2><p className="mt-3">Quem faz e quem financia o projeto? Consulte as informações em <Link className="underline" href="/sobre">Sobre</Link>.</p></section>
        <section id="atualizacoes" aria-labelledby="atualizacoes-title"><h2 id="atualizacoes-title" className="text-2xl font-bold">Atualizações e frescor</h2><p className="mt-3"><Link className="underline" href="/imprensa/atualizacoes">Atualizações verificadas</Link> · <Link className="underline" href="/imprensa/frescor">Frescor das fontes</Link></p></section>
      </div>
    </main>
  )
}

function CountCard({ title, values }: { title: string; values: Record<string, number> }) {
  return <div className="rounded-xl border border-border p-4"><h3 className="font-semibold">{title}</h3><ul className="mt-2 space-y-1 text-sm">{Object.entries(values).map(([label, value]) => <li key={label} className="flex justify-between gap-4"><span>{label}</span><strong>{value}</strong></li>)}</ul></div>
}
