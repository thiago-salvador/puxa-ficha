import { safeHref } from "@/lib/utils"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"
import { ImprensaFacts } from "@/components/imprensa/ImprensaFacts"
import { ImprensaSubnav } from "@/components/imprensa/ImprensaSubnav"
import { SalaSearchTrigger } from "@/components/imprensa/SalaSearchTrigger"
import { TrustFooter } from "@/components/imprensa/TrustFooter"
import { SalaSectionsNav, type SalaSectionLive } from "@/components/imprensa/sala/SalaSectionsNav"
import { buildSalaPromise2Turno, buildSalaUpdates, countSalaRecortes } from "@/components/imprensa/sala/sala-model"
import { formatDisplayName } from "@/lib/display-name"
import { rotuloUfs, segundoTurnoImprensa, separarPorTurno, statusUfImprensa, type Finalistas } from "@/lib/imprensa-2turno"
import { formatarPercentual } from "@/lib/resultados-1turno"
import { formatarData2Turno } from "@/lib/segundo-turno-2026"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { getImprensaAtualizacoes } from "@/lib/imprensa-atualizacoes"
import { getImprensaDatasetCached, type ImprensaPageDataset, type ImprensaPageRow } from "@/lib/imprensa-cache"
import { normalizeImprensaFilters } from "@/lib/imprensa-data"
import { computeImprensaFacts } from "@/lib/imprensa-facts"
import { IMPRENSA_STATE_CHOOSER_ID, imprensaHref, imprensaUfPath } from "@/lib/imprensa-nav"
import { getImprensaUfName, IMPRENSA_UFS, isImprensaUf } from "@/lib/imprensa-uf-pack"
import styles from "./sala.module.css"

// cspell:words numeros confianca atualizacoes presidencia homonimos

export const metadata: Metadata = {
  title: "Imprensa | Puxa Ficha",
  description: "Sala de imprensa do 2º turno de 2026: quem segue na disputa, fatos dos finalistas com fonte oficial, pacotes por estado, mudanças verificadas no TSE e o arquivo do 1º turno.",
  alternates: { canonical: "/imprensa" },
}

const NUMBER = new Intl.NumberFormat("pt-BR")

function candidatos(total: number): string {
  return `${NUMBER.format(total)} ${total === 1 ? "candidato" : "candidatos"}`
}

function finalistas(total: number): string {
  return `${NUMBER.format(total)} ${total === 1 ? "finalista" : "finalistas"}`
}

const SEGUNDO_TURNO = { turno: 2 } as const

export default async function ImprensaSala() {
  const alertsEnabled = isAlertsEmailFeatureEnabled()
  const segundo = segundoTurnoImprensa()
  const [dataset, atualizacoes] = await Promise.all([
    getImprensaDatasetCached(normalizeImprensaFilters({})).then(
      (value): ImprensaPageDataset | null => value,
      () => null,
    ),
    getImprensaAtualizacoes(),
  ])
  const allRows = dataset?.rows ?? []
  // Contagens saem das linhas do dataset (as mesmas da Mesa com ?turno=2), nunca do snapshot.
  const rows = separarPorTurno(allRows, segundo.slugs).segundoTurno
  const rowBySlug = new Map(rows.map((row) => [row.slug, row]))
  const facts = dataset ? computeImprensaFacts(rows) : null
  const recortes = dataset ? countSalaRecortes(rows) : null
  const updates = atualizacoes.status === "available" ? buildSalaUpdates(atualizacoes.updates, allRows) : []
  const ufsGovernador = segundo.duelos.map((duelo) => duelo.uf)
  const promise = buildSalaPromise2Turno(dataset ? rows.length : null, segundo.presidencia !== null, ufsGovernador)
  const updatesTotal = atualizacoes.status === "available" && typeof atualizacoes.total === "number" ? atualizacoes.total : null
  const sectionsLive: SalaSectionLive = {
    estado: `${IMPRENSA_UFS.length} pacotes; governador no 2º turno em ${rotuloUfs(ufsGovernador)}`,
    ...(recortes ? { presidencia: finalistas(recortes.presidencia) } : {}),
    ...(dataset ? { mesa: `${finalistas(rows.length)} com linha pública`, arquivo: `${candidatos(allRows.length)} no 1º turno` } : {}),
    ...(updatesTotal !== null && updatesTotal > 0
      ? { atualizacoes: `${NUMBER.format(updatesTotal)} ${updatesTotal === 1 ? "mudança" : "mudanças"}${updates[0] ? `, a última em ${updates[0].dateLabel}` : ""}` }
      : {}),
  }

  return (
    <div className={styles.shell}>
      <ImprensaSubnav current="sala" recorte={SEGUNDO_TURNO} generatedAt={dataset?.generatedAt ?? null} />

      <header className={styles.hero}>
        <Image src="/images/hero-dossie.webp" alt="" fill sizes="100vw" loading="eager" fetchPriority="high" className={styles.heroImage} />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>2º turno · {formatarData2Turno()} · Fontes oficiais</p>
          <h1 className={styles.heroTitle}>Sala de imprensa</h1>
          <p className={styles.heroCopy}>{promise}</p>
          <div className={styles.heroSearch}>
            <SalaSearchTrigger className={styles.searchTrigger} />
          </div>
          <nav aria-label="Tarefas de imprensa" className={styles.heroButtons}>
            <Link className={styles.pill} href="#segundo-turno">Quem está no 2º turno <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
            <Link className={styles.pillGhost} href={`#${IMPRENSA_STATE_CHOOSER_ID}`}>Escolher meu estado <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
            <Link className={styles.pillGhost} href={imprensaHref("/imprensa/mesa", SEGUNDO_TURNO)}>Abrir a Mesa <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
          </nav>
          <SlashDivider className={styles.heroDivider} color="text-white" />
          <div role="note" className={styles.heroNotice}>
            <strong>Confira os dados na fonte original antes de publicar.</strong>
            <span>Processo listado não equivale a condenação. Falta de dado não significa zero.</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <section id="segundo-turno" className={styles.section} aria-labelledby="segundo-turno-title">
          <SectionHead num="01" id="segundo-turno-title">Quem está no 2º turno</SectionHead>
          <p className={styles.lead}>Os finalistas pelo resultado oficial do 1º turno, com a porcentagem dos votos válidos. Cada duelo abre o pacote de imprensa do recorte; o nome abre a ficha.</p>
          {segundo.presidencia ? (
            <article className={styles.duelPresidencia} aria-labelledby="duelo-presidencia">
              <header className={styles.duelHead}>
                <h3 id="duelo-presidencia" className={styles.duelTitle}>Presidência</h3>
                <Link className={styles.duelPack} href={imprensaHref("/imprensa/presidencia")}>Pacote da Presidência <ArrowRight aria-hidden="true" className={styles.arrowSmall} /></Link>
              </header>
              <DuelSides finalistas={segundo.presidencia} rowBySlug={rowBySlug} />
            </article>
          ) : null}
          {segundo.duelos.length > 0 ? (
            <>
              <h3 className={styles.duelGroupTitle}>Governador · {rotuloUfs(ufsGovernador)}</h3>
              <ul className={styles.duelGrid} aria-label="Duelos de governador no 2º turno">
                {segundo.duelos.map((duelo) => {
                  const uf = isImprensaUf(duelo.uf) ? duelo.uf : null
                  return (
                    <li key={duelo.uf} className={styles.duel}>
                      <header className={styles.duelHead}>
                        <h4 className={styles.duelUf}>{duelo.uf}{uf ? <span className={styles.duelUfName}>{getImprensaUfName(uf)}</span> : null}</h4>
                        {uf ? <Link className={styles.duelPack} href={imprensaUfPath(uf)} aria-label={`Pacote de imprensa: ${getImprensaUfName(uf)}`}>Pacote <ArrowRight aria-hidden="true" className={styles.arrowSmall} /></Link> : null}
                      </header>
                      <DuelSides finalistas={duelo.finalistas} rowBySlug={rowBySlug} />
                    </li>
                  )
                })}
              </ul>
            </>
          ) : null}
          <p className={styles.duelSource}>
            Fonte: resultado oficial do 1º turno, TSE. Os votos de cada disputa estão em <Link href="/1o-turno">Resultado do 1º turno</Link>.
            {segundo.governadorEleito.size > 0 ? ` Em ${rotuloUfs([...segundo.governadorEleito.keys()])}, o governo foi decidido no 1º turno; lá, em ${formatarData2Turno()}, o voto é só para presidente.` : ""}
          </p>
        </section>

        <SlashDivider />

        <section id="numeros" className={styles.section} aria-labelledby="numeros-title">
          <SectionHead num="02" id="numeros-title">Nos dados de hoje</SectionHead>
          <p className={styles.lead}>Cada número conta os finalistas a partir de um campo oficial, com o denominador e a ressalva ao lado. O link abre a Mesa no recorte do 2º turno. Os mesmos fatos sobre todos os candidatos estão no <Link className={styles.inlineLink} href={imprensaHref("/imprensa/1o-turno")}>arquivo do 1º turno</Link>.</p>
          <div className={styles.block}>
            {facts
              ? <ImprensaFacts facts={facts} scopeLabel="2º turno" recorte={SEGUNDO_TURNO} linkToMesa />
              : <Unavailable title="Fatos indisponíveis agora">Não foi possível consultar a base da Mesa. Uma falha de consulta não significa zero.</Unavailable>}
          </div>
        </section>

        <SlashDivider />

        <section id={IMPRENSA_STATE_CHOOSER_ID} className={styles.section} aria-labelledby="estados-title">
          <SectionHead num="03" id="estados-title">Escolha seu estado</SectionHead>
          <p className={styles.lead}>Todo o país vota para presidente no 2º turno; {rotuloUfs(ufsGovernador)} {ufsGovernador.length === 1 ? "vota" : "votam"} também para governador. Cada pacote abre com quem segue na disputa e guarda, no fim, o histórico do 1º turno.</p>
          {recortes ? null : <Unavailable title="Contagens indisponíveis agora">Os pacotes continuam abertos. Uma falha de consulta não significa que o estado não tem finalistas.</Unavailable>}
          <ul className={styles.ufGrid} aria-label="Pacotes de imprensa">
            <li className={styles.ufPresidencia}>
              <Link href={imprensaHref("/imprensa/presidencia")} className={styles.ufLink}>
                <span className={styles.ufCode}>Presidência</span>
                <span className={styles.ufName}>Finalistas a presidente</span>
                {recortes ? <span className={styles.ufCount}>{finalistas(recortes.presidencia)}</span> : null}
              </Link>
            </li>
            {IMPRENSA_UFS.map((uf, index) => {
              const status = statusUfImprensa(segundo, uf)
              return (
                <li key={uf} className={status.kind === "segundo_turno" ? styles.ufSegundo : undefined}>
                  <Link href={imprensaUfPath(uf)} className={styles.ufLink}>
                    <span className={styles.ufCode}>{uf}</span>
                    <span className={styles.ufName}>{getImprensaUfName(uf)}</span>
                    <span className={styles.ufStatus}>{status.kind === "segundo_turno" ? "Governador no 2º turno" : status.kind === "eleito_1turno" ? "Governador eleito no 1º turno" : "Só presidente"}</span>
                    {recortes && recortes.ufs[index].total > 0 ? <span className={styles.ufCount}>{finalistas(recortes.ufs[index].total)}</span> : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <SlashDivider />

        <section id="atualizacoes" className={styles.section} aria-labelledby="atualizacoes-title">
          <SectionHead num="04" id="atualizacoes-title">O que mudou no TSE</SectionHead>
          <p className={styles.lead}>Quem teve a candidatura, o partido ou o patrimônio alterado no TSE. A data é a da detecção da mudança, não a do fato. Depois do 1º turno, a conferência diária segue só para as fichas dos finalistas.</p>
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
                    <p className={styles.updateName}>{item.fichaUrl ? <Link href={item.fichaUrl}>{item.name}</Link> : item.name}</p>
                    <p className={styles.updateChange}>{item.change}</p>
                  </div>
                  <p className={styles.updateLinks}>
                    {item.fichaUrl ? <Link href={item.fichaUrl} aria-label={`Ficha de ${item.name}`}>Ficha</Link> : null}
                    <a href={safeHref(item.sourceUrl) ?? undefined} target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight aria-hidden="true" className={styles.arrowSmall} /></a>
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Link className={styles.moreLink} href={imprensaHref("/imprensa/atualizacoes")}>
            {updatesTotal !== null && updatesTotal > 0
              ? `Ver as ${NUMBER.format(updatesTotal)} mudanças verificadas`
              : "Ver o registro de mudanças"}
            <ArrowRight aria-hidden="true" className={styles.arrow} />
          </Link>
        </section>

        <SlashDivider />

        <section id="arquivo-1turno" className={styles.section} aria-labelledby="arquivo-title">
          <SectionHead num="05" id="arquivo-title">Arquivo do 1º turno</SectionHead>
          <p className={styles.lead}>Os dados de quem saiu da disputa e dos eleitos no 1º turno continuam publicados, com a data da última atualização em cada ficha.</p>
          <ul className={styles.archiveList}>
            <li>
              <Link className={styles.archiveLink} href={imprensaHref("/imprensa/1o-turno")}><strong>Sala do 1º turno</strong><ArrowRight aria-hidden="true" className={styles.arrowSmall} /></Link>
              <span>Fatos e pacotes de todos os candidatos{dataset ? `, ${candidatos(allRows.length)}` : ""}.</span>
            </li>
            <li>
              <Link className={styles.archiveLink} href="/1o-turno"><strong>Resultado oficial</strong><ArrowRight aria-hidden="true" className={styles.arrowSmall} /></Link>
              <span>Votos de cada disputa a presidente, governador e Senado, com a fonte do TSE.</span>
            </li>
            <li>
              <Link className={styles.archiveLink} href={imprensaHref("/imprensa/mesa", { turno: null })}><strong>Mesa com todos os candidatos</strong><ArrowRight aria-hidden="true" className={styles.arrowSmall} /></Link>
              <span>Uma linha por candidato do 1º turno, para ordenar e filtrar.</span>
            </li>
          </ul>
        </section>

        <SlashDivider />

        <section id="nesta-sala" className={styles.section} aria-labelledby="nesta-sala-title">
          <SectionHead num="06" id="nesta-sala-title">Nesta sala</SectionHead>
          <p className={styles.lead}>As outras páginas da seção de imprensa, com o que cada uma traz. Os números são os mesmos que esta página já mostra; sem consulta disponível, o card fica só com a descrição.</p>
          <SalaSectionsNav live={sectionsLive} />
        </section>
      </div>

      <div id="confianca" className={styles.trustWrap}>
        <TrustFooter homonimos={facts ? facts.processos.indeterminado : null} />
      </div>

      <section id="ferramentas" className={styles.toolsBand} aria-labelledby="ferramentas-title">
        <div className={styles.toolsInner}>
          <h2 id="ferramentas-title" className={styles.toolsTitle}>Para a matéria</h2>
          <ul className={styles.toolsList}>
            <li>
              <strong>Finalistas do 2º turno</strong>
              <span>As linhas da Mesa dos finalistas, com o estado de cada dado.</span>
              <span className={styles.toolLinks}>
                <a href="/api/imprensa/export?format=csv&turno=2" download>CSV</a>
                <a href="/api/imprensa/export?format=json&turno=2" download>JSON</a>
              </span>
            </li>
            <li>
              <strong>Todos os candidatos</strong>
              <span>As linhas do 1º turno, inclusive de quem saiu da disputa.</span>
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
            {alertsEnabled ? <Tool title="Alerta por estado" text="Mudanças verificadas do recorte, por email." href="/imprensa/mesa#alertas" /> : null}
            <Tool title="Dados abertos" text="Cadastro de candidatos para baixar." href="/dados-abertos" />
          </ul>
          <p id="quem-faz" className={styles.whoMakes}>
            Quem faz e quem financia o projeto está em <Link href="/sobre">Sobre</Link>. Bio, logo e textos prontos estão no <Link href={imprensaHref("/imprensa/kit")}>Kit de imprensa</Link>.
          </p>
        </div>
      </section>
    </div>
  )
}

/** Os dois lados de um duelo: nome (ficha), partido e % dos válidos no 1º turno. */
function DuelSides({ finalistas: pair, rowBySlug }: { finalistas: Finalistas; rowBySlug: ReadonlyMap<string, ImprensaPageRow> }) {
  return (
    <ol className={styles.duelSides}>
      {pair.map((candidato) => {
        const row = candidato.slug ? rowBySlug.get(candidato.slug) : undefined
        const nome = row?.nome ?? formatDisplayName(candidato.nome_urna)
        const href = row?.fichaUrl ?? (candidato.slug ? `/candidato/${candidato.slug}` : null)
        return (
          <li key={candidato.sq} className={styles.duelSide}>
            <span className={styles.duelName}>{href ? <Link href={href}>{nome}</Link> : nome}</span>
            <span className={styles.duelParty}>{candidato.partido}</span>
            <span className={styles.duelPct}>{formatarPercentual(candidato.percentual_validos)}</span>
          </li>
        )
      })}
    </ol>
  )
}

function SectionHead({ num, id, children }: { num: string; id: string; children: React.ReactNode }) {
  return <div className={styles.sectionHead}><span className={styles.sectionNum} aria-hidden="true">{num}</span><h2 id={id} className={styles.sectionTitle}>{children}</h2></div>
}

function Unavailable({ title, children }: { title: string; children: React.ReactNode }) {
  return <div role="status" className={styles.unavailable}><strong>{title}</strong><p>{children}</p></div>
}

function Tool({ title, text, href }: { title: string; text: string; href: string }) {
  return (
    <li>
      <Link href={href} className={styles.toolLink}><strong>{title}</strong><ArrowRight aria-hidden="true" className={styles.arrowSmall} /></Link>
      <span>{text}</span>
    </li>
  )
}
