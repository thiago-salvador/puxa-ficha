import type { Metadata } from "next"
import Link from "next/link"
import { normalizeDadosAbertosFilters, type DadosAbertosFilters } from "@/lib/dados-abertos"
import { getDadosAbertosDatasetCached } from "@/lib/dados-abertos-cache"
import styles from "./dados-abertos.module.css"

export const metadata: Metadata = {
  title: "Dados abertos | Puxa Ficha",
  description:
    "Baixe o cadastro público de candidatos do Puxa Ficha em CSV ou JSON: identidade, cargo, situação e fontes, prontos para reuso.",
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

export default async function DadosAbertosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const filters: DadosAbertosFilters = normalizeDadosAbertosFilters({ cargo: first(params.cargo), uf: first(params.uf) })
  let rowCount: number | null = null
  let generatedAt: string | null = null
  let sourceError: string | null = null
  try {
    const dataset = await getDadosAbertosDatasetCached(filters)
    rowCount = dataset.rows.length
    generatedAt = dataset.generatedAt
  } catch {
    sourceError = "A consulta pública está indisponível no momento."
  }

  const query = new URLSearchParams()
  if (filters.cargo) query.set("cargo", filters.cargo)
  if (filters.uf) query.set("uf", filters.uf)
  const queryString = query.toString()
  const exportSuffix = queryString ? `&${queryString}` : ""

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Puxa Ficha · dados abertos</p>
          <h1 className={styles.heroTitle}>Baixe o cadastro público</h1>
          <p className={styles.heroCopy}>
            O mesmo cadastro que alimenta as fichas do site, em CSV ou JSON: identidade, cargo, situação de
            candidatura, partido e fontes declaradas. Sem cadastro, sem chave de API — é o dado que já é público,
            só que num arquivo só.
          </p>
        </div>
      </section>

      <main className={styles.content}>
        <p className={styles.meta}>
          {sourceError
            ? "contagem indisponível"
            : `${rowCount ?? 0} ${rowCount === 1 ? "candidatura publicada" : "candidaturas publicadas"}${
                generatedAt ? ` · gerado em ${dateLabel(generatedAt)}` : ""
              }`}
        </p>

        <div className={styles.downloadRow}>
          <a className={styles.downloadButton} href={`/api/dados-abertos?format=csv${exportSuffix}`} download>
            Baixar CSV
          </a>
          <a className={styles.downloadButton} href={`/api/dados-abertos?format=json${exportSuffix}`} download>
            Baixar JSON
          </a>
        </div>

        {sourceError && (
          <section className={styles.license} role="alert">
            <strong>Não foi possível consultar a fonte.</strong> {sourceError} Tente novamente mais tarde.
          </section>
        )}

        <nav className={styles.utilityLinks} aria-label="Recursos relacionados">
          <Link href="/metodologia">Metodologia e fontes</Link>
          <Link href="/imprensa">Recorte para apuração jornalística</Link>
        </nav>

        <section className={styles.dictionary} aria-labelledby="dicionario-title">
          <h2 id="dicionario-title">Dicionário de campos</h2>
          <p>
            Uma linha por candidatura publicada. Situação é o texto de <code>situacao_candidatura</code> no domínio
            fechado do site (ex.: &quot;deferido&quot;, &quot;indeferido com recurso&quot;); ausência de valor não
            afirma ausência de julgamento. Fontes lista as origens públicas já usadas para montar a ficha — não é a
            lista completa de tudo que existe sobre a pessoa.
          </p>
          <dl>
            <div>
              <dt>slug, ficha_url</dt>
              <dd>Identificador estável e URL pública permanente da ficha.</dd>
            </div>
            <div>
              <dt>nome_urna, nome_completo, cargo_disputado, uf, partido_sigla</dt>
              <dd>Identificação pública da candidatura, como consta na ficha.</dd>
            </div>
            <div>
              <dt>situacao_candidatura</dt>
              <dd>Julgamento do registro no domínio fechado do site; vazio não é zero.</dd>
            </div>
            <div>
              <dt>numero_urna</dt>
              <dd>Número oficial do TSE para 2026; vazio significa ainda não reconciliado.</dd>
            </div>
            <div>
              <dt>ultima_atualizacao</dt>
              <dd>Data ISO da última escrita conhecida na ficha, não a data do fato.</dd>
            </div>
            <div>
              <dt>fontes</dt>
              <dd>Origens públicas já citadas na ficha, separadas por ponto e vírgula no CSV.</dd>
            </div>
            <div>
              <dt>version, generated_at, filtros cargo/uf</dt>
              <dd>Metadados do conjunto e do recorte exportado.</dd>
            </div>
          </dl>
        </section>

        <section className={styles.license}>
          <p>
            O código do Puxa Ficha é Apache 2.0. Os dados vêm de fontes públicas oficiais (TSE e afins); a
            reutilização segue os termos de cada fonte — dado do TSE, por exemplo, é atribuído sob Creative Commons
            Atribuição. Ao reusar este conjunto, credite o Puxa Ficha e a fonte específica de cada campo.
          </p>
          <p>
            Este conjunto cobre identidade e situação da candidatura. Para sites declarados, composição de chapa e
            processos com prova de fonte por candidato, veja a <Link href="/imprensa">Mesa de apuração</Link>.
          </p>
        </section>
      </main>
    </div>
  )
}
