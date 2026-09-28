import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Braces,
  Clock,
  Database,
  Download,
  FileText,
  Lightbulb,
  Mail,
  MapPinned,
  Quote,
  RefreshCw,
  Users,
} from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"
import { SalaSearchTrigger } from "@/components/imprensa/SalaSearchTrigger"
import { getCandidatosComResumoResource } from "@/lib/api"
import { getHomeHeroMetrics, getHomeHeroUfCount } from "@/lib/home-hero-metrics"
import { getImprensaDatasetCached, type ImprensaPageDataset } from "@/lib/imprensa-cache"
import { normalizeImprensaFilters } from "@/lib/imprensa-data"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { IMPRENSA_UFS, labelProcessState, labelState } from "@/lib/imprensa-uf-pack"
import { isSenadoEnabled } from "@/lib/senado-feature"
import styles from "./sala.module.css"

// cspell:ignore numeros confianca

export const metadata: Metadata = {
  title: "Imprensa | Puxa Ficha",
  description: "Informações, fontes, recortes e ferramentas públicas do Puxa Ficha para apuração jornalística.",
  alternates: { canonical: "/imprensa" },
}

const aviso = "Confira os dados na fonte original antes de publicar."
const PREVIEW_ROWS = 3

type CountRow = ImprensaPageDataset["rows"][number]

function counts(rows: CountRow[]) {
  const by = (subset: CountRow[], pick: (row: CountRow) => string) => Object.fromEntries(
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

function formatUtc(value: string | null): string {
  if (!value) return "sem data"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) return "sem data"
  return `${parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" })} UTC`
}

async function loadBase(): Promise<{ total: number | null; ufs: number | null }> {
  try {
    const resource = await getCandidatosComResumoResource()
    return {
      total: getHomeHeroMetrics(resource.data, resource.sourceStatus).totalCandidatos,
      ufs: getHomeHeroUfCount(resource.data, resource.sourceStatus),
    }
  } catch {
    // Uma falha de consulta não deve parecer uma contagem igual a zero.
    return { total: null, ufs: null }
  }
}

export default async function ImprensaSala() {
  const alertsEnabled = isAlertsEmailFeatureEnabled()
  const senateEnabled = isSenadoEnabled()
  const [base, datasetResult] = await Promise.all([
    loadBase(),
    getImprensaDatasetCached(normalizeImprensaFilters({})).then(
      (dataset) => dataset,
      () => null,
    ),
  ])
  const dataset: ImprensaPageDataset | null = datasetResult
  const summary = dataset ? counts(dataset.rows) : null
  const sortedRows = dataset ? [...dataset.rows].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : []
  const previewRows = sortedRows.slice(0, PREVIEW_ROWS)
  const moreRows = sortedRows.slice(PREVIEW_ROWS)
  const cargoOptions = dataset?.availableCargos ?? []
  const ufOptions = dataset?.availableUfs?.length ? dataset.availableUfs : IMPRENSA_UFS
  const alertsHref = alertsEnabled ? "/imprensa/mesa#alertas" : "/imprensa/atualizacoes"
  const escopoBase = senateEnabled
    ? "Titulares à Presidência, aos governos estaduais e ao Senado, como na página inicial."
    : "Titulares à Presidência e aos governos estaduais, como na página inicial."

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <Image src="/images/hero-dossie.webp" alt="" fill sizes="100vw" loading="eager" fetchPriority="high" className={styles.heroImage} />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Eleições 2026 · Fontes públicas</p>
          <h1 className={styles.heroTitle}>Sala de imprensa</h1>
          <p className={styles.heroCopy}>Fontes, recortes e ferramentas para conferir cada dado na origem.</p>
          <SlashDivider className={styles.heroDivider} color="text-white" />
          <div className={styles.heroActions}>
            <nav aria-label="Tarefas de imprensa" className={styles.heroButtons}>
              <Link className={styles.pill} href="/imprensa/mesa#linhas">Achar fonte de um candidato <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
              <Link className={styles.pillGhost} href="/imprensa/mesa">Abrir Mesa de apuração <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
            </nav>
            <div role="note" className={styles.heroNotice}>
              <strong>{aviso}</strong>
              <span>Processo listado não equivale a condenação.</span><br />
              <span>Falta de dado não significa zero.</span>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <section id="numeros" className={styles.section} aria-labelledby="numeros-title">
          <SectionHead num="01" id="numeros-title">Retrato da base</SectionHead>
          <div className={styles.statGrid}>
            <div className={`${styles.card} ${styles.statCard}`}>
              {base.total === null ? <p role="status" className={styles.statUnavailable}>Contagem indisponível</p> : base.total === 0 ? <p role="status" className={styles.statUnavailable}>Nenhuma candidatura publicada neste recorte agora</p> : <p className={styles.statValue}>{base.total}</p>}
              <p className={styles.statLabel}>Candidaturas mapeadas</p>
              <p className={styles.statScope}>{escopoBase}{base.total === null ? " Uma falha de consulta não representa zero." : base.total === 0 ? " A ausência de linhas publicadas não significa ausência de candidaturas." : ""}</p>
            </div>
            <div className={`${styles.card} ${styles.statCard}`}>
              {base.ufs === null ? <p role="status" className={styles.statUnavailable}>Contagem indisponível</p> : base.ufs === 0 ? <p role="status" className={styles.statUnavailable}>Nenhuma UF com candidatura publicada agora</p> : <p className={styles.statValue}>{base.ufs}</p>}
              <p className={styles.statLabel}>UFs</p>
              <p className={styles.statScope}>Unidades da federação com candidaturas estaduais nesse mesmo recorte.</p>
            </div>
          </div>
          <p className={styles.lead}>
            {summary
              ? <>A Mesa de apuração e os arquivos CSV e JSON trazem {dataset!.rows.length} {dataset!.rows.length === 1 ? "linha pública" : "linhas públicas"}, com os estados de cada dado (consulta em {formatUtc(dataset!.generatedAt)}). Esse é o total exportável da Mesa, contado na própria Mesa; o card acima conta as candidaturas mapeadas no site.</>
              : <>A contagem da Mesa está temporariamente indisponível. Uma falha de consulta não representa zero.</>}
          </p>

          <section id="pautas" aria-labelledby="pautas-title">
            <h3 id="pautas-title" className={styles.subhead}>Recortes rápidos</h3>
            <div className={styles.cutGrid}>
              <CutCard href="/imprensa/mesa?cargo=Presidente" icon={<FileText className={styles.icon} aria-hidden="true" />} title="Presidência" text="Candidaturas, dados e fontes na Mesa." />
              <CutCard href="/imprensa/mesa?cargo=Governador" icon={<BarChart3 className={styles.icon} aria-hidden="true" />} title="Governadores" text="Recorte da Mesa com filtro por estado." />
              {senateEnabled ? <CutCard href="/senado" icon={<Users className={styles.icon} aria-hidden="true" />} title="Senadores" text="Candidaturas ao Senado por estado." /> : null}
              <CutCard href="#pacotes-uf" icon={<MapPinned className={styles.icon} aria-hidden="true" />} title="Pacotes por UF" text="Fichas, chapas e lacunas por estado." />
            </div>
          </section>

          <section id="pacotes-uf" aria-labelledby="pacotes-uf-title">
            <h3 id="pacotes-uf-title" className={styles.subhead}>Pacotes por UF</h3>
            <p className={styles.lead}>Cada pacote reúne candidatos por cargo, fichas, chapas, mudanças verificadas e lacunas do estado.</p>
            <nav className={styles.ufLinks} aria-label="Pacotes de imprensa por UF">
              {IMPRENSA_UFS.map((uf) => <Link key={uf} href={`/imprensa/uf/${uf.toLowerCase()}`}>{uf}</Link>)}
            </nav>
          </section>
        </section>

        <SlashDivider />

        <section id="mesa-previa" className={styles.section} aria-labelledby="mesa-previa-title">
          <SectionHead num="02" id="mesa-previa-title">Mesa de apuração</SectionHead>
          <div className={styles.mesaGrid}>
            <div className={`${styles.card} ${styles.panel}`}>
              <div className={styles.searchRow}>
                <SalaSearchTrigger className={styles.searchTrigger} />
                <form className={styles.filterForm} action="/imprensa/mesa" method="get" aria-label="Filtrar a Mesa por cargo e UF">
                  <label htmlFor="sala-cargo">Cargo</label>
                  <select id="sala-cargo" name="cargo" defaultValue="">
                    <option value="">Cargo</option>
                    {cargoOptions.map((cargo) => <option key={cargo} value={cargo}>{cargo}</option>)}
                  </select>
                  <label htmlFor="sala-uf">UF</label>
                  <select id="sala-uf" name="uf" defaultValue="">
                    <option value="">UF</option>
                    {ufOptions.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                  <button className={styles.filterButton} type="submit">Filtrar</button>
                </form>
              </div>
              {!dataset ? (
                <div role="alert" className={styles.panelNotice}>
                  <strong>Prévia indisponível</strong>
                  <p>Não foi possível consultar a Mesa agora. Uma falha de consulta não é uma lista vazia.</p>
                </div>
              ) : previewRows.length === 0 ? (
                <div role="status" className={styles.panelNotice}>
                  <strong>Nenhuma linha pública no momento</strong>
                  <p>A ausência de linhas não significa ausência de candidatos no universo eleitoral.</p>
                </div>
              ) : (
                <>
                  <p id="mesa-previa-label" className={styles.previewLabel}>Primeiras {previewRows.length} de {dataset.rows.length} linhas públicas, em ordem alfabética</p>
                  <ul className={styles.previewList} aria-labelledby="mesa-previa-label">
                    {previewRows.map((row) => <PreviewRow key={row.slug} row={row} />)}
                  </ul>
                  {moreRows.length > 0 ? (
                    <details className={styles.moreRows}>
                      <summary>
                        <span className={styles.whenClosed}>Ver todas as {dataset.rows.length} linhas</span>
                        <span className={styles.whenOpen}>Recolher lista</span>
                      </summary>
                      <ul className={`${styles.previewList} ${styles.scrollList}`} aria-label={`Demais ${moreRows.length} linhas públicas da Mesa, em ordem alfabética`} tabIndex={0}>
                        {moreRows.map((row) => <PreviewRow key={row.slug} row={row} />)}
                      </ul>
                    </details>
                  ) : null}
                  <p className={styles.previewCount}>As fontes de cada linha ficam na Mesa completa.</p>
                </>
              )}
            </div>
            <div className={`${styles.card} ${styles.panel}`}>
              <h3 className={styles.exportTitle}>Exporte e cite</h3>
              <nav aria-label="Exportar e citar">
                <ul className={styles.exportList}>
                  <li><a href="/api/imprensa/export?format=csv" download><FileText aria-hidden="true" /> CSV <ArrowRight aria-hidden="true" className={styles.arrow} /></a></li>
                  <li><a href="/api/imprensa/export?format=json" download><Braces aria-hidden="true" /> JSON <ArrowRight aria-hidden="true" className={styles.arrow} /></a></li>
                  <li><Link href="/imprensa/mesa#linhas"><Quote aria-hidden="true" /> Como citar <ArrowRight aria-hidden="true" className={styles.arrow} /></Link></li>
                  <li><Link href="/imprensa/mesa#dicionario"><BookOpen aria-hidden="true" /> Dicionário de campos <ArrowRight aria-hidden="true" className={styles.arrow} /></Link></li>
                </ul>
              </nav>
              <Link className={styles.primaryButton} href="/imprensa/mesa">Abrir Mesa completa <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
            </div>
          </div>
        </section>

        <SlashDivider />

        <section id="o-que-e" className={styles.section} aria-labelledby="o-que-e-title">
          <SectionHead num="03" id="o-que-e-title">Como funciona o Puxa Ficha</SectionHead>
          <div className={styles.explainGrid}>
            <ExplainCard icon={<Lightbulb className={styles.icon} aria-hidden="true" />} title="O que é" text="Consulta pública que organiza informações sobre candidaturas. Não recomenda voto." href="/sobre" link="Conhecer o projeto" />
            <ExplainCard icon={<Database className={styles.icon} aria-hidden="true" />} title="Fontes" text="TSE, Câmara e Senado estão entre as fontes consultadas. Cada dado aponta sua origem." href="/metodologia" link="Metodologia e fontes" />
            <ExplainCard icon={<Clock className={styles.icon} aria-hidden="true" />} title="Atualização" text="As fontes têm ritmos diferentes. Consulte a data e os limites de cada coleta." href="/imprensa/frescor" link="Frescor das fontes" />
          </div>
        </section>

        <SlashDivider />

        <section id="confianca" className={styles.section} aria-labelledby="confianca-title">
          <SectionHead num="04" id="confianca-title">Entenda os dados</SectionHead>
          <div className={styles.miniGrid}>
            <MiniCard href="/imprensa/mesa#dicionario" icon={<Database className={styles.icon} aria-hidden="true" />} title="Estados do dado" text="O que cada estado quer dizer e de onde vem." />
            <div id="atualizacoes" className={styles.relative}>
              <MiniCard href="/imprensa/atualizacoes" icon={<RefreshCw className={styles.icon} aria-hidden="true" />} title="Atualizações verificadas" text="Mudanças nas fichas conferidas com a fonte." />
            </div>
            <MiniCard href="/imprensa/frescor" icon={<Clock className={styles.icon} aria-hidden="true" />} title="Frescor das fontes" text="Quando cada fonte foi consultada." />
          </div>
          <p className={styles.lead}>Consulte as fontes oficiais e o SHA-256 dos arquivos do TSE na Mesa. Cada grupo de dados informa seu estado e a data disponível. O código do projeto usa Apache-2.0; correções podem ser acompanhadas por issue ou pull request.</p>
          <details className={`${styles.card} ${styles.countsDetails}`}>
            <summary>Contagens da Mesa por cargo e estado do dado</summary>
            {summary ? <>
              <p>{dataset!.rows.length} linhas públicas · {summary.ufs} UFs com registros · consulta em {formatUtc(dataset!.generatedAt)}</p>
              <div className={styles.statsGrid}>
                <CountCard title="Candidatos por cargo" values={summary.cargos} labels="cargo" />
                <CountCard title="Processos por estado do dado" values={summary.processos} labels="processos" />
                <CountCard title="Sites por estado do dado" values={summary.sites} />
                <CountCard title="Vice (Presidente e Governador)" values={summary.vice} />
                {Object.keys(summary.suplentes).length > 0 && <CountCard title="Suplentes (Senador)" values={summary.suplentes} />}
              </div>
              <p>Os candidatos foram buscados pelo nome no Diário de Justiça Eletrônico Nacional. Quando o nome aparece sem um segundo dado oficial que confirme a pessoa, o processo não é publicado, para não atribuir a alguém o processo de um homônimo.</p>
              {summary.processosComSelo > 0 && <p>{summary.processosComSelo} candidato{summary.processosComSelo === 1 ? " tem" : "s têm"} processo com fonte oficial em confirmação: o registro aparece na ficha com esse aviso e ainda falta localizar a página do próprio tribunal.</p>}
            </> : <p role="status">Contagens temporariamente indisponíveis. Uma falha de consulta não representa zero.</p>}
          </details>

          <div className={styles.wideGrid}>
            <div id="kit" className={`${styles.card} ${styles.wideCard} ${styles.relative}`}>
              <span className={styles.iconBox}><Download className={styles.arrow} aria-hidden="true" /></span>
              <div>
                <h3><Link className={styles.stretchLink} href="/imprensa/kit">Kit de imprensa</Link></h3>
                <p>Textos, capturas da Sala, PDF e perguntas frequentes.</p>
              </div>
              <ArrowRight aria-hidden="true" className={styles.arrow} />
            </div>
            <div id="contato" className={`${styles.card} ${styles.wideCard}`}>
              <span className={styles.iconBox}><Mail className={styles.arrow} aria-hidden="true" /></span>
              <div>
                <h3>Contato</h3>
                <p><a className={styles.inlineLink} href="mailto:contato@puxaficha.com.br">contato@puxaficha.com.br</a></p>
                <p>Dúvidas e correções.</p>
              </div>
              <ArrowRight aria-hidden="true" className={styles.arrow} />
            </div>
          </div>
        </section>
      </div>

      <section id="ferramentas" className={styles.toolsBand} aria-labelledby="ferramentas-title">
        <div className={styles.toolsInner}>
          <h2 id="ferramentas-title" className={styles.toolsTitle}>Ferramentas</h2>
          <ul className={styles.toolsList}>
            <li><Link href="/embed">Embed</Link> · <Link href="/imprensa/mesa#linhas">Card público nas fichas</Link></li>
            <li><Link href="/comparar">Comparador</Link> · <Link href={alertsHref}>Alertas por cargo e UF</Link></li>
            <li>Cota parlamentar por ano: <a href="/api/imprensa/export/gastos?format=csv">CSV</a> · <a href="/api/imprensa/export/gastos?format=json">JSON</a></li>
            <li><Link href="/dados-abertos">Cadastro de candidatos em dados abertos</Link></li>
          </ul>
          <p id="perguntas" className={styles.faq}>Perguntas frequentes: quem faz e quem financia o projeto? Consulte as informações em <Link href="/sobre">Sobre</Link>.</p>
        </div>
      </section>
    </main>
  )
}

function SectionHead({ num, id, children }: { num: string; id: string; children: React.ReactNode }) {
  return <div className={styles.sectionHead}><span className={styles.sectionNum} aria-hidden="true">{num}</span><h2 id={id} className={styles.sectionTitle}>{children}</h2></div>
}

function PreviewRow({ row }: { row: CountRow }) {
  return (
    <li>
      <Link href={row.fichaUrl}>
        <span><strong>{row.nome}</strong> <span className={styles.previewMeta}>· {row.cargo}{row.uf ? ` · ${row.uf}` : ""}</span></span>
        <ArrowRight aria-hidden="true" className={styles.arrow} />
      </Link>
    </li>
  )
}

function CutCard({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return <Link href={href} className={`${styles.card} ${styles.cutCard}`}>{icon}<span><strong>{title}</strong><span>{text}</span></span><ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
}

function MiniCard({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return <Link href={href} className={`${styles.card} ${styles.miniCard}`}>{icon}<span><strong>{title}</strong><span>{text}</span></span><ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
}

function ExplainCard({ icon, title, text, href, link }: { icon: React.ReactNode; title: string; text: string; href: string; link: string }) {
  return (
    <article className={`${styles.card} ${styles.explainCard}`}>
      {icon}
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
        <Link href={href}>{link} <ArrowUpRight aria-hidden="true" className={styles.arrow} /></Link>
      </div>
    </article>
  )
}

function CountCard({ title, values, labels = "state" }: { title: string; values: Record<string, number>; labels?: "cargo" | "state" | "processos" }) {
  return <div className={styles.countCard}><h3>{title}</h3><ul>{Object.entries(values).map(([label, value]) => <li key={label}><span>{labels === "cargo" ? label : labels === "processos" ? labelProcessState(label) : labelState(label)}</span><strong>{value}</strong></li>)}</ul></div>
}
