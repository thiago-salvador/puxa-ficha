// cspell:words homonimos homonimo presidencia
import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Footer } from "@/components/Footer"
import { NoticePanel } from "@/components/NoticePanel"
import { SlashDivider } from "@/components/SlashDivider"
import { CiteBox } from "@/components/imprensa/CiteBox"
import { DataStateLegend } from "@/components/imprensa/DataStateLegend"
import { ImprensaFacts } from "@/components/imprensa/ImprensaFacts"
import { ImprensaSubnav } from "@/components/imprensa/ImprensaSubnav"
import { TrustFooter } from "@/components/imprensa/TrustFooter"
import shell from "@/components/imprensa/imprensa-shell.module.css"
import type { ImprensaPageDataset } from "@/lib/imprensa-cache"
import { separarPorTurno } from "@/lib/imprensa-2turno"
import { formatarData2Turno } from "@/lib/segundo-turno-2026"
import { computeImprensaFacts } from "@/lib/imprensa-facts"
import { imprensaHref, imprensaUfPath, type ImprensaPath, type ImprensaRecorte } from "@/lib/imprensa-nav"
import {
  IMPRENSA_UFS,
  groupPackRows,
  homonimoNote,
  packCitation,
  packCompareLink,
  packHeadline,
  verifiedUpdatesLabel,
  ufPrepositions,
  type ImprensaUf,
  type RegisteredPoll,
} from "@/lib/imprensa-uf-pack"
import type { ImprensaUfUpdates } from "@/lib/imprensa-uf-updates"
import { formatUpdateValue } from "@/lib/verified-candidate-updates"
import { formatDisplayName } from "@/lib/display-name"
import { formatDate, safeHref } from "@/lib/utils"
import { PackCandidateCard } from "./PackCandidateCard"
import styles from "./pack.module.css"

export type PackScope =
  | { kind: "estado"; uf: ImprensaUf; name: string }
  | { kind: "presidencia" }

export interface PackPollGroup {
  id: string
  title: string
  polls: RegisteredPoll[]
  unavailable: boolean
  chart: { href: string; label: string } | null
}

const GROUP_TITLE: Record<string, string> = {
  Presidente: "Presidência",
  Governador: "Governo do estado",
  Senador: "Senado",
}

const POLLS_VISIBLE = 6
const DATA_2TURNO = formatarData2Turno("curto")

function fieldLabel(field: string): string {
  return field === "patrimonio" ? "Patrimônio" : field === "situacao" ? "Situação da candidatura" : "Partido"
}

function formatDetectedAt(value: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("day")}/${part("month")} às ${part("hour")}:${part("minute")}`
}

function SectionHead({ num, id, children }: { num: number; id: string; children: ReactNode }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionNum} aria-hidden="true">{String(num).padStart(2, "0")}</span>
      <h2 id={id} className={styles.sectionTitle}>{children}</h2>
    </div>
  )
}

function PollRow({ poll }: { poll: RegisteredPoll }) {
  const code = poll.registrationCode
  return (
    <li className={styles.pollItem}>
      <span className={styles.pollInstitute}>{poll.instituto ?? "Instituto não informado"}</span>
      <span className={styles.pollDate}>{poll.publicationDate ? `Divulgada em ${formatDate(poll.publicationDate)}` : "Data de divulgação não informada"}</span>
      <span className={styles.pollReg}>
        {code && poll.registrationUrl
          ? <a href={safeHref(poll.registrationUrl) ?? undefined} target="_blank" rel="noreferrer">Registro {code} no TSE</a>
          : code ? `Registro ${code} no TSE` : "Número de registro não publicado na fonte"}
      </span>
    </li>
  )
}

function PollGroup({ group, emptyText }: { group: PackPollGroup; emptyText: string }) {
  const visible = group.polls.slice(0, POLLS_VISIBLE)
  const rest = group.polls.slice(POLLS_VISIBLE)
  return (
    <div className={styles.pollGroup} data-polls={group.id}>
      <h3 className={styles.subhead}>{group.title}</h3>
      {group.unavailable ? (
        <p className={styles.lead}>Não foi possível carregar as pesquisas agora. Isso não quer dizer que não há pesquisa registrada.</p>
      ) : group.polls.length === 0 ? (
        <p className={styles.lead}>{emptyText}</p>
      ) : (
        <>
          <ul className={styles.pollList}>{visible.map((poll) => <PollRow key={poll.id} poll={poll} />)}</ul>
          {rest.length > 0 && (
            <details className={styles.pollMore}>
              <summary>Ver mais {rest.length} {rest.length === 1 ? "pesquisa" : "pesquisas"}</summary>
              <ul className={styles.pollList}>{rest.map((poll) => <PollRow key={poll.id} poll={poll} />)}</ul>
            </details>
          )}
        </>
      )}
      {group.chart && <p className={styles.lead}><Link className={styles.inlineLink} href={group.chart.href}>{group.chart.label}</Link></p>}
    </div>
  )
}

function TakeLink({ href, title, hint, external = false }: { href: string; title: string; hint: string; external?: boolean }) {
  const content = (
    <>
      <span>{title}<span className={styles.takeHint}>{hint}</span></span>
      <ArrowRight aria-hidden="true" className={styles.arrow} />
    </>
  )
  return <li>{external ? <a href={href}>{content}</a> : <Link href={href}>{content}</Link>}</li>
}

/** Recorte do 2º turno do pacote, calculado pela página a partir do snapshot oficial do 1º turno. */
export interface PackTurno {
  /** Fichas que seguem no 2º turno. */
  slugs: ReadonlySet<string>
  /** Estado cujo governo foi decidido no 1º turno: o eleito. */
  governoDecidido?: { nome: string; partido: string; href: string | null } | null
  /** Eleitos ao Senado no 1º turno, já com partido ("Nome (PARTIDO)"). */
  senadoEleitos?: readonly string[]
  /** Resultado oficial do recorte no 1º turno. */
  resultadoHref: string
}

export interface PackPolls {
  /** Pesquisas com cenário de 2º turno; null omite o bloco. */
  segundoTurno: PackPollGroup[] | null
  /** Pesquisas com cenário de 1º turno, no histórico; null omite o bloco. */
  historico: PackPollGroup[] | null
}

function compareLinksOf(groups: ReturnType<typeof groupPackRows<ImprensaPageDataset["rows"][number]>>) {
  return groups
    .map((group) => ({ cargo: group.cargo, link: packCompareLink(group.cargo, group.rows.map((row) => row.slug)) }))
    .filter((item): item is { cargo: string; link: NonNullable<ReturnType<typeof packCompareLink>> } => item.link !== null)
}

function CandidateGroups({ groups, generatedAt }: { groups: ReturnType<typeof groupPackRows<ImprensaPageDataset["rows"][number]>>; generatedAt: string }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.cargo} data-pack-group={group.cargo}>
          <h3 className={styles.subhead}>{GROUP_TITLE[group.cargo] ?? group.cargo} · <span className={styles.num}>{group.rows.length}</span></h3>
          <div className={styles.cards}>
            {group.rows.map((row) => <PackCandidateCard key={row.slug} row={row} generatedAt={generatedAt} />)}
          </div>
        </div>
      ))}
    </>
  )
}

/**
 * Modelo de página do pacote de imprensa, igual para o estado e para a
 * Presidência. Abre com quem segue no 2º turno (fatos, cards, pesquisas do
 * 2º turno) e guarda no fim o histórico do 1º turno com todos os candidatos.
 */
export function ImprensaPack({
  scope,
  dataset,
  updates,
  polls,
  turno,
  alertsEnabled,
}: {
  scope: PackScope
  dataset: ImprensaPageDataset | null
  updates: ImprensaUfUpdates | null
  polls: PackPolls
  turno: PackTurno
  alertsEnabled: boolean
}) {
  const isEstado = scope.kind === "estado"
  const recorteTodos: ImprensaRecorte = isEstado ? { uf: scope.uf, turno: null } : { cargo: "Presidente", turno: null }
  const recorte2: ImprensaRecorte = { ...recorteTodos, turno: 2 }
  const path: ImprensaPath = isEstado ? imprensaUfPath(scope.uf) : "/imprensa/presidencia"
  const scopeLabel = isEstado ? scope.name : "Presidência"
  const short = isEstado ? scope.uf : "Presidência"
  const de = isEstado ? ufPrepositions(scope.uf).de : "da Presidência"
  const em = isEstado ? ufPrepositions(scope.uf).em : "na Presidência"
  const allRows = dataset?.rows ?? []
  const { segundoTurno: rows, historico } = separarPorTurno(allRows, turno.slugs)
  const facts = computeImprensaFacts(rows)
  const factsTodos = computeImprensaFacts(allRows)
  const groups = groupPackRows(rows)
  const groupsHistorico = groupPackRows(historico)
  const note = homonimoNote(facts.processos.indeterminado, facts.total)
  const exportQuery = isEstado ? `uf=${scope.uf}` : "cargo=Presidente"
  const compareLinks = compareLinksOf(groups)
  const decidido = isEstado ? turno.governoDecidido ?? null : null
  const semSegundoTurno = rows.length === 0
  let section = 0
  const next = () => ++section

  return (
    <div className={styles.shell}>
      <ImprensaSubnav current={isEstado ? "estado" : "presidencia"} recorte={recorte2} generatedAt={dataset?.generatedAt ?? null} />
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>{isEstado ? "Pacote do estado" : "Pacote da Presidência"} · 2º turno</p>
          <h1 className={styles.heroTitle}>{isEstado ? scope.name : "Presidência"}</h1>
          {dataset && (
            <p className={styles.headline} data-pack-headline>
              {semSegundoTurno
                ? decidido ? `Governo decidido no 1º turno: ${decidido.nome} (${decidido.partido}). Em ${DATA_2TURNO}, o voto é só para presidente.` : "Nenhum finalista do 2º turno neste recorte."
                : `${rows.length} ${rows.length === 1 ? "finalista" : "finalistas"} ${isEstado ? "ao governo" : "a presidente"} no 2º turno. No 1º turno: ${packHeadline(factsTodos.porCargo, factsTodos.total).replace(/\.$/, "")}.`}
            </p>
          )}
          <SlashDivider className={styles.heroDivider} color="text-white" />
          <nav aria-label="Pacotes por recorte" className={styles.chooser}>
            <Link href="/imprensa/presidencia" aria-current={isEstado ? undefined : "page"}>Presidência</Link>
            {IMPRENSA_UFS.map((code) => (
              <Link key={code} href={imprensaUfPath(code)} aria-current={isEstado && code === scope.uf ? "page" : undefined}>{code}</Link>
            ))}
          </nav>
        </div>
      </header>

      <div className={`${shell.tokens} ${styles.content}`}>
        {dataset === null ? (
          <section className={styles.section}>
            <NoticePanel tone="caution" eyebrow="Fonte temporariamente indisponível" description="Não foi possível carregar os candidatos deste recorte. Os fatos e a contagem não estão disponíveis neste momento." className="max-w-3xl" />
          </section>
        ) : semSegundoTurno ? (
          <section className={styles.section} aria-labelledby="pack-sem-2turno">
            <SectionHead num={next()} id="pack-sem-2turno">Sem 2º turno {isEstado ? "para governador" : "neste recorte"}</SectionHead>
            <p className={styles.lead}>
              {decidido
                ? <>O governo {de} foi decidido no 1º turno: {decidido.href ? <Link className={styles.inlineLink} href={decidido.href}>{decidido.nome}</Link> : decidido.nome} ({decidido.partido}) venceu com a maioria dos votos válidos. Em {DATA_2TURNO}, o eleitorado {de} vota só para presidente.</>
                : "Nenhum candidato deste recorte segue no 2º turno."}
            </p>
            <p className={styles.lead}><Link className={styles.inlineLink} href="/imprensa/presidencia">Abrir o pacote da Presidência</Link> · <Link className={styles.inlineLink} href={turno.resultadoHref}>Ver o resultado do 1º turno</Link></p>
          </section>
        ) : (
          <>
            <section className={styles.section} aria-labelledby="pack-fatos">
              <SectionHead num={next()} id="pack-fatos">Fatos do 2º turno</SectionHead>
              <ImprensaFacts facts={facts} scopeLabel={`${scopeLabel} · 2º turno`} recorte={recorte2} linkToMesa />
            </section>

            <section className={styles.section} aria-labelledby="pack-candidatos">
              <SectionHead num={next()} id="pack-candidatos">Quem segue na disputa</SectionHead>
              {compareLinks.length > 0 && (
                <div className={styles.compareRow}>
                  {compareLinks.map(({ cargo, link }) => (
                    <Link key={cargo} className={styles.pill} href={link.href} data-compare={cargo}>
                      {link.label} <ArrowRight aria-hidden="true" className={styles.arrow} />
                    </Link>
                  ))}
                </div>
              )}
              {compareLinks.some(({ link }) => link.partial) && <p className={styles.compareNote}>O comparador mostra até 4 nomes por vez. Quando há mais, ele abre com os 4 primeiros em ordem alfabética, e os outros podem ser escolhidos lá.</p>}
              <p className={styles.notice}>Patrimônio é declaração ao TSE, não auditoria, e a variação é nominal, sem correção pela inflação. Processo não é condenação. Cada linha abre o dado na ficha, com a fonte oficial.</p>
              <CandidateGroups groups={groups} generatedAt={dataset.generatedAt} />
              {note && <p className={styles.notice} data-homonimos={facts.processos.indeterminado}>{note}</p>}
            </section>
          </>
        )}

        {polls.segundoTurno !== null && !semSegundoTurno && (
          <section className={styles.section} aria-labelledby="pack-pesquisas">
            <SectionHead num={next()} id="pack-pesquisas">Pesquisas do 2º turno</SectionHead>
            <p className={styles.lead}>Pesquisa eleitoral só pode ser divulgada com registro no TSE. Cada linha traz o instituto, a data de divulgação e o número do registro. Cobertura parcial: esta lista não reúne todas as pesquisas divulgadas.</p>
            {polls.segundoTurno.map((group) => <PollGroup key={group.id} group={group} emptyText="Nenhuma pesquisa de 2º turno publicada no site até agora." />)}
          </section>
        )}

        <section className={styles.section} aria-labelledby="pack-mudancas">
          <SectionHead num={next()} id="pack-mudancas">Mudanças verificadas</SectionHead>
          {updates === null || updates.status === "unavailable" || (updates.total === null && updates.updates.length === 0) ? (
            <NoticePanel tone="caution" eyebrow="Registro temporariamente indisponível" description="Não foi possível consultar as mudanças verificadas deste recorte. Isso não confirma que não houve mudanças." className="max-w-3xl" />
          ) : updates.total === 0 ? (
            <p className={styles.lead}>Nenhuma mudança verificada foi encontrada neste recorte.</p>
          ) : (
            <>
              <p className={`${styles.lead} ${styles.num}`}>{updates.total === null ? `Exibindo ${verifiedUpdatesLabel(updates.updates.length)}; total indisponível.` : `${verifiedUpdatesLabel(updates.total)}.`}{updates.total !== null && updates.total > updates.updates.length ? ` Exibindo os ${updates.updates.length} mais recentes.` : ""}</p>
              <ul className={styles.updates} style={{ marginTop: 16 }}>
                {updates.updates.map((update) => (
                  <li key={update.id} className={styles.update}>
                    <div className={styles.updateHead}><strong>{formatDisplayName(update.candidate_name)}</strong><time dateTime={update.detected_at}>Detectada em {formatDetectedAt(update.detected_at)}</time></div>
                    <p className={styles.updateField}>{fieldLabel(update.field)} · <span className={styles.num}>{update.year}</span></p>
                    <p className={styles.updateValues}>Antes: {formatUpdateValue(update, update.before_value)} · Depois: {formatUpdateValue(update, update.after_value)}</p>
                    <a href={safeHref(update.source_url) ?? undefined} target="_blank" rel="noreferrer" className={styles.updateLink}>Ver fonte oficial</a>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.lead} style={{ marginTop: 14 }}><Link className={styles.inlineLink} href={imprensaHref("/imprensa/atualizacoes", recorteTodos)}>Ver tudo o que mudou {em}</Link></p>
        </section>

        {dataset !== null && (
          <section id="historico-1turno" className={styles.section} aria-labelledby="pack-historico">
            <SectionHead num={next()} id="pack-historico">Histórico do 1º turno</SectionHead>
            <p className={styles.lead}>
              Todos os candidatos {de} no 1º turno, inclusive quem saiu da disputa. Depois do 1º turno, só as fichas dos finalistas continuam sendo atualizadas; cada ficha mostra até quando foi atualizada.
              {turno.senadoEleitos && turno.senadoEleitos.length > 0 ? ` Eleitos ao Senado: ${joinPt(turno.senadoEleitos)}.` : ""}
            </p>
            <p className={styles.lead}><Link className={styles.inlineLink} href={turno.resultadoHref}>Resultado oficial do 1º turno {de}</Link></p>
            <div className={styles.history}>
              <ImprensaFacts facts={factsTodos} scopeLabel={`${scopeLabel} · 1º turno`} recorte={recorteTodos} linkToMesa />
              {historico.length > 0 && (
                <details className={styles.historyCards} open={semSegundoTurno || undefined}>
                  <summary>{semSegundoTurno ? "Candidatos do 1º turno" : isEstado ? "Quem saiu da disputa ou foi eleito no 1º turno" : "Quem saiu da disputa"} · <span className={styles.num}>{historico.length}</span></summary>
                  {compareLinksOf(groupsHistorico).length > 0 && semSegundoTurno && (
                    <div className={styles.compareRow}>
                      {compareLinksOf(groupsHistorico).map(({ cargo, link }) => (
                        <Link key={cargo} className={styles.pill} href={link.href} data-compare={cargo}>
                          {link.label} <ArrowRight aria-hidden="true" className={styles.arrow} />
                        </Link>
                      ))}
                    </div>
                  )}
                  {semSegundoTurno && compareLinksOf(groupsHistorico).some(({ link }) => link.partial) && <p className={styles.compareNote}>O comparador mostra até 4 nomes por vez. Quando há mais, ele abre com os 4 primeiros em ordem alfabética, e os outros podem ser escolhidos lá.</p>}
                  <CandidateGroups groups={groupsHistorico} generatedAt={dataset.generatedAt} />
                </details>
              )}
              {polls.historico !== null && polls.historico.length > 0 && (
                <details className={styles.historyCards}>
                  <summary>Pesquisas do 1º turno</summary>
                  {polls.historico.map((group) => <PollGroup key={group.id} group={group} emptyText="Nenhuma pesquisa publicada no site para este cargo." />)}
                </details>
              )}
            </div>
          </section>
        )}

        <section className={styles.section} aria-labelledby="pack-levar">
          <SectionHead num={next()} id="pack-levar">Levar embora</SectionHead>
          <div className={styles.takeGrid}>
            <ul className={styles.takeList}>
              {!semSegundoTurno && <TakeLink external href={`/api/imprensa/export?format=csv&${exportQuery}&turno=2`} title={`CSV do 2º turno ${de}`} hint="Uma linha por finalista, com a data de geração." />}
              <TakeLink external href={`/api/imprensa/export?format=csv&${exportQuery}`} title={`CSV do 1º turno ${de}`} hint="Todos os candidatos do recorte, com a data de geração." />
              <TakeLink external href={`/api/imprensa/export?format=json&${exportQuery}`} title={`JSON do 1º turno ${de}`} hint="Os mesmos dados, para programas e planilhas." />
              {alertsEnabled ? (
                <TakeLink href={`${imprensaHref("/imprensa/mesa", recorte2)}#alertas`} title={`Alerta por email ${de}`} hint="Cadastro na Mesa, por cargo e UF." />
              ) : (
                <TakeLink href={imprensaHref("/imprensa/atualizacoes", recorteTodos)} title={`O que mudou ${em}`} hint="O alerta por email não está disponível agora." />
              )}
              <TakeLink href={imprensaHref("/imprensa/mesa", semSegundoTurno ? recorteTodos : recorte2)} title={`Abrir a Mesa ${em}`} hint="Tabela com fonte e estado de cada dado." />
            </ul>
            {dataset && (
              <CiteBox
                label="Citar este pacote"
                citation={packCitation({ scopeLabel: isEstado ? `${de.split(" ")[0]} ${scope.name}` : "da Presidência", path, rows: semSegundoTurno ? allRows : rows, generatedAt: dataset.generatedAt })}
              />
            )}
          </div>
        </section>

        <div className={styles.legendWrap}>
          <p className={styles.subhead}>Estado de cada dado · {short}</p>
          <DataStateLegend />
        </div>
      </div>
      <TrustFooter homonimos={dataset ? facts.processos.indeterminado : null} />
      <Footer />
    </div>
  )
}

function joinPt(items: readonly string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`
}
