// cspell:words homonimos
import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { AlertCohortSubscribe } from "@/components/alerts/AlertCohortSubscribe"
import { DataStateLegend } from "@/components/imprensa/DataStateLegend"
import { ImprensaFacts } from "@/components/imprensa/ImprensaFacts"
import { ImprensaRows } from "@/components/imprensa/ImprensaRows"
import { ImprensaSubnav } from "@/components/imprensa/ImprensaSubnav"
import { TrustFooter } from "@/components/imprensa/TrustFooter"
import { MesaCoverage } from "@/components/imprensa/mesa/MesaCoverage"
import { computeMesaCoverage, parseMesaCom, parseMesaSort } from "@/components/imprensa/mesa/mesa-model"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { isSenadoEnabled } from "@/lib/senado-feature"
import { computeImprensaFacts } from "@/lib/imprensa-facts"
import { formatImprensaStamp, imprensaUfPath, normalizeRecorteUf } from "@/lib/imprensa-nav"
import { getImprensaUfName } from "@/lib/imprensa-uf-pack"
import {
  normalizeImprensaFilters,
  type ImprensaFilters,
} from "@/lib/imprensa-data"
import { getImprensaDatasetCached, type ImprensaPageDataset } from "@/lib/imprensa-cache"
import styles from "../imprensa.module.css"

export const metadata: Metadata = {
  title: "Mesa de apuração | Puxa Ficha",
  description: "O que os órgãos oficiais registram sobre quem disputa a eleição, com fonte, data e grau de confirmação, pronto para citar.",
  robots: { index: false, follow: false },
}

type SearchParams = { cargo?: string | string[]; uf?: string | string[]; ordem?: string | string[]; com?: string | string[] }

const NUMBER = new Intl.NumberFormat("pt-BR")
const CARGO_NOUN: Record<string, string> = { Presidente: "presidente", Governador: "governador", Senador: "senador" }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "data não disponível"
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("pt-BR")
}

function joinPt(items: readonly string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`
}

function SectionHead({ num, id, children }: { num: string; id: string; children: ReactNode }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionNum} aria-hidden="true">{num}</span>
      <h2 id={id} className={styles.sectionTitle}>{children}</h2>
    </div>
  )
}

export default async function ImprensaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const filters: ImprensaFilters = normalizeImprensaFilters({ cargo: first(params.cargo), uf: first(params.uf) })
  const initialSort = parseMesaSort(first(params.ordem))
  const initialCom = parseMesaCom(first(params.com))
  let dataset: ImprensaPageDataset | null = null
  let sourceError: string | null = null
  try {
    dataset = await getImprensaDatasetCached(filters)
  } catch {
    sourceError = "A consulta pública está indisponível no momento."
  }
  const rows = dataset?.rows ?? []
  const generatedAt = dataset?.generatedAt ?? null
  const facts = computeImprensaFacts(rows)
  const coverage = computeMesaCoverage(rows)
  const cargos = [...(dataset?.availableCargos ?? [])]
  const ufs = [...(dataset?.availableUfs ?? [])]
  if (filters.cargo && !cargos.includes(filters.cargo)) cargos.unshift(filters.cargo)
  if (filters.uf && !ufs.includes(filters.uf)) ufs.unshift(filters.uf)
  const recorte = { cargo: filters.cargo, uf: filters.uf }
  const packUf = normalizeRecorteUf(filters.uf)
  const query = new URLSearchParams()
  if (filters.cargo) query.set("cargo", filters.cargo)
  if (filters.uf) query.set("uf", filters.uf)
  const queryString = query.toString()
  const exportSuffix = queryString ? `&${queryString}` : ""
  const alertsEnabled = isAlertsEmailFeatureEnabled()
  const stamp = formatImprensaStamp(generatedAt)
  const ufCount = new Set(rows.map((row) => row.uf).filter(Boolean)).size
  const cargoNouns = facts.porCargo.map(({ cargo }) => CARGO_NOUN[cargo] ?? cargo.toLocaleLowerCase("pt-BR"))
  const scopeLabel = [filters.cargo ?? "Todos os cargos", packUf ? getImprensaUfName(packUf) : filters.uf ?? "Brasil"].join(" · ")

  return (
    <div className={styles.shell}>
      <ImprensaSubnav current="mesa" recorte={recorte} generatedAt={generatedAt} />
      <p role="note" className={styles.topNotice}>Confira os dados na fonte original antes de publicar.</p>
      <section className={styles.hero} aria-labelledby="mesa-titulo">
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Puxa Ficha · imprensa</p>
          <h1 id="mesa-titulo" className={styles.heroTitle}>Mesa de apuração</h1>
          <p className={styles.heroSub}>Quem disputa, com fonte</p>
          <p className={styles.heroCopy}>
            O que TSE, tribunais, CGU, TCU, Câmara e Senado registram sobre os candidatos
            {cargoNouns.length ? ` a ${joinPt(cargoNouns)}` : ""}. Cada número tem fonte oficial, data de coleta e grau de confirmação.
          </p>
          {sourceError ? (
            <p className={styles.heroStatsUnavailable}>Contagem indisponível.</p>
          ) : (
            <dl className={styles.heroStats}>
              <div><dt>candidatos</dt><dd>{NUMBER.format(facts.total)}</dd></div>
              <div><dt>{facts.porCargo.length === 1 ? "cargo" : "cargos"}</dt><dd>{NUMBER.format(facts.porCargo.length)}</dd></div>
              <div><dt>{ufCount === 1 ? "UF" : "UFs"}</dt><dd>{NUMBER.format(ufCount)}</dd></div>
              <div className={styles.heroStamp}><dt>atualização</dt><dd>{stamp && generatedAt ? <time dateTime={generatedAt}>{stamp.replace(/^Dados de /, "")}</time> : "indisponível"}</dd></div>
            </dl>
          )}
        </div>
      </section>

      <div className={styles.content}>
        <section className={styles.section} aria-labelledby="mesa-recorte">
          <SectionHead num="01" id="mesa-recorte">Recorte</SectionHead>
          <form className={styles.filters} action="/imprensa/mesa" method="get" aria-label="Filtrar candidatos">
            <div className={styles.field}>
              <label htmlFor="imprensa-cargo">Cargo</label>
              <select id="imprensa-cargo" name="cargo" defaultValue={filters.cargo ?? ""}>
                <option value="">Todos os cargos</option>
                {cargos.map((cargo) => <option key={cargo} value={cargo}>{cargo}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="imprensa-uf">UF</label>
              <select id="imprensa-uf" name="uf" defaultValue={filters.uf ?? ""}>
                <option value="">Todas as UFs</option>
                {ufs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div className={styles.formActions}>
              <button className={styles.submit} type="submit">Aplicar recorte</button>
              <Link className={styles.reset} href="/imprensa/mesa">Limpar</Link>
            </div>
          </form>
          <p className={styles.lead}>
            O endereço da página guarda o recorte, a ordem e o filtro: dá para compartilhar o link dentro da redação.
            {packUf && <> Para o estado inteiro em uma página, abra o <Link className={styles.inlineLink} href={imprensaUfPath(packUf)}>pacote de imprensa do estado: {getImprensaUfName(packUf)}</Link>.</>}
          </p>
        </section>

        {sourceError ? (
          <section className={`${styles.notice} ${styles.noticeError}`} role="alert">
            <h2>Não foi possível consultar a fonte</h2>
            <p>{sourceError} Tente novamente mais tarde. Uma falha de consulta não é uma lista vazia.</p>
          </section>
        ) : <>
          <section className={styles.section} aria-labelledby="mesa-fatos">
            <SectionHead num="02" id="mesa-fatos">O que este recorte tem</SectionHead>
            <ImprensaFacts facts={facts} scopeLabel={scopeLabel} recorte={recorte} />
          </section>

          <section id="candidatos" className={styles.section} aria-labelledby="mesa-candidatos">
            <SectionHead num="03" id="mesa-candidatos">Candidatos</SectionHead>
            <p className={styles.lead}>
              Ordene por qualquer coluna numérica e filtre por um campo de cada vez. Abra a linha para ver cada fonte, a data de coleta e a citação pronta.
              {" "}Variação de patrimônio é nominal, sem correção pela inflação. Processo não é condenação.
            </p>
            <div className={styles.legendRow}><DataStateLegend /></div>
            {rows.length === 0 ? (
              <div className={styles.notice} role="status">
                <h3>Nenhuma linha neste recorte</h3>
                <p>Revise cargo e UF ou limpe os filtros. A ausência de linhas não significa ausência de candidatos no universo eleitoral.</p>
              </div>
            ) : (
              <ImprensaRows
                rows={rows}
                generatedAt={generatedAt}
                initialSort={initialSort}
                initialCom={initialCom}
                scrollOnMount={Boolean(first(params.ordem) || first(params.com))}
              />
            )}
          </section>

          <section className={styles.section} aria-labelledby="mesa-lacunas">
            <SectionHead num="04" id="mesa-lacunas">O que ainda não sabemos</SectionHead>
            <p className={styles.lead}>
              Cada barra conta os candidatos deste recorte pelo estado do dado. Sem consulta ou sem confirmação não quer dizer zero.
            </p>
            <MesaCoverage families={coverage} homonimos={facts.processos.indeterminado} />
            <div className={styles.legendDetailed}><DataStateLegend detailed /></div>
          </section>
        </>}

        <section className={styles.section} aria-labelledby="mesa-levar">
          <SectionHead num="05" id="mesa-levar">Levar embora</SectionHead>
          <div className={styles.takeGrid}>
            <div className={styles.takeCard}>
              <h3>Dados deste recorte</h3>
              <p>Uma linha por candidato, com os mesmos campos da tabela e as fontes.</p>
              <div className={styles.takeLinks}>
                <a href={`/api/imprensa/export?format=csv${exportSuffix}`} download>Baixar CSV deste recorte</a>
                <a href={`/api/imprensa/export?format=json${exportSuffix}`} download>Baixar JSON deste recorte</a>
              </div>
            </div>
            <div className={styles.takeCard}>
              <h3>Um registro por linha</h3>
              <p>Sites, processos e gastos por ano, com o link oficial de cada registro.</p>
              <div className={styles.takeLinks}>
                <a href={`/api/imprensa/export/sites?format=csv${exportSuffix}`}>Sites CSV</a>
                <a href={`/api/imprensa/export/processos?format=csv${exportSuffix}`}>Processos CSV</a>
                <a href={`/api/imprensa/export/gastos?format=csv${exportSuffix}`}>Gastos CSV</a>
              </div>
            </div>
            <div className={styles.takeCard}>
              <h3>Embed para matéria</h3>
              <p>Um quadro da ficha para colocar no texto. É apresentação, não uma nova fonte.</p>
              <div className={styles.takeLinks}><Link href="/embed">Criar embed</Link></div>
            </div>
          </div>

          {alertsEnabled && (
            <section id="alertas" className={styles.alerts} aria-labelledby="imprensa-alertas-title">
              <h3 id="imprensa-alertas-title">Alertas por cargo e UF</h3>
              <p>Escolha o recorte para receber um resumo das mudanças nas fichas publicadas. Os candidatos incluídos podem mudar entre envios. A assinatura exige confirmação por email e pode ser gerenciada ou cancelada a qualquer momento.</p>
              <AlertCohortSubscribe initialCargo={filters.cargo ?? undefined} initialUf={filters.uf} senadoEnabled={isSenadoEnabled()} />
              <p><Link className={styles.inlineLink} href="/alertas/gerenciar">Gerenciar alertas</Link></p>
            </section>
          )}

          <details id="dicionario" className={styles.dictionary}>
            <summary id="dicionario-title">Dicionário de campos e limites</summary>
            <p>
              sites_estado descreve URLs públicas vinculadas no arquivo oficial do TSE (data em sites_coletado_em), sem afirmar que são todos os sites da pessoa. processos_estado descreve as linhas da ficha; processos_busca_estado descreve o recibo da busca nominal. A contagem segue a ficha: registros com fonte do tribunal e registros com o aviso “fonte oficial em confirmação” (página específica já localizada, página do tribunal ainda não) são contados; só ocorrências sem fonte publicável ficam de fora e tornam a cobertura parcial. Recibo de vazio com linhas publicadas aparece como contraditório. A ausência de recibo é não buscado; indeterminado, desatualizado e erro não confirmam ausência. O código é Apache 2.0; as condições de reutilização dos dados seguem suas fontes.
            </p>
            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <div><dt className="font-semibold text-foreground">slug, nome_urna, nome_urna_original, cargo_disputado, uf, partido_sigla</dt><dd>Identificação pública dos candidatos. Unidade: texto. nome_urna usa a grafia da ficha; nome_urna_original preserva a do TSE. Fonte: candidatos_publico e ficha. Cobertura: candidatos publicados; não é lista de todos os candidatos.</dd></div>
              <div><dt className="font-semibold text-foreground">ficha_url</dt><dd>URL pública permanente da ficha. Unidade: URL. Fonte: Puxa Ficha. Data: geração do conjunto.</dd></div>
              <div><dt className="font-semibold text-foreground">sites_estado, sites_quantidade</dt><dd>Estado e quantidade de URLs publicáveis declaradas no arquivo oficial do TSE (data em sites_coletado_em). Unidade: estado e contagem. Zero só vale em buscado, nada encontrado; sem_dado não é zero.</dd></div>
              <div><dt className="font-semibold text-foreground">sites_fonte_url, sites_fonte_sha256, sites_coletado_em</dt><dd>Fonte, hash e coleta do pacote TSE. Unidade: URL, hash e data ISO. Cobertura: arquivo identificado; não afirma totalidade dos sites.</dd></div>
              <div><dt className="font-semibold text-foreground">chapa_estado, chapa_vice_nome, chapa_vice_nome_original</dt><dd>Estado e vice da chapa do titular. Unidade: estado e texto. chapa_vice_nome usa a mesma grafia da ficha; chapa_vice_nome_original preserva a grafia do TSE. Só publica quando identidade, vínculo oficial, URL HTTPS e SHA estão confirmados; sem_dado não escolhe um vice arbitrariamente.</dd></div>
              <div><dt className="font-semibold text-foreground">chapa_vice_situacao, chapa_vice_situacao_fonte_url</dt><dd>Situação oficial do vice que a ficha mostra ao lado do nome, com o link da consulta do TSE. Hoje só registra &quot;Inapto no TSE&quot;; vazio quer dizer que não há situação comprovada a mostrar.</dd></div>
              <div><dt className="font-semibold text-foreground">chapa_suplentes_estado, chapa_suplentes</dt><dd>Suplentes de candidaturas ao Senado, na ordem do TSE. Para Presidente e Governador o estado é não se aplica.</dd></div>
              <div><dt className="font-semibold text-foreground">chapa_fonte_url, chapa_fonte_sha256, chapa_snapshot_em</dt><dd>Fonte, SHA-256 e data do arquivo oficial da composição. A data identifica o arquivo preservado e não data quando a chapa começou.</dd></div>
              <div><dt className="font-semibold text-foreground">processos_estado, processos_busca_estado, processos_quantidade, processos_quantidade_omitida, processos_quantidade_em_confirmacao</dt><dd>Estado dos registros, estado da busca, quantidade de registros exibidos na ficha, quantidade omitida por falta de fonte publicável e quantos registros exibidos ainda têm a fonte oficial em confirmação. No arquivo longo de processos, fonte_nivel indica oficial ou em_confirmacao em cada linha. Buscado, nada encontrado publica zero; indeterminado (Buscado, identidade não confirmada) quer dizer que o nome apareceu no DJEN sem um segundo dado oficial que confirme a pessoa, e o processo não é publicado; não buscado, indeterminado, desatualizado e erro preservam a incerteza. Processo não equivale a condenação.</dd></div>
              <div><dt className="font-semibold text-foreground">patrimonio_estado, patrimonio_ano, patrimonio_total, patrimonio_valor_estado, patrimonio_fonte_url</dt><dd>Bens declarados ao TSE na eleição mais recente, o mesmo número do card Patrimônio da ficha. Unidade: reais e ano da eleição. Um total zero pode ser declaração de não ter bens (patrimonio_valor_estado diz qual caso). Se o TSE não informa o valor, ou se há mais de uma declaração no mesmo ano, o total fica vazio. Fonte: dados abertos de candidatos do TSE daquele ano.</dd></div>
              <div><dt className="font-semibold text-foreground">patrimonio_ano_anterior, patrimonio_total_anterior, patrimonio_variacao_pct</dt><dd>Declaração anterior usada na comparação e a variação em porcentagem, arredondada, como aparece na ficha. Fica vazio quando a ficha não mostra comparação, por exemplo quando a declaração anterior era zero ou sem valor.</dd></div>
              <div><dt className="font-semibold text-foreground">gastos_estado, gastos_ultimo_ano, gastos_ultimo_ano_total, gastos_anos_em_revisao</dt><dd>Cota para o exercício da atividade parlamentar (Câmara ou Senado) no ano mais recente que a ficha exibe. Unidade: reais por ano. Anos em conferência com a fonte oficial ficam fora do total e são listados em gastos_anos_em_revisao. Sem gasto exibido, o total fica vazio, não zero. O arquivo longo de gastos traz um registro por ano e casa, com o link oficial quando ele foi guardado na coleta.</dd></div>
              <div><dt className="font-semibold text-foreground">tcu_estado, tcu_registros, tcu_consultado_em, tcu_fonte_url</dt><dd>Consulta ao Tribunal de Contas da União (responsáveis inabilitados e contas irregulares), como mostrada na ficha. encontrado_em_revisao: há registros, ainda em revisão editorial. vazio_verificado: a consulta voltou sem registros. pendente: consulta inconclusiva. nao_verificado: não há consulta registrada. Só há contagem quando a consulta foi concluída.</dd></div>
              <div><dt className="font-semibold text-foreground">sancoes_estado, sancoes_quantidade, sancoes_consultado_em, sancoes_fonte_url</dt><dd>Sanções administrativas nos cadastros da Controladoria-Geral da União (CEIS, CNEP e CEAF), como no bloco da ficha. com-registros: a ficha lista sanções. vazio-confirmado: a consulta aos cadastros voltou vazia. nao-verificado: não há consulta que comprove ausência, e a quantidade fica vazia. A data é a da última consulta.</dd></div>
              <div><dt className="font-semibold text-foreground">version, generated_at, filtros cargo/UF</dt><dd>Metadados do conjunto e do recorte exportado. Unidade: versão, data ISO e texto. A data é geração/coleta, não data do fato.</dd></div>
            </dl>
            <p className="mt-4">
              Ocorrências repetidas ficam nos arquivos longos: <a className={styles.sourceLink} href={`/api/imprensa/export/sites?format=csv${exportSuffix}`}>sites CSV</a>, <a className={styles.sourceLink} href={`/api/imprensa/export/sites?format=json${exportSuffix}`}>sites JSON</a>, <a className={styles.sourceLink} href={`/api/imprensa/export/processos?format=csv${exportSuffix}`}>processos CSV</a>, <a className={styles.sourceLink} href={`/api/imprensa/export/processos?format=json${exportSuffix}`}>processos JSON</a>, <a className={styles.sourceLink} href={`/api/imprensa/export/gastos?format=csv${exportSuffix}`}>gastos CSV</a> e <a className={styles.sourceLink} href={`/api/imprensa/export/gastos?format=json${exportSuffix}`}>gastos JSON</a>. Os dados do TSE recebem crédito conforme a licença Creative Commons Atribuição; isso não altera a licença Apache 2.0 do código.
            </p>
            <p className="mt-2">Ao reutilizar um recorte, credite Puxa Ficha e a fonte específica exibida na linha. O <Link className={styles.sourceLink} href="/embed">embed</Link> e o card público são recursos de apresentação, não novas fontes factuais.</p>
            {dataset?.generatedAt && <p className="mt-2">Conjunto gerado em {dateLabel(dataset.generatedAt)}{dataset.version ? ` · versão ${dataset.version}` : ""}.</p>}
          </details>
        </section>
      </div>
      <TrustFooter homonimos={sourceError ? null : facts.processos.indeterminado} />
    </div>
  )
}
