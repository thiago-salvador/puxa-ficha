// cspell:words homonimos correcoes
import type { Metadata } from "next"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { DataStateLegend } from "@/components/imprensa/DataStateLegend"
import { ImprensaSubnav } from "@/components/imprensa/ImprensaSubnav"
import { TrustFooter } from "@/components/imprensa/TrustFooter"
import { MethodSection } from "@/components/imprensa/method/MethodSection"
import { SourcesTable } from "@/components/imprensa/method/SourcesTable"
import { StateBoard } from "@/components/imprensa/method/StateBoard"
import styles from "@/components/imprensa/method/method.module.css"
import { getImprensaDatasetCached, type ImprensaPageDataset } from "@/lib/imprensa-cache"
import { computeImprensaFacts } from "@/lib/imprensa-facts"
import { computeMethodStateBoard } from "@/lib/imprensa-frescor"
import { getImprensaMethodFreshness, type ImprensaMethodFreshness } from "@/lib/imprensa-frescor-server"
import { imprensaHref } from "@/lib/imprensa-nav"

export const metadata: Metadata = {
  title: "Como coletamos | Puxa Ficha",
  description: "De onde vem cada dado das fichas, quando foi a última coleta de cada fonte e como tratamos homônimos e correções.",
  alternates: { canonical: "/imprensa/frescor" },
}
// A tabela lê a última coleta de cada fonte a cada visita.
export const dynamic = "force-dynamic"

const REPO_URL = "https://github.com/thiago-salvador/puxa-ficha"
const NUMBER = new Intl.NumberFormat("pt-BR")

async function loadFreshness(): Promise<ImprensaMethodFreshness | null> {
  try {
    return await getImprensaMethodFreshness()
  } catch {
    return null
  }
}

async function loadDataset(): Promise<ImprensaPageDataset | null> {
  try {
    return await getImprensaDatasetCached({ cargo: null, uf: null })
  } catch {
    return null
  }
}

export default async function ImprensaComoColetamosPage() {
  const [freshness, dataset] = await Promise.all([loadFreshness(), loadDataset()])
  const facts = dataset ? computeImprensaFacts(dataset.rows) : null
  const board = dataset ? computeMethodStateBoard(dataset.rows) : null
  const homonimos = facts ? facts.processos.indeterminado : null
  const counts = freshness
    ? {
        emDia: freshness.rows.filter((row) => row.situacao === "em_dia").length,
        atrasada: freshness.rows.filter((row) => row.situacao === "atrasada").length,
        semRegistro: freshness.rows.filter((row) => row.situacao === "sem_registro").length,
      }
    : null

  return (
    <div className={styles.page}>
      <ImprensaSubnav current="frescor" generatedAt={dataset?.generatedAt ?? null} />
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Imprensa · Método</p>
          <h1 className={styles.heroTitle}>Como coletamos</h1>
          <p className={styles.heroCopy}>
            De onde vem cada dado das fichas, quando cada fonte foi lida pela última vez e o que fazemos quando um nome aparece sem confirmação. Depois do 1º turno, a coleta segue só para as fichas dos finalistas do 2º turno; as demais ficam com os dados da última coleta.
          </p>
          {counts ? (
            <p className={styles.heroFacts}>
              <span><strong>{counts.emDia}</strong> de {freshness?.rows.length} fontes em dia</span>
              <span><strong>{counts.atrasada}</strong> {counts.atrasada === 1 ? "atrasada" : "atrasadas"}</span>
              {counts.semRegistro > 0 ? <span><strong>{counts.semRegistro}</strong> sem registro de coleta</span> : null}
            </p>
          ) : null}
        </div>
      </header>

      <div className={styles.content}>
        <MethodSection id="fontes" num="01" title="Fontes e última coleta">
          <p className={styles.lead}>
            Cada linha é uma fonte oficial usada nas fichas. A data é a da última coleta que terminou sem erro. A fonte está em dia quando essa coleta cabe no prazo previsto para ela, e atrasada quando passou dele.
          </p>
          <div className="mt-6">
            {freshness ? (
              <SourcesTable rows={freshness.rows} />
            ) : (
              <p className={styles.alert} role="alert">
                <strong>Não foi possível consultar as coletas agora.</strong>
                Isso não quer dizer que as fontes estejam sem coleta. Tente de novo em alguns minutos.
              </p>
            )}
          </div>
          <p className={styles.note}>
            Não registramos, por fonte, quando a ficha foi atualizada depois da coleta. A data mostra quando a fonte foi lida, não quando cada ficha mudou.
          </p>
        </MethodSection>

        <MethodSection id="estados" num="02" title="Os quatro estados do dado">
          <p className={styles.lead}>
            Cada dado da ficha está em um de quatro estados. A mesma palavra e a mesma cor aparecem em toda a seção de imprensa.
          </p>
          <div className="mt-5">
            <DataStateLegend detailed />
          </div>
          {board && dataset ? (
            <>
              <p className={`${styles.lead} mt-6`}>
                Hoje, entre <span className={styles.num}>{NUMBER.format(dataset.rows.length)}</span> fichas publicadas:
              </p>
              <StateBoard rows={board} total={dataset.rows.length} />
            </>
          ) : (
            <p className={styles.note}>A contagem por estado está indisponível agora. Uma falha de consulta não equivale a zero.</p>
          )}
        </MethodSection>

        <MethodSection id="homonimos" num="03" title="Homônimos">
          {homonimos !== null ? (
            <div className={styles.figureRow}>
              <span className={styles.figure}>{NUMBER.format(homonimos)}</span>
              <span className={styles.figureLabel}>
                {homonimos === 1
                  ? "candidato teve um nome igual encontrado na busca de processos, sem confirmação de que é a mesma pessoa."
                  : "candidatos tiveram um nome igual encontrado na busca de processos, sem confirmação de que é a mesma pessoa."}
              </span>
            </div>
          ) : null}
          <p className={styles.lead}>
            A busca de processos procura pelo nome do candidato. Nome igual não basta: um processo só é publicado quando um segundo dado oficial confirma que é a mesma pessoa.
          </p>
          <p className={styles.lead}>
            Sem essa confirmação, o processo fica fora da ficha, e a ficha avisa que a busca não conseguiu ligar o registro à pessoa com segurança. Isso não quer dizer que o candidato não tenha processos.
          </p>
        </MethodSection>

        <MethodSection id="tse" num="04" title="Arquivos do TSE e SHA-256">
          <p className={styles.lead}>
            Os arquivos que baixamos do TSE ficam guardados com o hash SHA-256 de cada um. O hash é uma sequência de letras e números que muda se o arquivo mudar em um único byte. Com ele, dá para baixar o mesmo arquivo do TSE e conferir se é o que usamos.
          </p>
          <p className={styles.lead}>
            O endereço do arquivo e o hash aparecem nas exportações da{" "}
            <Link className={styles.link} href={imprensaHref("/imprensa/mesa")}>Mesa</Link>, nas colunas de fonte de sites e de chapas.
          </p>
        </MethodSection>

        <MethodSection id="correcoes" num="05" title="Correções">
          <ol className={styles.steps}>
            <li>Escreva para <span className={styles.email}>contato@puxaficha.com.br</span> com o nome do candidato, o dado que parece errado e, se tiver, o documento oficial que mostra o valor certo.</li>
            <li>Conferimos o dado na fonte oficial. Se a ficha estiver errada, ela é corrigida.</li>
            <li>
              As mudanças no código e nas regras ficam públicas no{" "}
              <a className={styles.link} href={REPO_URL} target="_blank" rel="noreferrer">repositório do projeto no GitHub<span className="sr-only"> (abre em nova aba)</span></a>
              , onde também dá para abrir uma issue.
            </li>
          </ol>
          <p className={styles.note}>
            Mudanças de situação, patrimônio ou partido detectadas nas fontes oficiais ficam em{" "}
            <Link className={styles.link} href={imprensaHref("/imprensa/atualizacoes")}>O que mudou</Link>.
          </p>
        </MethodSection>
      </div>

      <TrustFooter homonimos={homonimos} />
      <Footer />
    </div>
  )
}
