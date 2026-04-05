import type { Metadata } from "next"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Metodologia do quiz — Puxa Ficha"
const description =
  "Como calculamos o alinhamento no quiz Quem me representa: votações, espectro partidário, posições declaradas e projetos de lei."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/quiz/metodologia" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/quiz/metodologia",
  },
  twitter: buildTwitterMetadata({ title, description }),
}

export const revalidate = 3600

export default function QuizMetodologiaPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <nav className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
          <Link href="/quiz" className="hover:text-foreground">
            Quiz
          </Link>
          <Link href="/" className="hover:text-foreground">
            Início
          </Link>
        </nav>
      </header>

      <article className="mx-auto max-w-2xl space-y-8 px-4 py-12">
        <header className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Transparência</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Metodologia do quiz</h1>
          <p className="text-muted-foreground">
            O quiz cruza dados públicos e um modelo editorial em evolução. Não é recomendação de voto nem previsão
            eleitoral.
          </p>
        </header>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">O que entra no score (versão atual)</h2>
          <p>
            O resultado final (0 a 100) combina quatro famílias de sinal. Se alguma não existe para um candidato, o
            peso dela é redistribuído para as outras, proporcionalmente.
          </p>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            <li>
              <strong className="text-foreground">Votações no Congresso</strong>, quando a pergunta mapeia uma votação
              chave e o candidato tem voto registrado. Com poucos votos comparáveis, o modelo dá mais peso ao espectro do
              partido.
            </li>
            <li>
              <strong className="text-foreground">Espectro partidário</strong>: posição aproximada do partido em eixos
              econômico e social (arquivo editorial no repositório, em revisão).
            </li>
            <li>
              <strong className="text-foreground">Posições declaradas</strong>: temas curados na base, apenas com{" "}
              <code className="rounded bg-muted px-1 text-sm">verificado = true</code>. Sem curadoria suficiente, essa
              parcela fica vazia e some do cálculo daquele candidato.
            </li>
            <li>
              <strong className="text-foreground">Projetos de lei por tema</strong>: autoria agregada por tema, comparada
              entre candidatos do mesmo recorte (ex.: presidente ou governador da UF).
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Pesos de referência (fase com posições e projetos)</h2>
          <p className="text-muted-foreground">
            Dentro da parte que mistura votos e espectro, usamos uma divisão dinâmica conforme quantas votações da lista
            do quiz existem para aquele candidato. Sobre o total, a referência é:
          </p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>em torno de 68% para o bloco votos + espectro (combinados),</li>
            <li>em torno de 21% para posições declaradas quando houver dados,</li>
            <li>em torno de 11% para projetos por tema quando houver dados.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Privacidade e link compartilhado</h2>
          <p className="text-muted-foreground">
            Suas respostas não são enviadas ao servidor. O link de resultado codifica apenas as respostas do quiz
            (versão do schema incluída). Qualquer pessoa com o link pode reconstruir o ranking no navegador.
          </p>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Detalhes e comparador</h2>
          <p className="text-muted-foreground">
            No resultado, dá para abrir o detalhamento por candidato (eixos, concordâncias e divergências de voto,
            alertas de contradição registrada, mudanças de partido). O atalho{" "}
            <strong className="text-foreground">Comparar os 2 mais alinhados</strong> leva ao comparador com esses dois
            pré-selecionados.
          </p>
        </section>
      </article>

      <Footer />
    </div>
  )
}
