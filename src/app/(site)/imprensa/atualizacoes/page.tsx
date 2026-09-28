// cspell:words homonimos
import type { Metadata } from "next"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { AlertCohortSubscribe } from "@/components/alerts/AlertCohortSubscribe"
import { ImprensaSubnav } from "@/components/imprensa/ImprensaSubnav"
import { TrustFooter } from "@/components/imprensa/TrustFooter"
import { MethodSection } from "@/components/imprensa/method/MethodSection"
import styles from "@/components/imprensa/method/method.module.css"
import { UpdateItem } from "@/components/imprensa/updates/UpdateItem"
import { UpdatesFilters } from "@/components/imprensa/updates/UpdatesFilters"
import list from "@/components/imprensa/updates/updates.module.css"
import {
  buildUpdatesView,
  formatDayMonth,
  latestDetection,
  UPDATES_PAGE_SIZE,
  updatesHref,
} from "@/components/imprensa/updates/updates-view"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { getImprensaAtualizacoes } from "@/lib/imprensa-atualizacoes"
import { getImprensaDatasetCached, type ImprensaPageDataset } from "@/lib/imprensa-cache"
import { computeImprensaFacts } from "@/lib/imprensa-facts"
import { getLatestSituacaoCheck } from "@/lib/imprensa-frescor-server"
import { imprensaHref } from "@/lib/imprensa-nav"
import { getImprensaUfName } from "@/lib/imprensa-uf-pack"
import { isSenadoEnabled } from "@/lib/senado-feature"

export const metadata: Metadata = {
  title: "O que mudou | Puxa Ficha",
  description: "Mudanças de situação da candidatura, patrimônio e partido detectadas nas fontes oficiais, com cargo, UF, antes e depois.",
  alternates: { canonical: "/imprensa/atualizacoes" },
}
// Os filtros vêm da query. A lista e o dataset já saem do cache de dados; a
// página só filtra em memória.
export const dynamic = "force-dynamic"

const NUMBER = new Intl.NumberFormat("pt-BR")
const CARGO_ORDER = ["Presidente", "Governador", "Senador"]

async function loadDataset(): Promise<ImprensaPageDataset | null> {
  try {
    return await getImprensaDatasetCached({ cargo: null, uf: null })
  } catch {
    return null
  }
}

function plural(count: number, one: string, many: string): string {
  return `${NUMBER.format(count)} ${count === 1 ? one : many}`
}

export default async function ImprensaAtualizacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [params, resource, dataset, situacaoCheck] = await Promise.all([
    searchParams,
    getImprensaAtualizacoes(),
    loadDataset(),
    getLatestSituacaoCheck(),
  ])

  // Sem dataset, candidates fica null: cargo e UF de cada mudança são
  // desconhecidos, e a view não filtra nem conta por eles.
  const candidates = dataset ? dataset.rows.map(({ slug, nome, cargo, uf }) => ({ slug, nome, cargo, uf })) : null
  const cargos = [...new Set((candidates ?? []).map((candidate) => candidate.cargo))]
    .sort((a, b) => (CARGO_ORDER.indexOf(a) + 1 || 99) - (CARGO_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b, "pt-BR"))
  const { query, recorteDisponivel, recorteIgnorado, rows, filtered, facets } = buildUpdatesView(params, resource.updates, candidates, cargos)
  const recorte = { uf: query.uf, cargo: query.cargo }
  const pageCount = Math.max(1, Math.ceil(filtered.length / UPDATES_PAGE_SIZE))
  const page = Math.min(query.page, pageCount)
  const visible = filtered.slice((page - 1) * UPDATES_PAGE_SIZE, page * UPDATES_PAGE_SIZE)
  const lastDetection = latestDetection(filtered)
  const hasFilter = Boolean(query.uf || query.cargo || query.tipo)
  const truncated = resource.total !== null && resource.total > resource.updates.length
  const homonimos = dataset ? computeImprensaFacts(dataset.rows).processos.indeterminado : null
  const alertsEnabled = isAlertsEmailFeatureEnabled()

  return (
    <div className={styles.page}>
      <ImprensaSubnav current="atualizacoes" recorte={recorte} generatedAt={dataset?.generatedAt ?? null} />
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Imprensa · Acompanhar</p>
          <h1 className={styles.heroTitle}>O que mudou</h1>
          <p className={styles.heroCopy}>
            Mudanças de situação da candidatura, patrimônio declarado e partido que detectamos nas fontes oficiais. Cada linha traz o valor de antes, o de depois, a data da detecção e o link da fonte.
          </p>
          {resource.status === "available" ? (
            <p className={styles.heroFacts}>
              <span>
                Última detecção registrada:{" "}
                {lastDetection ? <strong><time dateTime={lastDetection}>{formatDayMonth(lastDetection)}</time></strong> : <strong>nenhuma neste recorte</strong>}
              </span>
              {situacaoCheck ? (
                <span>
                  Última verificação da situação no TSE:{" "}
                  <strong><time dateTime={situacaoCheck}>{formatDayMonth(situacaoCheck)}</time></strong>
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <main className={styles.content}>
        <MethodSection id="mudancas" num="01" title="Mudanças detectadas">
          {resource.status === "unavailable" ? (
            <p className={styles.alert} role="alert">
              <strong>Não foi possível carregar as mudanças agora.</strong>
              Isso não quer dizer que nada mudou. Tente de novo em alguns minutos.
            </p>
          ) : (
            <>
              {recorteDisponivel ? null : (
                <p className={styles.alert} role="status">
                  <strong>Não foi possível carregar agora o cargo e o estado de cada mudança.</strong>
                  {recorteIgnorado ? " O filtro por estado e cargo não foi aplicado." : ""} A lista mostra todas as mudanças registradas, só com o nome. Uma falha de consulta não quer dizer que o recorte não teve mudança.
                </p>
              )}
              <UpdatesFilters query={query} facets={facets} recorteDisponivel={recorteDisponivel} />
              <p className={list.resultLine}>
                {hasFilter
                  ? `${NUMBER.format(filtered.length)} de ${plural(rows.length, "mudança registrada", "mudanças registradas")}`
                  : plural(rows.length, "mudança registrada", "mudanças registradas")}
                {query.uf ? `, em ${getImprensaUfName(query.uf)}` : ""}
                {query.cargo ? `, cargo ${query.cargo}` : ""}
              </p>
              {visible.length === 0 ? (
                <p className={list.empty}>
                  Nenhuma mudança detectada neste recorte. Isso quer dizer que não encontramos mudança nas coletas feitas, não que a ficha foi conferida de novo hoje.
                </p>
              ) : (
                <ol className={list.list} aria-label="Mudanças detectadas">
                  {visible.map((row) => <UpdateItem key={row.id} row={row} />)}
                </ol>
              )}
              {pageCount > 1 ? (
                <nav className={list.pager} aria-label="Páginas das mudanças">
                  {page > 1 ? <Link href={updatesHref(query, page - 1)}>Anterior</Link> : null}
                  <span>Página {page} de {pageCount}</span>
                  {page < pageCount ? <Link href={updatesHref(query, page + 1)}>Próxima</Link> : null}
                </nav>
              ) : null}
              {truncated ? (
                <p className={styles.note}>
                  A lista mostra as {NUMBER.format(resource.updates.length)} mudanças mais recentes de {NUMBER.format(resource.total ?? 0)} registradas.
                </p>
              ) : null}
            </>
          )}
          <p className={styles.note}>
            A data de detecção é o dia em que a coleta encontrou a mudança, não o dia em que ela aconteceu na fonte. A verificação da situação é a última leitura bem-sucedida do arquivo do TSE com a situação das candidaturas. Para patrimônio e partido, registramos só a data em que a mudança foi detectada.
          </p>
        </MethodSection>

        {alertsEnabled ? (
          <MethodSection id="alertas" num="02" title="Receber por email">
            <p className={styles.lead}>
              Escolha o cargo e o estado para receber por email um resumo das mudanças nas fichas publicadas. A assinatura precisa ser confirmada por email e pode ser cancelada quando quiser.
            </p>
            <div className={`${list.alerts} mt-5`}>
              <AlertCohortSubscribe initialCargo={query.cargo ?? undefined} initialUf={query.uf} senadoEnabled={isSenadoEnabled()} />
            </div>
            <p className={styles.note}>
              <Link className={styles.link} href="/alertas/gerenciar">Gerenciar alertas</Link>
              {" · "}
              <Link className={styles.link} href={imprensaHref("/imprensa/mesa", recorte)}>Ver o recorte na Mesa</Link>
            </p>
          </MethodSection>
        ) : null}
      </main>

      <TrustFooter homonimos={homonimos} />
      <Footer />
    </div>
  )
}
