import { existsSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { Footer } from "@/components/Footer"
import { CiteBox } from "@/components/imprensa/CiteBox"
import { ImprensaSubnav } from "@/components/imprensa/ImprensaSubnav"
import { TrustFooter } from "@/components/imprensa/TrustFooter"
import { CopyText } from "@/components/imprensa/kit/CopyText"
import { getImprensaDatasetCached, type ImprensaPageDataset } from "@/lib/imprensa-cache"
import { computeImprensaFacts } from "@/lib/imprensa-facts"
import { citationFormats, founderBio, kitNumbers, kitOneLine, kitPressTexts, kitQuestions, projectCitation } from "./content"
import styles from "./kit.module.css"

// cspell:ignore apresentacao homonimos

export const metadata: Metadata = {
  title: "Kit de imprensa | Puxa Ficha",
  description: "Uma frase para citar o Puxa Ficha, textos de apresentação com os números atuais, formatos de citação, arquivos e perguntas frequentes.",
  alternates: { canonical: "/imprensa/kit" },
}

const CONTACT_EMAIL = "contato@puxaficha.com.br"

const optionalAssets = [
  { href: "/imprensa/bio.txt", label: "Baixar bio" },
  { href: "/imprensa/logo.svg", label: "Baixar logo SVG (fundo claro)" },
  { href: "/imprensa/logo-branco.svg", label: "Baixar logo SVG (fundo escuro)" },
].filter(({ href }) => existsSync(join(process.cwd(), "public", href.slice(1))))

const sections = [
  { id: "frase", label: "Uma frase" },
  { id: "textos", label: "Textos" },
  { id: "citar", label: "Como citar" },
  { id: "imagens", label: "Imagens e arquivos" },
  { id: "quem-faz", label: "Quem faz" },
  { id: "perguntas", label: "Perguntas" },
  { id: "contato", label: "Contato" },
] as const

function Section({ index, id, title, children }: { index: number; id: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.section} id={id} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <p className={styles.sectionNumber} aria-hidden="true">{String(index).padStart(2, "0")}</p>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default async function ImprensaKit() {
  let dataset: ImprensaPageDataset | null = null
  try {
    dataset = await getImprensaDatasetCached({ cargo: null, uf: null })
  } catch {
    // Sem dataset, os textos saem sem números. Nunca com zero no lugar do dado.
  }
  const numbers = kitNumbers(dataset ? computeImprensaFacts(dataset.rows) : null, dataset?.generatedAt)
  const texts = kitPressTexts(numbers)
  const questions = kitQuestions(numbers)

  return (
    <>
      <main className={styles.shell}>
        <ImprensaSubnav current="kit" generatedAt={dataset?.generatedAt ?? null} />
        <header className={styles.hero}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>Puxa Ficha · material para redações</p>
            <h1>Kit de imprensa</h1>
            <p className={styles.lead}>Uma frase para citar o projeto, textos prontos com os números atuais, formatos de citação, arquivos para baixar e respostas às perguntas mais comuns.</p>
          </div>
        </header>

        <div className={styles.wrap}>
          <nav className={styles.jump} aria-label="Seções do kit">
            {sections.map(({ id, label }) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>

          <Section index={1} id="frase" title="O Puxa Ficha em uma frase">
            <p className={styles.oneLine}>{kitOneLine(numbers)}</p>
            {numbers ? null : <p className={styles.sourceNote}>Os números não estão disponíveis neste momento. A frase aparece sem eles até a próxima consulta aos dados.</p>}
            <div className={styles.citeSlot}>
              <CiteBox citation={projectCitation} label="Citação do projeto" />
            </div>
          </Section>

          <Section index={2} id="textos" title="Textos de apresentação">
            <p className={styles.intro}>
              Três tamanhos, com os números calculados a partir dos dados publicados no site
              {numbers?.data ? <> em <span className={styles.num}>{numbers.data}</span></> : null}. Os números mudam quando os dados são atualizados: copie o texto no dia em que for usar.
            </p>
            <div className={styles.textGrid}>
              {texts.map(({ id, label, paragraphs }) => <CopyText key={id} label={label} paragraphs={paragraphs} />)}
            </div>
          </Section>

          <Section index={3} id="citar" title="Como citar">
            <p className={styles.intro}>Três níveis: o projeto, o pacote de um estado e o dado de um candidato. Os trechos entre &lt; &gt; indicam o formato; troque cada um pelo dado da sua consulta. Cite também o órgão oficial que publicou o dado.</p>
            <div className={styles.citeGrid}>
              {citationFormats.map(({ label, citation }) => <CiteBox key={label} citation={citation} label={label} />)}
            </div>
          </Section>

          <Section index={4} id="imagens" title="Imagens e arquivos">
            <p className={styles.intro}>Capturas da Sala e uma versão em PDF de uma página, gerada a partir da própria Sala. A página ao vivo pode mostrar dados mais recentes.</p>
            <div className={styles.assetGrid}>
              <a className={styles.asset} href="/imprensa/sala-desktop.png" download>
                <Image src="/imprensa/sala-desktop.png" width={1440} height={2613} sizes="(max-width: 800px) 100vw, 60vw" alt="Prévia da Sala de imprensa no desktop" loading="lazy" />
                <span>Baixar captura desktop <b>PNG ↗</b></span>
              </a>
              <a className={styles.asset} href="/imprensa/sala-celular.png" download>
                <Image src="/imprensa/sala-celular.png" width={375} height={2711} sizes="(max-width: 800px) 100vw, 35vw" alt="Prévia da Sala de imprensa no celular" loading="lazy" />
                <span>Baixar captura celular <b>PNG ↗</b></span>
              </a>
              <a className={styles.pdfAsset} href="/imprensa/sala-de-imprensa.pdf" download>
                <strong>PDF</strong><span>Sala de imprensa<br />Uma página para consulta e referência</span><b>Baixar ↗</b>
              </a>
            </div>
            {optionalAssets.length > 0 ? (
              <nav className={styles.optionalAssets} aria-label="Materiais de imprensa">
                {optionalAssets.map(({ href, label }) => <a key={href} href={href} download>{label} ↗</a>)}
              </nav>
            ) : null}
          </Section>

          <Section index={5} id="quem-faz" title="Quem faz">
            <p className={styles.bio}>{founderBio}</p>
            <p className={styles.sourceNote}>Financiamento, perspectiva editorial e método estão na página <Link href="/sobre">Sobre</Link> e em <Link href="/metodologia">Metodologia</Link>.</p>
          </Section>

          <Section index={6} id="perguntas" title="Perguntas frequentes">
            <div className={styles.faq}>
              {questions.map(({ question, answer, sourceHref, sourceLabel }) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}{sourceHref && sourceLabel ? <> <Link href={sourceHref}>{sourceLabel}</Link>.</> : null}</p>
                </details>
              ))}
            </div>
          </Section>

          <Section index={7} id="contato" title="Contato">
            <p className={styles.contactEmail}><span className={styles.email}>{CONTACT_EMAIL}</span></p>
            <p className={styles.contactLink}><a href={`mailto:${CONTACT_EMAIL}`}>Escrever para {CONTACT_EMAIL}</a></p>
            <h3 className={styles.contactTitle}>Para pedir uma correção, envie</h3>
            <ul className={styles.contactList}>
              <li>O link da ficha ou da página em que o dado aparece.</li>
              <li>O trecho ou o número que precisa de correção.</li>
              <li>O documento oficial ou o link da fonte que mostra o dado correto.</li>
            </ul>
            <p className={styles.sourceNote}>Para apurar candidaturas, abra a <Link href="/imprensa/mesa">Mesa de apuração</Link>. Consulte também a <Link href="/privacidade">Política de privacidade</Link>.</p>
          </Section>
        </div>

        <TrustFooter homonimos={numbers?.homonimos ?? null} />
      </main>
      <Footer />
    </>
  )
}
