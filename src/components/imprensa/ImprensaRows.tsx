"use client"

import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { ImprensaCitationButton } from "@/components/ImprensaCitationButton"
import type { ImprensaRow } from "@/lib/imprensa-data"
import styles from "@/app/(site)/imprensa/imprensa.module.css"

// cspell:ignore ocorrencias publishability

type Row = Omit<ImprensaRow, "sites" | "processos"> & {
  sites: Omit<ImprensaRow["sites"], "ocorrencias">
  processos: Omit<ImprensaRow["processos"], "ocorrencias">
}

function labelState(state: string): string {
  if (state === "publicado") return "Publicado"
  if (state === "vazio_confirmado") return "Buscado, nada encontrado"
  if (state === "cobertura_parcial") return "Cobertura parcial"
  if (state === "indeterminado") return "Indeterminado"
  if (state === "nao_buscado") return "Não buscado"
  if (state === "erro") return "Erro na coleta"
  if (state === "desatualizado") return "Desatualizado"
  if (state === "contraditorio") return "Recibo contraditório"
  if (state === "nao_aplicavel") return "Não se aplica ao Senado"
  if (state === "indisponivel") return "Fonte indisponível"
  if (state === "sem_dado") return "Sem dado"
  return "Indisponível"
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "data não disponível"
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("pt-BR")
}

function fileDateLabel(value: string | null | undefined): string {
  if (!value) return "data não disponível"
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? "data não disponível" : parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
}

function Status({ state, children }: { state: string; children: ReactNode }) {
  return <div className={styles.status} data-state={state}><strong>{labelState(state)}</strong><em>{children}</em></div>
}

export function ImprensaRows({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("")
  const [stateFilter, setStateFilter] = useState("")
  const [sort, setSort] = useState("asc")
  const filtered = useMemo(() => rows
    .filter((row) => `${row.nome} ${row.nomeOriginal}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")))
    .filter((row) => !stateFilter || [row.sites.estado, row.chapa.estado, row.processos.estado, row.processos.buscaEstado, row.chapa.suplentesEstado].some((state) => state === stateFilter))
    .sort((a, b) => sort === "desc" ? b.nome.localeCompare(a.nome, "pt-BR") : a.nome.localeCompare(b.nome, "pt-BR")),
  [rows, query, stateFilter, sort])
  const states = [...new Set(rows.flatMap((row) => [row.sites.estado, row.chapa.estado, row.chapa.suplentesEstado, row.processos.estado, row.processos.buscaEstado]))].sort()
  const summaries = [
    ["Sites", rows.map((row) => row.sites.estado)],
    ["Chapa", rows.map((row) => row.chapa.estado)],
    ["Processos", rows.map((row) => row.processos.estado)],
  ] as const

  return <>
    <div className={styles.rowTools}>
      <label>Buscar por nome<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do candidato" /></label>
      <label>Estado do dado<select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="">Todos os estados</option>{states.map((state) => <option key={state} value={state}>{labelState(state)}</option>)}</select></label>
      <label>Ordenar<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="asc">Nome A a Z</option><option value="desc">Nome Z a A</option></select></label>
    </div>
    <div className={styles.summaryStates} aria-label="Resumo por estado do dado">
      {summaries.map(([title, values]) => <section key={title}><h3>{title}</h3><ul>{[...new Set(values)].sort().map((state) => <li key={state}><span>{labelState(state)}</span><strong>{values.filter((value) => value === state).length}</strong></li>)}</ul></section>)}
    </div>
    <p className={styles.legend}><span data-key="published">■ Publicado</span><span data-key="partial">■ Cobertura parcial</span><span data-key="unknown">■ Sem dado ou em verificação</span></p>
    <p className={styles.count}>{filtered.length} de {rows.length} candidatos · cada estado se refere àquela fonte e campo.</p>
    {filtered.length ? <>
      <div id="linhas" className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">Candidatos e estados de fontes da Mesa de apuração</caption>
          <thead><tr><th scope="col">Candidato</th><th scope="col">Sites declarados</th><th scope="col">Chapa</th><th scope="col">Processos na ficha</th><th scope="col">Ficha e citação</th></tr></thead>
          <tbody>{filtered.map((row) => <tr key={row.slug}>
            <td><Link className={styles.name} href={row.fichaUrl}>{row.nome}</Link><p className={styles.meta}>{[row.partido, row.cargo, row.uf].filter(Boolean).join(" · ")}</p></td>
            <td><Status state={row.sites.estado}>{row.sites.quantidade == null ? "quantidade não publicada" : `${row.sites.quantidade} URL${row.sites.quantidade === 1 ? "" : "s"}`}</Status>{row.sites.fonteUrl && <a className={`${styles.sourceLink} ${styles.meta}`} href={row.sites.fonteUrl} rel="noreferrer">Arquivo oficial do TSE de {fileDateLabel(row.sites.coletadoEm)}</a>}</td>
            <td><Status state={row.chapa.estado}>{row.cargo === "Senador" ? row.chapa.suplentes.length ? `Suplentes: ${row.chapa.suplentes.join(", ")}` : row.chapa.suplentesEstado === "vazio_confirmado" ? "Não se aplica ao Senado" : `Suplentes: ${labelState(row.chapa.suplentesEstado)}` : row.chapa.viceNome ? `Vice: ${row.chapa.viceNome}` : "vice não publicado"}</Status>{row.chapa.fonteUrl && <a className={`${styles.sourceLink} ${styles.meta}`} href={row.chapa.fonteUrl} rel="noreferrer">Fonte oficial</a>}{row.chapa.fonteUrl && row.chapa.snapshotEm && <ImprensaCitationButton candidateName={row.nomeOriginal} section="chapa" slug={row.slug} sourceUrl={row.chapa.fonteUrl} collectedAt={dateLabel(row.chapa.snapshotEm)} collectionLabel="Arquivo oficial em" />}</td>
            <td><Status state={row.processos.estado}>{row.processos.quantidade == null ? "quantidade não publicada" : `${row.processos.quantidade} registro${row.processos.quantidade === 1 ? "" : "s"}`}{(row.processos.quantidadeOmitida ?? 0) > 0 ? ` · ${row.processos.quantidadeOmitida} sem fonte oficial verificável` : ""}</Status>{(row.processos.estado === "publicado" || row.processos.estado === "cobertura_parcial") && row.processos.buscaEstado !== "encontrado" && <p className={styles.meta}>Busca: {labelState(row.processos.buscaEstado)}</p>}<p className={styles.meta}>Processo não equivale a condenação.</p></td>
            <td><div className={styles.actions}><Link href={`${row.fichaUrl}?tab=geral`}>Ficha geral</Link><Link href={`${row.fichaUrl}?tab=justica`}>Justiça</Link><a href={`/api/card/${encodeURIComponent(row.slug)}?format=feed`} rel="noreferrer">Card público</a>{row.sites.fonteUrl && row.sites.coletadoEm && <ImprensaCitationButton candidateName={row.nomeOriginal} section="sites" slug={row.slug} sourceUrl={row.sites.fonteUrl} collectedAt={dateLabel(row.sites.coletadoEm)} />}</div><p className={styles.publishability}>{isPublishable(row) ? "publicável agora" : "exige conferência"}</p></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className={styles.mobileCards}>{filtered.map((row) => <article className={styles.mobileCard} key={row.slug}>
        <header><Link className={styles.name} href={row.fichaUrl}>{row.nome}</Link><p className={styles.meta}>{[row.partido, row.cargo, row.uf].filter(Boolean).join(" · ")}</p><p className={styles.publishability}>{isPublishable(row) ? "publicável agora" : "exige conferência"}</p></header>
        <Status state={row.sites.estado}>{row.sites.quantidade == null ? "quantidade não publicada" : `${row.sites.quantidade} URL${row.sites.quantidade === 1 ? "" : "s"}`}</Status>
        <Status state={row.chapa.estado}>{row.cargo === "Senador" ? row.chapa.suplentes.length ? `Suplentes: ${row.chapa.suplentes.join(", ")}` : row.chapa.suplentesEstado === "vazio_confirmado" ? "Não se aplica ao Senado" : `Suplentes: ${labelState(row.chapa.suplentesEstado)}` : row.chapa.viceNome ? `Vice: ${row.chapa.viceNome}` : "vice não publicado"}</Status>
        <Status state={row.processos.estado}>{row.processos.quantidade == null ? "quantidade não publicada" : `${row.processos.quantidade} registros`}</Status>
        <div className={styles.actions}><Link href={`${row.fichaUrl}?tab=geral`}>Ficha geral</Link><Link href={`${row.fichaUrl}?tab=justica`}>Justiça</Link><a href={`/api/card/${encodeURIComponent(row.slug)}?format=feed`}>Card público</a>{row.sites.fonteUrl && row.sites.coletadoEm && <ImprensaCitationButton candidateName={row.nomeOriginal} section="sites" slug={row.slug} sourceUrl={row.sites.fonteUrl} collectedAt={dateLabel(row.sites.coletadoEm)} />}</div>
      </article>)}</div>
    </> : <p className={styles.notice} role="status">Nenhum candidato corresponde a estes filtros.</p>}
  </>
}

function isPublishable(row: Row): boolean {
  return [row.sites.estado].every((state) => state === "publicado" || state === "vazio_confirmado")
    && [row.chapa.estado].every((state) => state === "publicado" || state === "nao_aplicavel")
    && (row.cargo !== "Senador" || row.chapa.suplentesEstado === "publicado" || row.chapa.suplentesEstado === "vazio_confirmado")
    && [row.processos.estado].every((state) => state === "publicado" || state === "vazio_confirmado")
}
