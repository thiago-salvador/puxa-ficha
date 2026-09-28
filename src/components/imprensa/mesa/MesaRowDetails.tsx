import Link from "next/link"
import type { ReactNode } from "react"
import { ImprensaCitationButton } from "@/components/ImprensaCitationButton"
import { CiteBox } from "@/components/imprensa/CiteBox"
import { labelProcessState, labelState } from "@/lib/imprensa-uf-pack"
import styles from "@/app/(site)/imprensa/imprensa.module.css"
import {
  buildMesaCitation,
  formatBrl,
  formatMesaDate,
  mesaFichaAbsoluteUrl,
  patrimonioGapText,
  type MesaRow,
} from "./mesa-model"

// cspell:ignore dinheiro Revisao

const CONTACT_EMAIL = "contato@puxaficha.com.br"

function Source({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.sourceItem}>
      <dt>{title}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function SourceLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  if (!href) return <span className={styles.muted}>Link da fonte não guardado.</span>
  return <a className={styles.sourceLink} href={href} rel="noreferrer">{children}</a>
}

function Hash({ value }: { value: string | null }) {
  if (!value) return null
  return <span className={styles.hash}>SHA-256 {value}</span>
}

function when(label: string, value: string | null | undefined): string {
  const date = formatMesaDate(value)
  return date ? `${label} ${date}` : `${label}: data não disponível`
}

/**
 * Linha aberta da Mesa: cada fonte com link, data e SHA-256 quando existe,
 * a citação pronta e os atalhos da pessoa. Mesma peça no computador e no celular.
 */
export function MesaRowDetails({ row, generatedAt, id }: { row: MesaRow; generatedAt: string | null; id: string }) {
  const { patrimonio, processos, sancoes, tcu, gastos, sites, chapa } = row
  const dateLabel = (value: string | null) => formatMesaDate(value) ?? "data não disponível"
  const fichaAbsolute = mesaFichaAbsoluteUrl(row)
  return (
    <div className={styles.details} id={id}>
      <dl className={styles.sourceList}>
        <Source title="Patrimônio declarado ao TSE">
          {patrimonio.estado === "publicado" && typeof patrimonio.total === "number" ? (
            <p>{formatBrl(patrimonio.total)} em {patrimonio.ano ?? "ano não informado"}
              {typeof patrimonio.totalAnterior === "number" && patrimonio.anoAnterior ? `; ${formatBrl(patrimonio.totalAnterior)} em ${patrimonio.anoAnterior}` : ""}.
              {" "}Valores nominais, sem correção pela inflação.</p>
          ) : <p>{patrimonioGapText(patrimonio.estado)}. Isso não quer dizer patrimônio zero.</p>}
          <SourceLink href={patrimonio.fonteUrl}>Dados abertos do TSE</SourceLink>
        </Source>
        <Source title="Processos">
          <p>{labelProcessState(processos.estado)}
            {processos.buscaEstado !== "encontrado" && processos.buscaEstado !== processos.estado ? `. Busca nominal: ${labelProcessState(processos.buscaEstado)}` : ""}.
            {" "}Processo não é condenação.</p>
          <Link className={styles.sourceLink} href={`${row.fichaUrl}?tab=justica`}>Tribunais e números dos processos na aba Justiça</Link>
        </Source>
        <Source title="Sanções federais (CGU)">
          <p>{sancoes.estado === "nao-verificado" ? "Sem consulta registrada." : when("Consulta de", sancoes.consultadoEm) + "."}</p>
          {sancoes.estado !== "nao-verificado" && <SourceLink href={sancoes.fonteUrl}>Portal da Transparência (CEIS, CNEP e CEAF)</SourceLink>}
        </Source>
        <Source title="TCU">
          <p>{tcu.estado === "nao_verificado" ? "Sem consulta registrada." : when("Consulta de", tcu.consultadoEm) + "."}
            {tcu.estado === "encontrado_em_revisao" ? " Registro em revisão editorial." : ""}</p>
          {tcu.estado !== "nao_verificado" && <SourceLink href={tcu.fonteUrl}>Consulta ao TCU</SourceLink>}
        </Source>
        <Source title="Cota parlamentar">
          {gastos.estado === "publicado" && typeof gastos.ultimoAnoTotal === "number" ? (
            <p>{formatBrl(gastos.ultimoAnoTotal)} em {gastos.ultimoAno}.
              {gastos.anosEmRevisao.length ? ` Fora do total, em revisão: ${gastos.anosEmRevisao.join(", ")}.` : ""}</p>
          ) : <p>Nenhum gasto exibido na ficha. Isso não quer dizer gasto zero.</p>}
          <Link className={styles.sourceLink} href={`${row.fichaUrl}?tab=dinheiro`}>Gastos por ano, na ficha</Link>
        </Source>
        <Source title="Sites declarados ao TSE">
          <p>{sites.quantidade == null ? labelState(sites.estado) : `${sites.quantidade} ${sites.quantidade === 1 ? "endereço" : "endereços"}`}. {when("Arquivo coletado em", sites.coletadoEm)}.</p>
          <SourceLink href={sites.fonteUrl}>Arquivo oficial do TSE</SourceLink>
          <Hash value={sites.fonteSha256} />
          {sites.fonteUrl && sites.coletadoEm && <ImprensaCitationButton candidateName={row.nomeOriginal} section="sites" slug={row.slug} sourceUrl={sites.fonteUrl} collectedAt={dateLabel(sites.coletadoEm)} />}
        </Source>
        <Source title={row.cargo === "Senador" ? "Suplentes" : "Vice"}>
          <p>{row.cargo === "Senador"
            ? chapa.suplentes.length ? chapa.suplentes.join(", ") : labelState(chapa.suplentesEstado)
            : chapa.viceNome ? `${chapa.viceNome}${chapa.viceSituacao ? ` (${chapa.viceSituacao.label})` : ""}` : labelState(chapa.estado)}.
            {" "}{when("Arquivo oficial de", chapa.snapshotEm)}.</p>
          <SourceLink href={chapa.fonteUrl}>Composição no TSE</SourceLink>
          {chapa.viceSituacao?.source_url && <a className={styles.sourceLink} href={chapa.viceSituacao.source_url} rel="noreferrer">Situação do vice no TSE</a>}
          <Hash value={chapa.fonteSha256} />
          {chapa.fonteUrl && chapa.snapshotEm && <ImprensaCitationButton candidateName={row.nomeOriginal} section="chapa" slug={row.slug} sourceUrl={chapa.fonteUrl} collectedAt={dateLabel(chapa.snapshotEm)} collectionLabel="Arquivo oficial em" publishedLabel={chapa.estado === "indeferidos_comprovados" ? labelState(chapa.estado) : undefined} />}
        </Source>
      </dl>
      <div className={styles.detailSide}>
        <CiteBox citation={buildMesaCitation(row, generatedAt)} />
        <nav className={styles.actions} aria-label={`Atalhos de ${row.nome}`}>
          <Link href={`${row.fichaUrl}?tab=geral`}>Ficha geral</Link>
          <Link href={`${row.fichaUrl}?tab=justica`}>Justiça</Link>
          <Link href={`/comparar?c1=${encodeURIComponent(row.slug)}`}>Comparar</Link>
          <Link href={`${row.fichaUrl}?tab=dinheiro`}>Doadores da campanha</Link>
          <a href={`/api/card/${encodeURIComponent(row.slug)}?format=feed&v=2`} rel="noreferrer">Card para redes</a>
        </nav>
        <p className={styles.errorBox}>
          <strong>Encontrou um erro?</strong> Escreva para{" "}
          <a className={styles.email} href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Correção na ficha de ${row.nomeOriginal}`)}`}>{CONTACT_EMAIL}</a>
          {" "}com o link da ficha: <span className={styles.selectable}>{fichaAbsolute}</span>
        </p>
      </div>
    </div>
  )
}
