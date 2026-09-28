import type { Metadata } from "next"
import Link from "next/link"
import { getImprensaDatasetCached } from "@/lib/imprensa-cache"
import { normalizeImprensaFilters } from "@/lib/imprensa-data"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { IMPRENSA_UFS, labelProcessState, labelState } from "@/lib/imprensa-uf-pack"
import { isSenadoEnabled } from "@/lib/senado-feature"
import styles from "./imprensa.module.css"

// cspell:ignore numeros confianca

export const metadata: Metadata = {
  title: "Imprensa | Puxa Ficha",
  description: "Informações, fontes, recortes e ferramentas públicas do Puxa Ficha para apuração jornalística.",
  alternates: { canonical: "/imprensa" },
}

const aviso = "Confira os dados na fonte original antes de publicar."

function counts(rows: Array<{ cargo: string; uf: string | null; sites: { estado: string }; chapa: { estado: string; suplentesEstado: string }; processos: { estado: string; quantidadeEmConfirmacao?: number } }>) {
  const by = (subset: typeof rows, pick: (row: (typeof rows)[number]) => string) => Object.fromEntries(
    [...new Set(subset.map(pick))].sort().map((key) => [key, subset.filter((row) => pick(row) === key).length]),
  )
  const viceRows = rows.filter((row) => row.cargo === "Presidente" || row.cargo === "Governador")
  const senateRows = rows.filter((row) => row.cargo === "Senador")
  return {
    cargos: by(rows, (row) => row.cargo),
    ufs: new Set(rows.map((row) => row.uf).filter(Boolean)).size,
    processos: by(rows, (row) => row.processos.estado),
    processosComSelo: rows.filter((row) => (row.processos.quantidadeEmConfirmacao ?? 0) > 0).length,
    sites: by(rows, (row) => row.sites.estado),
    vice: by(viceRows, (row) => row.chapa.estado),
    suplentes: by(senateRows, (row) => row.chapa.suplentesEstado),
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
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Puxa Ficha · imprensa</p>
          <h1 className={styles.heroTitle}>Sala de imprensa</h1>
          <p className={styles.heroCopy}>Fontes, recortes e ferramentas públicas para consultar informações sobre candidaturas e conferir cada dado na origem.</p>
          <p role="note" className={styles.salaNotice}>{aviso}</p>
        </div>
      </header>

      <div className={styles.content}>
      <nav aria-label="Tarefas de imprensa" className={styles.taskLinks}>
        <Link href="/imprensa/mesa">Achar fonte sobre um candidato</Link>
        <a href="/api/imprensa/export?format=csv">Baixar recorte</a>
        <Link href={alertsEnabled ? "/imprensa/mesa#alertas" : "/imprensa/atualizacoes"}>Receber atualizações</Link>
      </nav>

      <div className={styles.salaSections}>
        <section id="o-que-e" className={styles.salaSection} aria-labelledby="o-que-e-title">
          <h2 id="o-que-e-title" className={styles.salaTitle}>O que é e o que não é</h2>
          <p className="mt-3 max-w-3xl leading-7">O Puxa Ficha reúne informações públicas de candidaturas e suas fontes. Não recomenda voto. Um processo listado não equivale a condenação. Falta de dado não significa zero.</p>
        </section>

        <section id="numeros" className={styles.salaSection} aria-labelledby="numeros-title">
          <h2 id="numeros-title" className={styles.salaTitle}>Números da base</h2>
          {summary ? <>
            <p className="mt-2">{Object.values(summary.cargos).reduce((sum, n) => sum + n, 0)} candidatos · {summary.ufs} UFs com registros · consulta em {generatedAt ? new Date(generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "sem data"}</p>
            <div className={styles.statsGrid}>
              <CountCard title="Candidatos por cargo" values={summary.cargos} labels="cargo" />
              <CountCard title="Processos por estado do dado" values={summary.processos} labels="processos" />
              <CountCard title="Sites por estado do dado" values={summary.sites} />
              <CountCard title="Vice (Presidente e Governador)" values={summary.vice} />
              {Object.keys(summary.suplentes).length > 0 && <CountCard title="Suplentes (Senador)" values={summary.suplentes} />}
            </div>
            <p className="mt-3">Os candidatos foram buscados pelo nome no Diário de Justiça Eletrônico Nacional. Quando o nome aparece sem um segundo dado oficial que confirme a pessoa, o processo não é publicado, para não atribuir a alguém o processo de um homônimo.</p>
            {summary.processosComSelo > 0 && <p className="mt-3">{summary.processosComSelo} candidato{summary.processosComSelo === 1 ? " tem" : "s têm"} processo com fonte oficial em confirmação: o registro aparece na ficha com esse aviso e ainda falta localizar a página do próprio tribunal.</p>}
          </> : <p role="status" className="mt-3">Contagens temporariamente indisponíveis. Uma falha de consulta não representa zero.</p>}
        </section>

        <section id="confianca" className={styles.salaSection} aria-labelledby="confianca-title">
          <h2 id="confianca-title" className={styles.salaTitle}>Fontes e confiança</h2>
          <p className="mt-3 leading-7">Consulte as fontes oficiais e o SHA-256 dos arquivos do TSE na Mesa. Cada grupo de dados informa seu estado e a data disponível. O código do projeto usa Apache-2.0; correções podem ser acompanhadas por issue ou pull request.</p>
          <Link className="mt-3 inline-block underline" href="/imprensa/mesa#dicionario">Ver estados e dicionário de campos</Link>
        </section>

        <section id="pautas" className={styles.salaSection} aria-labelledby="pautas-title">
          <h2 id="pautas-title" className={styles.salaTitle}>Recortes para apuração</h2>
          <p className="mt-3">Abra a Mesa e aplique os filtros. Os links não antecipam achados.</p>
          <div className="mt-3 flex flex-wrap gap-4"><Link className="underline" href="/imprensa/mesa?cargo=Presidente">Presidência</Link><Link className="underline" href="/imprensa/mesa?cargo=Governador">Governos estaduais</Link>{senateEnabled ? <Link className="underline" href="/imprensa/mesa?cargo=Senador">Senado</Link> : null}</div>
        </section>

        <section id="pacotes-uf" className={styles.salaSection} aria-labelledby="pacotes-uf-title">
          <h2 id="pacotes-uf-title" className={styles.salaTitle}>Pacotes por UF</h2>
          <p className="mt-3">Abra um recorte estadual com candidatos por cargo, fichas, chapas, mudanças verificadas e lacunas.</p>
          <nav className={styles.ufLinks} aria-label="Pacotes de imprensa por UF">
            {IMPRENSA_UFS.map((uf) => <Link key={uf} href={`/imprensa/uf/${uf.toLowerCase()}`}>{uf}</Link>)}
          </nav>
        </section>

        <section id="ferramentas" className={styles.salaSection} aria-labelledby="ferramentas-title">
          <h2 id="ferramentas-title" className={styles.salaTitle}>Ferramentas</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <li><Link className="underline" href="/imprensa/mesa">Mesa de apuração</Link></li>
            <li><a className="underline" href="/api/imprensa/export?format=csv">Baixar CSV</a> · <a className="underline" href="/api/imprensa/export?format=json">Baixar JSON</a></li>
            <li><Link className="underline" href="/embed">Embed</Link> · <Link className="underline" href="/imprensa/mesa#linhas">Card público nas fichas</Link></li>
            <li><Link className="underline" href="/comparar">Comparador</Link> · <Link className="underline" href={alertsEnabled ? "/imprensa/mesa#alertas" : "/imprensa/atualizacoes"}>Alertas por cargo e UF</Link></li>
            <li><Link className="underline" href="/imprensa/mesa#linhas">Como citar</Link></li>
            <li>Cota parlamentar por ano: <a className="underline" href="/api/imprensa/export/gastos?format=csv">CSV</a> · <a className="underline" href="/api/imprensa/export/gastos?format=json">JSON</a></li>
            <li><Link className="underline" href="/dados-abertos">Cadastro de candidatos em dados abertos</Link></li>
          </ul>
        </section>

        <section id="kit" className={styles.salaSection} aria-labelledby="kit-title"><h2 id="kit-title" className={styles.salaTitle}>Kit de imprensa</h2><p className="mt-3">Textos, capturas da Sala, PDF e respostas para perguntas frequentes.</p><Link className="mt-3 inline-block underline" href="/imprensa/kit">Abrir kit de imprensa</Link></section>
        <section id="contato" className={styles.salaSection} aria-labelledby="contato-title"><h2 id="contato-title" className={styles.salaTitle}>Contato</h2><p className="mt-3">Para dúvidas e correções: <a className="underline" href="mailto:contato@puxaficha.com.br">contato@puxaficha.com.br</a>.</p></section>
        <section id="perguntas" className={styles.salaSection} aria-labelledby="perguntas-title"><h2 id="perguntas-title" className={styles.salaTitle}>Perguntas frequentes</h2><p className="mt-3">Quem faz e quem financia o projeto? Consulte as informações em <Link className="underline" href="/sobre">Sobre</Link>.</p></section>
        <section id="atualizacoes" className={styles.salaSection} aria-labelledby="atualizacoes-title"><h2 id="atualizacoes-title" className={styles.salaTitle}>Atualizações e frescor</h2><p className="mt-3"><Link className="underline" href="/imprensa/atualizacoes">Atualizações verificadas</Link> · <Link className="underline" href="/imprensa/frescor">Frescor das fontes</Link></p></section>
      </div>
      </div>
    </main>
  )
}

function CountCard({ title, values, labels = "state" }: { title: string; values: Record<string, number>; labels?: "cargo" | "state" | "processos" }) {
  return <div className={styles.countCard}><h3>{title}</h3><ul>{Object.entries(values).map(([label, value]) => <li key={label} className="flex justify-between gap-4"><span>{labels === "cargo" ? label : labels === "processos" ? labelProcessState(label) : labelState(label)}</span><strong>{value}</strong></li>)}</ul></div>
}
