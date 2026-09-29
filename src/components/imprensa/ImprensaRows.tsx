"use client"

// cspell:words variacao Revisao
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { imprensaDataBucket, type ImprensaDataBucket } from "@/lib/imprensa-facts"
import { MESA_PARAM, type MesaCom } from "@/lib/imprensa-nav"
import { labelState, labelProcessState } from "@/lib/imprensa-uf-pack"
import styles from "@/app/(site)/imprensa/imprensa.module.css"
import shell from "./imprensa-shell.module.css"
import { MesaRowDetails } from "./mesa/MesaRowDetails"
import {
  formatBrlCompact,
  formatMesaDate,
  formatPct,
  isMesaRowPublishable,
  matchesMesaCom,
  matchesMesaName,
  MESA_FILTERS,
  MESA_SORTS,
  mesaSearchWith,
  mesaUrlKey,
  parseMesaCom,
  parseMesaSort,
  patrimonioGapText,
  sortMesaRows,
  syncMesaUrlState,
  type MesaRow,
  type MesaSort,
  type MesaUrlState,
} from "./mesa/mesa-model"

interface Cell {
  bucket: ImprensaDataBucket | null
  primary: string
  secondary?: Array<string | null | false>
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function patrimonioCell(row: MesaRow): Cell {
  const { patrimonio } = row
  if (patrimonio.estado !== "publicado" || typeof patrimonio.total !== "number") {
    return { bucket: imprensaDataBucket(patrimonio.estado === "publicado" ? "sem_dado" : patrimonio.estado), primary: patrimonioGapText(patrimonio.estado), secondary: [patrimonio.ano ? `TSE, ${patrimonio.ano}` : null] }
  }
  const zero = patrimonio.total === 0
  return {
    bucket: "publicado",
    primary: formatBrlCompact(patrimonio.total),
    secondary: [
      patrimonio.ano ? `Declaração de ${patrimonio.ano}` : null,
      zero && patrimonio.valorEstado === "sem_bens_declarados" ? "Declarou não ter bens" : null,
      zero && patrimonio.valorEstado !== "sem_bens_declarados" ? "Bens declarados com valor zero" : null,
    ],
  }
}

function variacaoCell(row: MesaRow): Cell {
  const { patrimonio } = row
  if (patrimonio.estado === "publicado" && typeof patrimonio.variacaoPct === "number") {
    return { bucket: "publicado", primary: formatPct(patrimonio.variacaoPct), secondary: [patrimonio.anoAnterior ? `vs ${patrimonio.anoAnterior}, nominal` : "nominal"] }
  }
  return { bucket: "sem_confirmacao", primary: "Sem comparação", secondary: ["Não há duas declarações comparáveis"] }
}

function processosCell(row: MesaRow): Cell {
  const { processos } = row
  const bucket = imprensaDataBucket(processos.estado)
  const disciplinares = processos.contagem?.disciplinares ?? 0
  const avisoDisciplinar = disciplinares > 0 ? "Disciplinar não é processo judicial nem condenação" : null
  if (processos.estado === "publicado" || processos.estado === "cobertura_parcial") {
    const quantidade = processos.quantidade
    const selo = processos.quantidadeEmConfirmacao ?? 0
    const omitidos = processos.quantidadeOmitida ?? 0
    const total = processos.contagem?.total ?? quantidade
    return {
      bucket,
      primary: total == null ? "Quantidade não publicada" : plural(total, "registro", "registros"),
      secondary: [
        disciplinares > 0 && quantidade != null ? `${plural(quantidade, "judicial", "judiciais")} · ${plural(disciplinares, "disciplinar", "disciplinares")}` : null,
        selo > 0 ? `${selo} com fonte oficial em confirmação` : null,
        omitidos > 0 ? `${omitidos} sem fonte publicável, fora da conta` : null,
        "Processo não é condenação",
        avisoDisciplinar,
      ],
    }
  }
  if (disciplinares > 0) {
    // Sem processo judicial publicado, o disciplinar ainda aparece na ficha.
    return {
      bucket: "publicado",
      primary: plural(disciplinares, "registro disciplinar", "registros disciplinares"),
      secondary: [`Judicial: ${processos.estado === "vazio_confirmado" ? "nada consta" : labelProcessState(processos.estado).toLowerCase()}`, avisoDisciplinar],
    }
  }
  if (processos.estado === "vazio_confirmado") return { bucket, primary: "Nada consta", secondary: ["Busca feita, sem registro"] }
  if (processos.estado === "indeterminado") return { bucket, primary: "Identidade não confirmada", secondary: ["Nome igual achado; não publicado"] }
  return { bucket, primary: labelProcessState(processos.estado) }
}

function sancoesCell(row: MesaRow): Cell {
  const { sancoes } = row
  const bucket = imprensaDataBucket(sancoes.estado)
  if (sancoes.estado === "com-registros") return { bucket, primary: sancoes.quantidade == null ? "Com registro" : plural(sancoes.quantidade, "sanção", "sanções") }
  if (sancoes.estado === "vazio-confirmado") return { bucket, primary: "Nada consta" }
  return { bucket, primary: "Sem consulta" }
}

function tcuCell(row: MesaRow): Cell {
  const { tcu } = row
  const bucket = imprensaDataBucket(tcu.estado)
  switch (tcu.estado) {
    case "encontrado_em_revisao": return { bucket, primary: tcu.registros == null ? "Registro em revisão" : `${plural(tcu.registros, "registro", "registros")} em revisão` }
    case "vazio_verificado": return { bucket, primary: "Nada consta" }
    case "pendente": return { bucket, primary: "Consulta inconclusiva" }
    default: return { bucket, primary: "Sem consulta" }
  }
}

function cotaCell(row: MesaRow): Cell {
  const { gastos } = row
  if (gastos.estado === "publicado" && typeof gastos.ultimoAnoTotal === "number") {
    return {
      bucket: "publicado",
      primary: formatBrlCompact(gastos.ultimoAnoTotal),
      secondary: [gastos.ultimoAno ? `Em ${gastos.ultimoAno}` : null, gastos.anosEmRevisao.length ? `${plural(gastos.anosEmRevisao.length, "ano", "anos")} em revisão, fora do total` : null],
    }
  }
  return { bucket: "sem_confirmacao", primary: "Sem gasto publicado", secondary: ["Não quer dizer zero"] }
}

function chapaCell(row: MesaRow): Cell {
  const { chapa } = row
  if (row.cargo === "Senador") {
    const bucket = imprensaDataBucket(chapa.suplentesEstado)
    if (chapa.suplentesEstado === "publicado") return { bucket, primary: "Suplentes publicados", secondary: [chapa.suplentes.join(", ") || null] }
    if (chapa.suplentesEstado === "indeferidos_comprovados") return { bucket, primary: "Suplentes indeferidos", secondary: ["Comprovante do TSE"] }
    return { bucket, primary: `Suplentes: ${labelState(chapa.suplentesEstado).toLocaleLowerCase("pt-BR")}` }
  }
  if (chapa.estado === "publicado" && chapa.viceNome) {
    return { bucket: "publicado", primary: "Vice publicado", secondary: [chapa.viceNome, chapa.viceSituacao?.label ?? null] }
  }
  return { bucket: imprensaDataBucket(chapa.estado), primary: `Vice: ${labelState(chapa.estado).toLocaleLowerCase("pt-BR")}` }
}

const COLUMNS: ReadonlyArray<{ id: string; label: string; sort: MesaSort | null; cell: (row: MesaRow) => Cell }> = [
  { id: "patrimonio", label: "Patrimônio", sort: "patrimonio", cell: patrimonioCell },
  { id: "variacao", label: "Variação", sort: "variacao", cell: variacaoCell },
  { id: "processos", label: "Processos", sort: "processos", cell: processosCell },
  { id: "sancoes", label: "Sanções · TCU", sort: "sancoes", cell: (row) => sancoesCell(row) },
  { id: "cota", label: "Cota, último ano", sort: "gasto", cell: cotaCell },
  { id: "chapa", label: "Chapa", sort: null, cell: chapaCell },
]

function CellView({ cell, prefix }: { cell: Cell; prefix?: string }) {
  const secondary = (cell.secondary ?? []).filter((item): item is string => Boolean(item))
  return (
    <div className={styles.cell}>
      <p className={styles.cellPrimary}>
        {cell.bucket && <span className={shell.stateMark} data-bucket={cell.bucket} aria-hidden="true" />}
        <span>{prefix && <span className={styles.cellPrefix}>{prefix} </span>}{cell.primary}</span>
      </p>
      {secondary.map((item) => <p key={item} className={styles.cellSecondary}>{item}</p>)}
    </div>
  )
}

function ColumnCells({ row, columnId }: { row: MesaRow; columnId: string }) {
  if (columnId === "sancoes") {
    return <>
      <CellView cell={sancoesCell(row)} prefix="CGU:" />
      <CellView cell={tcuCell(row)} prefix="TCU:" />
    </>
  }
  const column = COLUMNS.find((item) => item.id === columnId)
  return column ? <CellView cell={column.cell(row)} /> : null
}

function ReadyBadge({ row }: { row: MesaRow }) {
  const ready = isMesaRowPublishable(row)
  return <p className={styles.badge} data-ready={ready ? "sim" : "nao"}>{ready ? "Pronto para citar" : "Conferir antes de citar"}</p>
}

function candidateMeta(row: MesaRow): string {
  return [row.partido, row.cargo, row.uf].filter(Boolean).join(" · ")
}

/**
 * Tabela da Mesa. Ordena por um campo numérico oficial escolhido pela pessoa,
 * filtra por um campo só e abre cada linha com fontes, citação e atalhos.
 * Ordem e filtro ficam na URL (?ordem=, ?com=) para o recorte ser compartilhado.
 * A URL também manda: um link para outra `ordem` ou `com` (inclusive de volta à
 * de abertura, depois de a pessoa mudar o filtro) refaz o estado e rola até a
 * lista, sem depender de remontar o componente.
 */
export function ImprensaRows({
  rows,
  generatedAt,
  initialSort = "padrao",
  initialCom = null,
  scrollOnMount = false,
}: {
  rows: MesaRow[]
  generatedAt: string | null
  initialSort?: MesaSort
  initialCom?: MesaCom | null
  scrollOnMount?: boolean
}) {
  // Fora do roteador (testes, render isolado) não há searchParams: vale o que a página mandou.
  const searchParams = useSearchParams()
  const urlSort = searchParams ? parseMesaSort(searchParams.get(MESA_PARAM.ordem)) : initialSort
  const urlCom = searchParams ? parseMesaCom(searchParams.get(MESA_PARAM.com)) : initialCom
  const [query, setQuery] = useState("")
  const [view, setView] = useState<MesaUrlState>(() => ({ sort: urlSort, com: urlCom, urlKey: mesaUrlKey(urlSort, urlCom) }))
  const [scrollRequest, setScrollRequest] = useState(scrollOnMount ? 1 : 0)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const firstSync = useRef(true)
  const { sort, com } = view

  // Estado derivado da URL durante o render (padrão da documentação do React
  // para ajustar estado quando uma entrada muda), sem efeito intermediário.
  const synced = syncMesaUrlState(view, { sort: urlSort, com: urlCom })
  if (synced) {
    setView(synced.state)
    if (synced.scroll) setScrollRequest((count) => count + 1)
  }

  function setSort(next: MesaSort) {
    setView((current) => ({ ...current, sort: next }))
  }

  function setCom(next: MesaCom | null) {
    setView((current) => ({ ...current, com: next }))
  }

  useEffect(() => {
    if (scrollRequest === 0) return
    document.getElementById("candidatos")?.scrollIntoView({ block: "start" })
  }, [scrollRequest])

  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false
      return
    }
    const search = mesaSearchWith(window.location.search, sort, com)
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`)
  }, [sort, com])

  const filterCounts = useMemo(
    () => new Map(MESA_FILTERS.map((filter) => [filter.id, rows.filter((row) => matchesMesaCom(row, filter.id)).length])),
    [rows],
  )
  const visible = useMemo(
    () => sortMesaRows(rows.filter((row) => matchesMesaName(row, query) && (!com || matchesMesaCom(row, com))), sort),
    [rows, query, com, sort],
  )
  const activeFilter = MESA_FILTERS.find((filter) => filter.id === com)

  function toggle(slug: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function toggleButton(row: MesaRow, target: string) {
    const expanded = open.has(row.slug)
    return (
      <button type="button" className={styles.expand} aria-expanded={expanded} aria-controls={expanded ? target : undefined} onClick={() => toggle(row.slug)}>
        {expanded ? "Fechar fontes" : "Fontes e citação"}
      </button>
    )
  }

  return (
    <div className={shell.tokens}>
      <div className={styles.rowTools}>
        <label className={styles.toolField}>Buscar por nome
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do candidato" />
        </label>
        <label className={styles.toolField}>Ordenar
          <select value={sort} onChange={(event) => setSort(event.target.value as MesaSort)}>
            {MESA_SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.chips} role="group" aria-label="Mostrar só">
        <button type="button" className={styles.chip} aria-pressed={com === null} onClick={() => setCom(null)}>
          Todos <span className={styles.chipCount}>{rows.length}</span>
        </button>
        {MESA_FILTERS.map((filter) => (
          <button key={filter.id} type="button" className={styles.chip} aria-pressed={com === filter.id} onClick={() => setCom(com === filter.id ? null : filter.id)}>
            {filter.label} <span className={styles.chipCount}>{filterCounts.get(filter.id) ?? 0}</span>
          </button>
        ))}
      </div>
      <p className={styles.count} role="status" aria-live="polite">
        {visible.length} de {rows.length} {rows.length === 1 ? "candidato" : "candidatos"}{activeFilter ? ` · ${activeFilter.label.toLocaleLowerCase("pt-BR")}` : ""}
        {sort !== "padrao" && sort !== "asc" && sort !== "desc" ? " · quem não tem o dado fica no fim da lista" : ""}
      </p>

      {visible.length ? <>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Candidatos do recorte, com patrimônio, variação, processos, sanções, TCU, cota e chapa. Cada linha abre com fontes e citação.</caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined}>
                  <button type="button" className={styles.sortButton} onClick={() => setSort(sort === "asc" ? "desc" : "asc")}>Candidato</button>
                </th>
                {COLUMNS.map((column) => (
                  <th key={column.id} scope="col" aria-sort={column.sort && sort === column.sort ? "descending" : undefined}>
                    {column.sort
                      ? <button type="button" className={styles.sortButton} data-active={sort === column.sort} onClick={() => setSort(column.sort as MesaSort)}>{column.label}{sort === column.sort ? <span aria-hidden="true"> ↓</span> : null}</button>
                      : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const target = `mesa-fontes-${row.slug}`
                return <Fragment key={row.slug}>
                  <tr data-open={open.has(row.slug) || undefined}>
                    <th scope="row" className={styles.candidateCell}>
                      <Link className={styles.name} href={row.fichaUrl}>{row.nome}</Link>
                      <p className={styles.meta}>{candidateMeta(row)}</p>
                      <ReadyBadge row={row} />
                      {toggleButton(row, target)}
                    </th>
                    {COLUMNS.map((column) => <td key={column.id}><ColumnCells row={row} columnId={column.id} /></td>)}
                  </tr>
                  {open.has(row.slug) && (
                    <tr className={styles.detailRow}>
                      <td colSpan={COLUMNS.length + 1}><MesaRowDetails row={row} generatedAt={generatedAt} id={target} /></td>
                    </tr>
                  )}
                </Fragment>
              })}
            </tbody>
          </table>
        </div>
        <ul className={styles.mobileCards} aria-label="Candidatos do recorte">
          {visible.map((row) => {
            const target = `mesa-fontes-celular-${row.slug}`
            return (
              <li className={styles.mobileCard} key={row.slug}>
                <div className={styles.mobileHead}>
                  <Link className={styles.name} href={row.fichaUrl}>{row.nome}</Link>
                  <p className={styles.meta}>{candidateMeta(row)}</p>
                  <ReadyBadge row={row} />
                </div>
                <dl className={styles.mobileFields}>
                  {COLUMNS.map((column) => (
                    <div key={column.id}>
                      <dt>{column.label}</dt>
                      <dd><ColumnCells row={row} columnId={column.id} /></dd>
                    </div>
                  ))}
                </dl>
                {toggleButton(row, target)}
                {open.has(row.slug) && <MesaRowDetails row={row} generatedAt={generatedAt} id={target} />}
              </li>
            )
          })}
        </ul>
      </> : (
        <div className={styles.empty} role="status">
          <p>Nenhum candidato deste recorte atende a esta busca{activeFilter ? ` com o filtro "${activeFilter.label}"` : ""}.</p>
          {activeFilter && <button type="button" className={styles.chip} onClick={() => setCom(null)}>Mostrar todos</button>}
        </div>
      )}
      <p className={styles.tableNote}>Cada fonte tem a própria data de coleta, mostrada ao abrir a linha. Conjunto gerado em {formatMesaDate(generatedAt) ?? "data não disponível"}.</p>
    </div>
  )
}
