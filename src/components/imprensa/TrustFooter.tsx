// cspell:words homonimos homonimo confianca
import Link from "next/link"
import styles from "./imprensa-shell.module.css"

const NUMBER = new Intl.NumberFormat("pt-BR")

/**
 * Rodapé de confiança, igual em todas as páginas da seção. `homonimos` é a
 * contagem de buscas de processo sem confirmação de identidade no recorte;
 * sem ela, o texto fica sem número.
 */
export function TrustFooter({ homonimos }: { homonimos?: number | null }) {
  const homonimoText = typeof homonimos === "number"
    ? `${NUMBER.format(homonimos)} ${homonimos === 1 ? "busca de processo achou um nome igual" : "buscas de processo acharam nomes iguais"} sem um segundo dado oficial que confirme a pessoa. Nenhum desses processos foi publicado.`
    : "Quando a busca de processo acha um nome igual sem um segundo dado oficial que confirme a pessoa, o processo não é publicado."
  return (
    <footer className={`${styles.tokens} ${styles.trust}`} aria-labelledby="imprensa-confianca-title">
      <h2 id="imprensa-confianca-title" className={styles.trustTitle}>Por que dá para citar</h2>
      <div className={styles.trustGrid}>
        <div>
          <h3>Fonte oficial em cada dado</h3>
          <p>Todo número tem link para o documento do órgão oficial e a data em que foi coletado.</p>
        </div>
        <div>
          <h3>Homônimo não é publicado</h3>
          <p>{homonimoText}</p>
        </div>
        <div>
          <h3>Arquivo do TSE com SHA-256</h3>
          <p>Os arquivos do TSE são guardados com hash SHA-256, e dá para conferir se o dado veio de lá.</p>
        </div>
        <div>
          <h3>Aberto e corrigível</h3>
          <p>O código é aberto, sob a licença Apache 2.0. As correções são públicas.</p>
        </div>
      </div>
      <p className={styles.trustContact}>
        Para apontar um erro ou falar com a equipe: <span className={styles.email}>contato@puxaficha.com.br</span>
      </p>
      <nav className={styles.trustLinks} aria-label="Método">
        <Link href="/metodologia">Metodologia e fontes</Link>
        <Link href="/imprensa/frescor">Como coletamos</Link>
      </nav>
    </footer>
  )
}
