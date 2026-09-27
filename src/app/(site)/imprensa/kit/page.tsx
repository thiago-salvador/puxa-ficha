import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { pressTexts, questions, serviceLine } from "./content"
import styles from "./kit.module.css"

// cspell:ignore apresentacao

export const metadata: Metadata = {
  title: "Kit de imprensa | Puxa Ficha",
  description: "Textos, imagens e perguntas frequentes para apresentar o Puxa Ficha com seus limites e fontes.",
  alternates: { canonical: "/imprensa/kit" },
}

const notice = "Confira os dados na fonte original antes de publicar."

export default function ImprensaKit() {
  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <Link className={styles.back} href="/imprensa">← Sala de imprensa</Link>
          <p className={styles.eyebrow}>Puxa Ficha · material para redações</p>
          <h1>Kit de imprensa</h1>
          <p className={styles.lead}>{serviceLine}</p>
          <p className={styles.notice}>{notice}</p>
        </div>
      </header>

      <div className={styles.wrap}>
        <nav className={styles.jump} aria-label="Seções do kit">
          <a href="#apresentacao">Apresentação</a>
          <a href="#textos">Textos prontos</a>
          <a href="#imagens">Imagens e PDF</a>
          <a href="#perguntas">Perguntas difíceis</a>
        </nav>

        <section className={styles.section} id="apresentacao" aria-labelledby="apresentacao-title">
          <p className={styles.sectionNumber}>01 / Uso</p>
          <h2 id="apresentacao-title">O que é e o que não é</h2>
          <div className={styles.twoColumns}>
            <div><h3>O que é</h3><p>Uma porta de entrada para consultar candidaturas, localizar fontes oficiais e entender o estado de cada dado publicado.</p></div>
            <div><h3>O que não é</h3><p>Uma recomendação de voto, uma conclusão sobre pessoas ou um substituto para a conferência do documento original.</p></div>
          </div>
          <p className={styles.sourceNote}>Para informações sobre o projeto, sua perspectiva editorial e seu financiamento, consulte a página <Link href="/sobre">Sobre</Link>.</p>
        </section>

        <section className={styles.section} id="textos" aria-labelledby="textos-title">
          <p className={styles.sectionNumber}>02 / Copiar com contexto</p>
          <h2 id="textos-title">Textos de apresentação</h2>
          <p className={styles.intro}>Três versões para apresentar o serviço. Mantenha o aviso de conferência quando usar uma delas junto de dados da plataforma.</p>
          <div className={styles.textGrid}>
            {pressTexts.map(({ label, text }) => (
              <article className={styles.textCard} key={label}>
                <h3>{label}</h3>
                {text.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} id="imagens" aria-labelledby="imagens-title">
          <p className={styles.sectionNumber}>03 / Arquivos</p>
          <h2 id="imagens-title">Imagens e PDF</h2>
          <p className={styles.intro}>Capturas da Sala e uma versão em PDF de uma página, gerada a partir da própria Sala. A página ao vivo pode mostrar dados mais recentes.</p>
          <div className={styles.assetGrid}>
            <a className={styles.asset} href="/imprensa/sala-desktop.png" download>
              <Image src="/imprensa/sala-desktop.png" width={1440} height={1100} alt="Prévia da Sala de imprensa no desktop" loading="eager" unoptimized />
              <span>Baixar captura desktop <b>PNG ↗</b></span>
            </a>
            <a className={styles.asset} href="/imprensa/sala-celular.png" download>
              <Image src="/imprensa/sala-celular.png" width={375} height={1400} alt="Prévia da Sala de imprensa no celular" loading="eager" unoptimized />
              <span>Baixar captura celular <b>PNG ↗</b></span>
            </a>
            <a className={styles.pdfAsset} href="/imprensa/sala-de-imprensa.pdf" download>
              <strong>PDF</strong><span>Sala de imprensa<br />Uma página para consulta e referência</span><b>Baixar ↗</b>
            </a>
          </div>
          <div className={styles.pending} aria-label="Materiais em preparação">
            <h3>Em preparação</h3>
            <p>Espaços reservados para a bio aprovada, a foto e o logo em SVG. Esses três arquivos ainda não integram o kit.</p>
            <div className={styles.pendingSlots}><span>Bio</span><span>Foto</span><span>Logo SVG</span></div>
          </div>
        </section>

        <section className={styles.section} id="perguntas" aria-labelledby="perguntas-title">
          <p className={styles.sectionNumber}>04 / Contexto</p>
          <h2 id="perguntas-title">Perguntas frequentes e difíceis</h2>
          <div className={styles.faq}>
            {questions.map(({ question, answer }) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <p className={styles.sourceNote}>Dúvidas ou correções: <a href="mailto:contato@puxaficha.com.br">contato@puxaficha.com.br</a>. Para apurar candidaturas, abra a <Link href="/imprensa/mesa">Mesa de apuração</Link>. Consulte também a <Link href="/privacidade">Política de privacidade</Link>.</p>
        </section>
      </div>
    </main>
  )
}
