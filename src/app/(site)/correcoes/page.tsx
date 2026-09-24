import type { Metadata } from "next"
import Link from "next/link"
import { getCorrecoesRecentesCached } from "@/lib/correcoes-recentes-cache"
import styles from "./correcoes.module.css"

export const metadata: Metadata = {
  title: "Correções recentes | Puxa Ficha",
  description:
    "A trilha pública de correções de dados do Puxa Ficha: o que mudou, quando e a partir de qual fonte.",
}

function dateTimeLabel(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) return value
  return parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default async function CorrecoesRecentesPage() {
  let correcoes: Awaited<ReturnType<typeof getCorrecoesRecentesCached>> = []
  let sourceError: string | null = null
  try {
    correcoes = await getCorrecoesRecentesCached(50)
  } catch {
    sourceError = "A consulta pública está indisponível no momento."
  }

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Puxa Ficha · transparência</p>
          <h1 className={styles.heroTitle}>Correções recentes</h1>
          <p className={styles.heroCopy}>
            Nenhuma fonte é perfeita na primeira coleta, e o TSE também corrige registros depois de publicados.
            Esta página lista as últimas mudanças que o Puxa Ficha fez em dados já publicados, com data e fonte —
            para que o leitor não precise confiar, só conferir.
          </p>
        </div>
      </section>

      <main className={styles.content}>
        <p className={styles.meta}>
          {sourceError
            ? "contagem indisponível"
            : `${correcoes.length} ${correcoes.length === 1 ? "correção recente" : "correções recentes"}`}
        </p>

        {sourceError ? (
          <section className={styles.notice} role="alert">
            <strong>Não foi possível consultar a fonte.</strong> {sourceError} Tente novamente mais tarde. Uma
            falha de consulta não significa ausência de correções.
          </section>
        ) : correcoes.length === 0 ? (
          <section className={styles.notice} role="status">
            <strong>Nenhuma correção registrada neste recorte.</strong> Isto não significa que nada foi corrigido
            fora da janela mostrada aqui.
          </section>
        ) : (
          <ul className={styles.list}>
            {correcoes.map((correcao) => (
              <li key={correcao.id} className={styles.item}>
                <div className={styles.itemHead}>
                  {correcao.candidato ? (
                    <Link className={styles.itemCandidato} href={`/candidato/${correcao.candidato.slug}`}>
                      {correcao.candidato.nome}
                    </Link>
                  ) : (
                    <span className={styles.itemCandidato}>Correção geral</span>
                  )}
                  <time className={styles.itemDate} dateTime={correcao.executadoEm}>
                    {dateTimeLabel(correcao.executadoEm)}
                  </time>
                </div>
                <p className={styles.itemAlvo}>
                  {correcao.alvo} · fonte: {correcao.fonte}
                </p>
                {correcao.resumo ? (
                  <p className={styles.itemResumo}>{correcao.resumo}</p>
                ) : (
                  <p className={styles.itemResumoVazio}>
                    Sem resumo padronizado para exibição automática nesta linha.
                  </p>
                )}
                {(correcao.url || correcao.execucao) && (
                  <div className={styles.itemLinks}>
                    {correcao.url && (
                      <a href={correcao.url} rel="noreferrer">
                        Fonte consultada
                      </a>
                    )}
                    {correcao.execucao && <span className={styles.itemAlvo}>ref: {correcao.execucao}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <section className={styles.footnote}>
          <p>
            Esta lista mostra as últimas mudanças de dado já publicado, registradas como <code>natureza=&quot;escrita&quot;</code>{" "}
            em <code>coleta_log</code> — distinto de tentativa de coleta. Correção sem candidato nomeado afeta
            registro que não está mais publicado; a identidade não é reafirmada aqui. Ausência de resumo não
            significa correção pequena: significa que a linha não trouxe um resumo em formato padronizado.
          </p>
          <p className="mt-2">
            Para a metodologia completa de fontes, veja <Link href="/metodologia">Metodologia e fontes</Link>. Para
            baixar o cadastro público em lote, veja <Link href="/dados-abertos">Dados abertos</Link>.
          </p>
        </section>
      </main>
    </div>
  )
}
