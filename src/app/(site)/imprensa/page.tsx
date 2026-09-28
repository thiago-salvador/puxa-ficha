import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"
import { ImprensaFacts } from "@/components/imprensa/ImprensaFacts"
import { ImprensaSubnav } from "@/components/imprensa/ImprensaSubnav"
import { SalaSearchTrigger } from "@/components/imprensa/SalaSearchTrigger"
import { TrustFooter } from "@/components/imprensa/TrustFooter"
import { buildSalaPromise, buildSalaUpdates, countSalaRecortes } from "@/components/imprensa/sala/sala-model"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { getImprensaAtualizacoes } from "@/lib/imprensa-atualizacoes"
import { getImprensaDatasetCached, type ImprensaPageDataset } from "@/lib/imprensa-cache"
import { normalizeImprensaFilters } from "@/lib/imprensa-data"
import { computeImprensaFacts } from "@/lib/imprensa-facts"
import { IMPRENSA_STATE_CHOOSER_ID, imprensaHref, imprensaUfPath } from "@/lib/imprensa-nav"
import { getImprensaUfName, IMPRENSA_UFS } from "@/lib/imprensa-uf-pack"
import { isSenadoEnabled } from "@/lib/senado-feature"
import styles from "./sala.module.css"

// cspell:words numeros confianca atualizacoes presidencia homonimos

export const metadata: Metadata = {
  title: "Imprensa | Puxa Ficha",
  description: "Fatos do dia com fonte oficial, pacotes por estado, mudanças verificadas no TSE e ferramentas públicas do Puxa Ficha para apuração jornalística.",
  alternates: { canonical: "/imprensa" },
}

const NUMBER = new Intl.NumberFormat("pt-BR")

function candidatos(total: number): string {
  return `${NUMBER.format(total)} ${total === 1 ? "candidato" : "candidatos"}`
}

export default async function ImprensaSala() {
  const alertsEnabled = isAlertsEmailFeatureEnabled()
  const senateEnabled = isSenadoEnabled()
  const [dataset, atualizacoes] = await Promise.all([
    getImprensaDatasetCached(normalizeImprensaFilters({})).then(
      (value): ImprensaPageDataset | null => value,
      () => null,
    ),
    getImprensaAtualizacoes(),
  ])
  const rows = dataset?.rows ?? []
  const facts = dataset ? computeImprensaFacts(rows) : null
  const recortes = dataset ? countSalaRecortes(rows) : null
  const updates = atualizacoes.status === "available" ? buildSalaUpdates(atualizacoes.updates, rows) : []
  const promiseCargos = dataset
    ? facts!.porCargo.map((item) => item.cargo)
    : senateEnabled ? ["Presidente", "Governador", "Senador"] : ["Presidente", "Governador"]
  const promise = buildSalaPromise(dataset ? rows.length : null, promiseCargos)
  const alerts = alertsEnabled
    ? { href: "/imprensa/mesa#alertas", title: "Alerta por estado", text: "Mudanças verificadas do recorte, por email." }
    : { href: imprensaHref("/imprensa/atualizacoes"), title: "Mudanças verificadas", text: "Registro público do que mudou nas fontes oficiais." }

  return (
    <main className={styles.shell}>
      <ImprensaSubnav current="sala" generatedAt={dataset?.generatedAt ?? null} />

      <header className={styles.hero}>
        <Image src="/images/hero-dossie.webp" alt="" fill sizes="100vw" loading="eager" fetchPriority="high" className={styles.heroImage} />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Eleições 2026 · Fontes oficiais</p>
          <h1 className={styles.heroTitle}>Sala de imprensa</h1>
          <p className={styles.heroCopy}>{promise}</p>
          <div className={styles.heroSearch}>
            <SalaSearchTrigger className={styles.searchTrigger} />
          </div>
          <nav aria-label="Tarefas de imprensa" className={styles.heroButtons}>
            <Link className={styles.pill} href={`#${IMPRENSA_STATE_CHOOSER_ID}`}>Escolher meu estado <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
            <Link className={styles.pillGhost} href={imprensaHref("/imprensa/mesa")}>Abrir a Mesa <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
          </nav>
          <SlashDivider className={styles.heroDivider} color="text-white" />
          <div role="note" className={styles.heroNotice}>
            <strong>Confira os dados na fonte original antes de publicar.</strong>
            <span>Processo listado não equivale a condenação. Falta de dado não significa zero.</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <section id="numeros" className={styles.section} aria-labelledby="numeros-title">
          <SectionHead num="01" id="numeros-title">Nos dados de hoje</SectionHead>
          <p className={styles.lead}>Cada número conta candidatos ou registros a partir de um campo oficial, com o denominador e a ressalva ao lado. O link abre a Mesa já ordenada ou filtrada.</p>
          <div className={styles.block}>
            {facts
              ? <ImprensaFacts facts={facts} scopeLabel="Brasil" linkToMesa />
              : <Unavailable title="Fatos indisponíveis agora">Não foi possível consultar a base da Mesa. Uma falha de consulta não significa zero.</Unavailable>}
          </div>
        </section>

        <SlashDivider />

        <section id={IMPRENSA_STATE_CHOOSER_ID} className={styles.section} aria-labelledby="estados-title">
          <SectionHead num="02" id="estados-title">Escolha seu estado</SectionHead>
          <p className={styles.lead}>Cada pacote reúne os fatos, os candidatos, as chapas e as mudanças daquele recorte. O número é de candidatos com linha pública na Mesa.</p>
          {recortes ? null : <Unavailable title="Contagens indisponíveis agora">Os pacotes continuam abertos. Uma falha de consulta não significa que o estado não tem candidatos.</Unavailable>}
          <ul className={styles.ufGrid} aria-label="Pacotes de imprensa">
            <li className={styles.ufPresidencia}>
              <Link href={imprensaHref("/imprensa/presidencia")} className={styles.ufLink}>
                <span className={styles.ufCode}>Presidência</span>
                <span className={styles.ufName}>Candidatos a presidente, sem UF</span>
                {recortes ? <span className={styles.ufCount}>{candidatos(recortes.presidencia)}</span> : null}
              </Link>
            </li>
            {IMPRENSA_UFS.map((uf, index) => (
              <li key={uf}>
                <Link href={imprensaUfPath(uf)} className={styles.ufLink}>
                  <span className={styles.ufCode}>{uf}</span>
                  <span className={styles.ufName}>{getImprensaUfName(uf)}</span>
                  {recortes ? <span className={styles.ufCount}>{candidatos(recortes.ufs[index].total)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <SlashDivider />

        <section id="atualizacoes" className={styles.section} aria-labelledby="atualizacoes-title">
          <SectionHead num="03" id="atualizacoes-title">O que mudou no TSE</SectionHead>
          <p className={styles.lead}>As mudanças mais recentes conferidas com a fonte oficial. A data é a da detecção da mudança, não a do fato.</p>
          {atualizacoes.status === "unavailable" ? (
            <Unavailable title="Mudanças indisponíveis agora">Não foi possível consultar o registro. Uma falha de consulta não significa que nada mudou.</Unavailable>
          ) : updates.length === 0 ? (
            <p role="status" className={styles.empty}>Nenhuma mudança verificada registrada até agora.</p>
          ) : (
            <ol className={styles.updates} aria-label="Mudanças verificadas mais recentes">
              {updates.map((item) => (
                <li key={item.id} className={styles.update}>
                  <time dateTime={item.detectedAt} className={styles.updateDate}>{item.dateLabel}</time>
                  <div className={styles.updateBody}>
                    {item.context ? <p className={styles.updateContext}>{item.context}</p> : null}
                    <p className={styles.updateChange}>{item.change}</p>
                  </div>
                  <p className={styles.updateLinks}>
                    {item.fichaUrl ? <Link href={item.fichaUrl}>Ficha</Link> : null}
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight aria-hidden="true" className={styles.arrowSmall} /></a>
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Link className={styles.moreLink} href={imprensaHref("/imprensa/atualizacoes")}>
            {atualizacoes.status === "available" && typeof atualizacoes.total === "number" && atualizacoes.total > 0
              ? `Ver as ${NUMBER.format(atualizacoes.total)} mudanças verificadas`
              : "Ver o registro de mudanças"}
            <ArrowRight aria-hidden="true" className={styles.arrow} />
          </Link>
        </section>
      </div>

      <div id="confianca" className={styles.trustWrap}>
        <TrustFooter homonimos={facts ? facts.processos.indeterminado : null} />
      </div>

      <section id="ferramentas" className={styles.toolsBand} aria-labelledby="ferramentas-title">
        <div className={styles.toolsInner}>
          <h2 id="ferramentas-title" className={styles.toolsTitle}>Para a matéria</h2>
          <ul className={styles.toolsList}>
            <Tool title="Mesa de apuração" text="Ordenar, filtrar e abrir cada linha com as fontes." href={imprensaHref("/imprensa/mesa")} />
            <li>
              <strong>CSV e JSON</strong>
              <span>Todas as linhas da Mesa, com o estado de cada dado.</span>
              <span className={styles.toolLinks}>
                <a href="/api/imprensa/export?format=csv" download>CSV</a>
                <a href="/api/imprensa/export?format=json" download>JSON</a>
              </span>
            </li>
            <li>
              <strong>Cota parlamentar por ano</strong>
              <span>Gastos na Câmara e no Senado, por candidato e ano.</span>
              <span className={styles.toolLinks}>
                <a href="/api/imprensa/export/gastos?format=csv" download>CSV</a>
                <a href="/api/imprensa/export/gastos?format=json" download>JSON</a>
              </span>
            </li>
            <Tool title="Embed" text="Ficha ou comparação para colar na matéria." href="/embed" />
            <Tool title="Comparador" text="Candidatos lado a lado, com as mesmas fontes." href="/comparar" />
            <Tool title={alerts.title} text={alerts.text} href={alerts.href} />
            <Tool id="kit" title="Kit de imprensa" text="Textos, logo, capturas, PDF e perguntas frequentes." href={imprensaHref("/imprensa/kit")} />
            <Tool title="Dados abertos" text="Cadastro de candidatos para baixar." href="/dados-abertos" />
          </ul>
          <p id="quem-faz" className={styles.whoMakes}>
            Quem faz e quem financia o projeto está em <Link href="/sobre">Sobre</Link>. Bio, logo e textos prontos estão no <Link href={imprensaHref("/imprensa/kit")}>Kit de imprensa</Link>.
          </p>
        </div>
      </section>
    </main>
  )
}

function SectionHead({ num, id, children }: { num: string; id: string; children: React.ReactNode }) {
  return <div className={styles.sectionHead}><span className={styles.sectionNum} aria-hidden="true">{num}</span><h2 id={id} className={styles.sectionTitle}>{children}</h2></div>
}

function Unavailable({ title, children }: { title: string; children: React.ReactNode }) {
  return <div role="status" className={styles.unavailable}><strong>{title}</strong><p>{children}</p></div>
}

function Tool({ id, title, text, href }: { id?: string; title: string; text: string; href: string }) {
  return (
    <li id={id}>
      <Link href={href} className={styles.toolLink}><strong>{title}</strong><ArrowRight aria-hidden="true" className={styles.arrowSmall} /></Link>
      <span>{text}</span>
    </li>
  )
}
