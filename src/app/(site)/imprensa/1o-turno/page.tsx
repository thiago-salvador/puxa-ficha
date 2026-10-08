import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"
import { ImprensaFacts } from "@/components/imprensa/ImprensaFacts"
import { ImprensaSubnav } from "@/components/imprensa/ImprensaSubnav"
import { TrustFooter } from "@/components/imprensa/TrustFooter"
import { buildSalaPromise, countSalaRecortes } from "@/components/imprensa/sala/sala-model"
import { getImprensaDatasetCached, type ImprensaPageDataset } from "@/lib/imprensa-cache"
import { normalizeImprensaFilters } from "@/lib/imprensa-data"
import { computeImprensaFacts } from "@/lib/imprensa-facts"
import { imprensaHref, imprensaUfPath } from "@/lib/imprensa-nav"
import { getImprensaUfName, IMPRENSA_UFS } from "@/lib/imprensa-uf-pack"
import { isSenadoEnabled } from "@/lib/senado-feature"
import styles from "../sala.module.css"

// cspell:words presidencia homonimos confianca

// Mesmo frescor da Sala e dos pacotes (dataset em cache de 12 h).
export const revalidate = 43200

export const metadata: Metadata = {
  title: "Arquivo do 1º turno | Imprensa | Puxa Ficha",
  description: "Arquivo do 1º turno de 2026 na sala de imprensa do Puxa Ficha: fatos e pacotes de todos os candidatos a presidente, governador e Senado, com fonte oficial e data de coleta.",
  alternates: { canonical: "/imprensa/1o-turno" },
}

const NUMBER = new Intl.NumberFormat("pt-BR")

function candidatos(total: number): string {
  return `${NUMBER.format(total)} ${total === 1 ? "candidato" : "candidatos"}`
}

/**
 * A Sala como era até o fim do 1º turno: todos os candidatos com linha pública,
 * os fatos calculados sobre eles e os pacotes com a contagem completa.
 */
export default async function ImprensaArquivo1Turno() {
  const senateEnabled = isSenadoEnabled()
  const dataset = await getImprensaDatasetCached(normalizeImprensaFilters({})).then(
    (value): ImprensaPageDataset | null => value,
    () => null,
  )
  const rows = dataset?.rows ?? []
  const facts = dataset ? computeImprensaFacts(rows) : null
  const recortes = dataset ? countSalaRecortes(rows) : null
  const promiseCargos = facts
    ? facts.porCargo.map((item) => item.cargo)
    : senateEnabled ? ["Presidente", "Governador", "Senador"] : ["Presidente", "Governador"]
  const todos = { turno: null } as const

  return (
    <div className={styles.shell}>
      <ImprensaSubnav current="arquivo" recorte={todos} generatedAt={dataset?.generatedAt ?? null} />

      <header className={styles.hero}>
        <Image src="/images/hero-dossie.webp" alt="" fill sizes="100vw" loading="eager" className={styles.heroImage} />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Arquivo · Eleições 2026</p>
          <h1 className={styles.heroTitle}>1º turno</h1>
          <p className={styles.heroCopy}>{buildSalaPromise(dataset ? rows.length : null, promiseCargos)}</p>
          <nav aria-label="Arquivo do 1º turno" className={styles.heroButtons}>
            <Link className={styles.pill} href="/1o-turno">Resultado oficial do TSE <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
            <Link className={styles.pillGhost} href={imprensaHref("/imprensa")}>Voltar ao 2º turno <ArrowRight aria-hidden="true" className={styles.arrow} /></Link>
          </nav>
          <SlashDivider className={styles.heroDivider} color="text-white" />
          <div role="note" className={styles.heroNotice}>
            <strong>Depois do 1º turno, só as fichas dos finalistas continuam sendo atualizadas.</strong>
            <span>As demais ficam com os dados da última coleta, e cada ficha mostra até quando foi atualizada.</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <section id="numeros" className={styles.section} aria-labelledby="arquivo-numeros-title">
          <SectionHead num="01" id="arquivo-numeros-title">Todos os candidatos</SectionHead>
          <p className={styles.lead}>Os mesmos fatos da Sala, calculados sobre todos os candidatos com linha pública na Mesa, inclusive quem saiu da disputa e os eleitos no 1º turno. O link abre a Mesa com todos os candidatos.</p>
          <div className={styles.block}>
            {facts
              ? <ImprensaFacts facts={facts} scopeLabel="Brasil · 1º turno" recorte={todos} linkToMesa />
              : <Unavailable title="Fatos indisponíveis agora">Não foi possível consultar a base da Mesa. Uma falha de consulta não significa zero.</Unavailable>}
          </div>
        </section>

        <SlashDivider />

        <section id="pacotes" className={styles.section} aria-labelledby="arquivo-pacotes-title">
          <SectionHead num="02" id="arquivo-pacotes-title">Pacotes do 1º turno</SectionHead>
          <p className={styles.lead}>O número é de candidatos com linha pública na Mesa. Cada pacote abre com quem segue no 2º turno e traz, no fim, o histórico do 1º turno com os demais candidatos.</p>
          {recortes ? null : <Unavailable title="Contagens indisponíveis agora">Os pacotes continuam abertos. Uma falha de consulta não significa que o estado não tem candidatos.</Unavailable>}
          <ul className={styles.ufGrid} aria-label="Pacotes do 1º turno">
            <li className={styles.ufPresidencia}>
              <Link href={`${imprensaHref("/imprensa/presidencia")}#historico-1turno`} className={styles.ufLink}>
                <span className={styles.ufCode}>Presidência</span>
                <span className={styles.ufName}>Candidatos a presidente, sem UF</span>
                {recortes ? <span className={styles.ufCount}>{candidatos(recortes.presidencia)}</span> : null}
              </Link>
            </li>
            {IMPRENSA_UFS.map((uf, index) => (
              <li key={uf}>
                <Link href={`${imprensaUfPath(uf)}#historico-1turno`} className={styles.ufLink}>
                  <span className={styles.ufCode}>{uf}</span>
                  <span className={styles.ufName}>{getImprensaUfName(uf)}</span>
                  {recortes ? <span className={styles.ufCount}>{candidatos(recortes.ufs[index].total)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <SlashDivider />

        <section id="baixar" className={styles.section} aria-labelledby="arquivo-baixar-title">
          <SectionHead num="03" id="arquivo-baixar-title">Baixar o 1º turno</SectionHead>
          <p className={styles.lead}>Todas as linhas da Mesa, com o estado de cada dado: <a className={styles.inlineLink} href="/api/imprensa/export?format=csv" download>CSV</a> ou <a className={styles.inlineLink} href="/api/imprensa/export?format=json" download>JSON</a>. O resultado de cada disputa, com os votos e a fonte do TSE, está em <Link className={styles.inlineLink} href="/1o-turno">Resultado do 1º turno</Link>.</p>
        </section>
      </div>

      <div id="confianca" className={styles.trustWrap}>
        <TrustFooter homonimos={facts ? facts.processos.indeterminado : null} />
      </div>
    </div>
  )
}

function SectionHead({ num, id, children }: { num: string; id: string; children: React.ReactNode }) {
  return <div className={styles.sectionHead}><span className={styles.sectionNum} aria-hidden="true">{num}</span><h2 id={id} className={styles.sectionTitle}>{children}</h2></div>
}

function Unavailable({ title, children }: { title: string; children: React.ReactNode }) {
  return <div role="status" className={styles.unavailable}><strong>{title}</strong><p>{children}</p></div>
}
