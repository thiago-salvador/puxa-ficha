import type { Metadata } from "next"
import Link from "next/link"
import { AlertCohortSubscribe } from "@/components/alerts/AlertCohortSubscribe"
import { ImprensaRows } from "@/components/imprensa/ImprensaRows"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { isSenadoEnabled } from "@/lib/senado-feature"
import {
  normalizeImprensaFilters,
  type ImprensaFilters,
} from "@/lib/imprensa-data"
import { getImprensaDatasetCached, type ImprensaPageDataset } from "@/lib/imprensa-cache"
import styles from "../imprensa.module.css"

export const metadata: Metadata = {
  title: "Mesa de apuração | Puxa Ficha",
  description: "Recortes públicos de candidatos e fatos com fontes para apoiar apurações jornalísticas.",
  robots: { index: false, follow: false },
}

type SearchParams = { cargo?: string | string[]; uf?: string | string[] }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "data não disponível"
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("pt-BR")
}

export default async function ImprensaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const rawFilters = { cargo: first(params.cargo), uf: first(params.uf) }
  const filters: ImprensaFilters = normalizeImprensaFilters(rawFilters)
  let dataset: ImprensaPageDataset | null = null
  let sourceError: string | null = null
  try {
    dataset = await getImprensaDatasetCached(filters)
  } catch {
    sourceError = "A consulta pública está indisponível no momento."
  }
  const rows = dataset?.rows ?? []
  const cargos = [...(dataset?.availableCargos ?? [])]
  const ufs = [...(dataset?.availableUfs ?? [])]
  if (filters.cargo && !cargos.includes(filters.cargo)) cargos.unshift(filters.cargo)
  if (filters.uf && !ufs.includes(filters.uf)) ufs.unshift(filters.uf)
  const query = new URLSearchParams()
  if (filters.cargo) query.set("cargo", filters.cargo)
  if (filters.uf) query.set("uf", filters.uf)
  const queryString = query.toString()
  const exportSuffix = queryString ? `&${queryString}` : ""
  const alertsEnabled = isAlertsEmailFeatureEnabled()

  return (
    <div className={styles.shell}>
      <p role="note" className={styles.notice}>Confira os dados na fonte original antes de publicar.</p>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Puxa Ficha · acesso direto</p>
          <h1 className={styles.heroTitle}>Mesa de apuração</h1>
          <p className={styles.heroCopy}>
            Um recorte público para conferir candidatos, fontes e alcance dos dados publicados nas fichas.
            Se você chegou por um link compartilhado, os filtros abaixo preservam exatamente esse recorte.
          </p>
        </div>
      </section>

      <div className={styles.content}>
        <section className={styles.intro} aria-labelledby="mesa-intro">
          <p id="mesa-intro" className={styles.introText}>
            Use cargo e UF para filtrar os candidatos. Sites declarados no TSE, composição de chapa e processos
            publicados na ficha têm estados de cobertura separados: uma ausência de prova não é tratada como zero.
          </p>
          <nav className={styles.utilityLinks} aria-label="Recursos da Mesa">
            <Link href="/metodologia">Metodologia e fontes</Link>
            <Link href="/embed">Criar embed</Link>
            <Link href="/imprensa/atualizacoes">Atualizações verificadas</Link>
            <Link href="/imprensa/frescor">Frescor das fontes</Link>
            <Link href="#dicionario">Dicionário de campos</Link>
            <a href={`/api/imprensa/export?format=csv${exportSuffix}`} download>
              Baixar CSV
            </a>
            <a href={`/api/imprensa/export?format=json${exportSuffix}`} download>
              Baixar JSON
            </a>
          </nav>
        </section>

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
          <div className="flex flex-wrap gap-2">
            <button className={styles.submit} type="submit">Aplicar recorte</button>
            <Link className={styles.reset} href="/imprensa/mesa">Limpar</Link>
          </div>
        </form>

        {alertsEnabled && (
          <section id="alertas" className={styles.notice} aria-labelledby="imprensa-alertas-title">
            <h2 id="imprensa-alertas-title" className="text-lg font-semibold text-foreground">Alertas por cargo e UF</h2>
            <div className="mb-4"><p>Escolha o recorte para receber um resumo das mudanças nas fichas publicadas. Os candidatos incluídos podem mudar entre envios. A assinatura exige confirmação por email e pode ser gerenciada ou cancelada a qualquer momento.</p></div>
            <AlertCohortSubscribe initialCargo={filters.cargo ?? undefined} initialUf={filters.uf} senadoEnabled={isSenadoEnabled()} />
            <div className="mt-3"><p><Link className={styles.sourceLink} href="/alertas/gerenciar">Gerenciar alertas</Link></p></div>
          </section>
        )}

        <div className={styles.datasetHeader}>
          <h2 className={styles.datasetTitle}>Candidatos no recorte</h2>
          <p className={styles.count}>{sourceError ? "contagem indisponível" : `${rows.length} ${rows.length === 1 ? "linha" : "linhas"} públicas`}</p>
        </div>

        {sourceError ? (
          <section className={`${styles.notice} ${styles.noticeError}`} role="alert">
            <h3>Não foi possível consultar a fonte</h3>
            <p>{sourceError} Tente novamente mais tarde. Uma falha de consulta não é uma lista vazia.</p>
          </section>
        ) : rows.length === 0 ? (
          <section className={styles.notice} role="status">
            <h3>Nenhuma linha neste recorte</h3>
            <p>Revise cargo e UF ou limpe os filtros. A ausência de linhas não significa ausência de candidatos no universo eleitoral.</p>
          </section>
        ) : <ImprensaRows rows={rows} />}

        <details id="dicionario" className={styles.footnote}>
          <summary id="dicionario-title" className="mb-2 cursor-pointer font-semibold text-foreground">Dicionário e limites</summary>
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
      </div>
    </div>
  )
}
