// cspell:words homonimos homonimo presidencia colinha
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
import { formatDate } from "@/lib/utils"
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
          ? <a href={poll.registrationUrl} target="_blank" rel="noreferrer">Registro {code} no TSE</a>
          : code ? `Registro ${code} no TSE` : "Número de registro não publicado na fonte"}
      </span>
    </li>
  )
}

function PollGroup({ group }: { group: PackPollGroup }) {
  const visible = group.polls.slice(0, POLLS_VISIBLE)
  const rest = group.polls.slice(POLLS_VISIBLE)
  return (
    <div className={styles.pollGroup} data-polls={group.id}>
      <h3 className={styles.subhead}>{group.title}</h3>
      {group.unavailable ? (
        <p className={styles.lead}>Não foi possível carregar as pesquisas agora. Isso não quer dizer que não há pesquisa registrada.</p>
      ) : group.polls.length === 0 ? (
        <p className={styles.lead}>Nenhuma pesquisa publicada no site para este cargo.</p>
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

/**
 * Modelo de página do pacote de imprensa, igual para o estado e para a
 * Presidência: fatos do recorte, cards com dados, pesquisas registradas,
 * mudanças verificadas e o que levar embora.
 */
export function ImprensaPack({
  scope,
  dataset,
  updates,
  polls,
  alertsEnabled,
}: {
  scope: PackScope
  dataset: ImprensaPageDataset | null
  updates: ImprensaUfUpdates | null
  /** null omite a seção (recorte sem fonte de pesquisas no site). */
  polls: PackPollGroup[] | null
  alertsEnabled: boolean
}) {
  const isEstado = scope.kind === "estado"
  const recorte: ImprensaRecorte = isEstado ? { uf: scope.uf } : { cargo: "Presidente" }
  const path: ImprensaPath = isEstado ? imprensaUfPath(scope.uf) : "/imprensa/presidencia"
  const scopeLabel = isEstado ? scope.name : "Presidência"
  const short = isEstado ? scope.uf : "Presidência"
  const de = isEstado ? ufPrepositions(scope.uf).de : "da Presidência"
  const em = isEstado ? ufPrepositions(scope.uf).em : "na Presidência"
  const rows = dataset?.rows ?? []
  const facts = computeImprensaFacts(rows)
  const groups = groupPackRows(rows)
  const note = homonimoNote(facts.processos.indeterminado, facts.total)
  const exportQuery = isEstado ? `uf=${scope.uf}` : "cargo=Presidente"
  const compareLinks = groups
    .map((group) => ({ cargo: group.cargo, link: packCompareLink(group.cargo, group.rows.map((row) => row.slug)) }))
    .filter((item): item is { cargo: string; link: NonNullable<ReturnType<typeof packCompareLink>> } => item.link !== null)
  let section = 0
  const next = () => ++section

  return (
    <div className={styles.shell}>
      <ImprensaSubnav current={isEstado ? "estado" : "presidencia"} recorte={recorte} generatedAt={dataset?.generatedAt ?? null} />
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>{isEstado ? "Pacote do estado" : "Pacote da Presidência"}</p>
          <h1 className={styles.heroTitle}>{isEstado ? scope.name : "Presidência"}</h1>
          {dataset && <p className={styles.headline} data-pack-headline>{packHeadline(facts.porCargo, facts.total)}</p>}
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
        ) : (
          <>
            <section className={styles.section} aria-labelledby="pack-fatos">
              <SectionHead num={next()} id="pack-fatos">Fatos {de}</SectionHead>
              <ImprensaFacts facts={facts} scopeLabel={scopeLabel} recorte={recorte} linkToMesa />
            </section>

            <section className={styles.section} aria-labelledby="pack-candidatos">
              <SectionHead num={next()} id="pack-candidatos">Candidatos</SectionHead>
              {rows.length === 0 ? (
                <p className={styles.lead}>Não há candidatos publicados neste recorte no conjunto consultado.</p>
              ) : (
                <>
                  {compareLinks.length > 0 && (
                    <>
                      <div className={styles.compareRow}>
                        {compareLinks.map(({ cargo, link }) => (
                          <Link key={cargo} className={styles.pill} href={link.href} data-compare={cargo}>
                            {link.label} <ArrowRight aria-hidden="true" className={styles.arrow} />
                          </Link>
                        ))}
                      </div>
                      {compareLinks.some(({ link }) => link.partial) && (
                        <p className={styles.compareNote}>O comparador mostra até 4 nomes por vez. Quando há mais, ele abre com os 4 primeiros em ordem alfabética, e os outros podem ser escolhidos lá.</p>
                      )}
                    </>
                  )}
                  <p className={styles.notice}>Patrimônio é declaração ao TSE, não auditoria, e a variação é nominal, sem correção pela inflação. Processo não é condenação. Cada linha abre o dado na ficha, com a fonte oficial.</p>
                  {groups.map((group) => (
                    <div key={group.cargo} data-pack-group={group.cargo}>
                      <h3 className={styles.subhead}>{GROUP_TITLE[group.cargo] ?? group.cargo} · <span className={styles.num}>{group.rows.length}</span></h3>
                      <div className={styles.cards}>
                        {group.rows.map((row) => <PackCandidateCard key={row.slug} row={row} generatedAt={dataset.generatedAt} />)}
                      </div>
                    </div>
                  ))}
                  {note && <p className={styles.notice} data-homonimos={facts.processos.indeterminado}>{note}</p>}
                </>
              )}
            </section>
          </>
        )}

        {polls !== null && (
          <section className={styles.section} aria-labelledby="pack-pesquisas">
            <SectionHead num={next()} id="pack-pesquisas">Pesquisas registradas</SectionHead>
            <p className={styles.lead}>Pesquisa eleitoral só pode ser divulgada com registro no TSE. Cada linha traz o instituto, a data de divulgação e o número do registro.</p>
            <p className={styles.lead}>Cobertura parcial: esta lista não reúne todas as pesquisas divulgadas.</p>
            {polls.map((group) => <PollGroup key={group.id} group={group} />)}
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
                    <a href={update.source_url} target="_blank" rel="noreferrer" className={styles.updateLink}>Ver fonte oficial</a>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.lead} style={{ marginTop: 14 }}><Link className={styles.inlineLink} href={imprensaHref("/imprensa/atualizacoes", recorte)}>Ver tudo o que mudou {em}</Link></p>
        </section>

        <section className={styles.section} aria-labelledby="pack-levar">
          <SectionHead num={next()} id="pack-levar">Levar embora</SectionHead>
          <div className={styles.takeGrid}>
            <ul className={styles.takeList}>
              <TakeLink external href={`/api/imprensa/export?format=csv&${exportQuery}`} title={`CSV ${de}`} hint="Uma linha por candidato, com a data de geração." />
              <TakeLink external href={`/api/imprensa/export?format=json&${exportQuery}`} title={`JSON ${de}`} hint="Os mesmos dados, para programas e planilhas." />
              {alertsEnabled ? (
                <TakeLink href={`${imprensaHref("/imprensa/mesa", recorte)}#alertas`} title={`Alerta por email ${de}`} hint="Cadastro na Mesa, por cargo e UF." />
              ) : (
                <TakeLink href={imprensaHref("/imprensa/atualizacoes", recorte)} title={`O que mudou ${em}`} hint="O alerta por email não está disponível agora." />
              )}
              <TakeLink href={imprensaHref("/imprensa/mesa", recorte)} title={`Abrir a Mesa ${em}`} hint="Tabela com fonte e estado de cada dado." />
              <TakeLink href="/colinha" title={isEstado ? `Como votar ${em} (colinha)` : "Como votar (colinha)"} hint="Lista dos seis votos para levar à urna." />
            </ul>
            {dataset && (
              <CiteBox
                label="Citar este pacote"
                citation={packCitation({ scopeLabel: isEstado ? `${de.split(" ")[0]} ${scope.name}` : "da Presidência", path, rows, generatedAt: dataset.generatedAt })}
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
