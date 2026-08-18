import type { Metadata } from "next"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { QUIZ_FINANCIAMENTO_REGRAS_VERSION } from "@/data/quiz/financiamento-setores"
import { collectQuizVotacaoTitulos, quizPerguntasOrdenadas, QUIZ_PERGUNTAS } from "@/data/quiz/perguntas"
import { buildTwitterMetadata } from "@/lib/metadata"

const titulosVotacaoQuiz = collectQuizVotacaoTitulos(QUIZ_PERGUNTAS)
const perguntasOrdenadas = quizPerguntasOrdenadas()
const perguntasSemVotacaoNominal = perguntasOrdenadas.filter((p) => !(p.votacao_titulos && p.votacao_titulos.length > 0))

const title = "Metodologia do quiz | Puxa Ficha"
const description =
  "Como funciona a comparação do quiz Quem me representa: votações, espectro, posições declaradas, projetos de lei e financiamento, sem ranking ou recomendação de voto."

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

// Inerte hoje: o `await headers()` do nonce de CSP no RootLayout torna a
// árvore inteira dinâmica e nenhuma rota pública gera ISR (medido em produção
// em 2026-08-04: x-vercel-cache MISS e cache-control no-store em todas). O
// Data Cache do unstable_cache segue protegendo o Supabase. Este revalidate
// volta a valer quando a CSP migrar para hash + strict-dynamic (rota do PR
// #72, pós-lançamento); não remover sem conferir de novo com curl.
export const revalidate = 3600

export default function QuizMetodologiaPage() {
  return (
    <div className="min-h-screen bg-background pt-16">
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
            O quiz organiza dados públicos disponíveis e um modelo editorial em evolução para exibir
            candidatos em ordem alfabética. Não é recomendação de voto, ranking, sugestão,
            priorização de candidato nem previsão eleitoral.
          </p>
        </header>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">O que entra na comparação (versão atual)</h2>
          <p>
            O resultado combina cinco famílias de sinal documental para cada candidato. Esses sinais ajudam a explicar
            coincidências, divergências e limites de cobertura, mas não definem uma ordem de preferência entre
            candidatos.
          </p>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            <li>
              <strong className="text-foreground">Votações no Congresso</strong>, quando a pergunta mapeia uma votação
              chave e o candidato tem voto registrado. Com poucos votos comparáveis, o card indica base limitada e evita
              conclusão forte.
            </li>
            <li>
              <strong className="text-foreground">Espectro partidário</strong>: posição aproximada do partido em eixos
              econômico e social (arquivo editorial interno, em revisão).
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
            <li>
              <strong className="text-foreground">Financiamento (TSE)</strong>: quando há doadores classificados por
              setor com cobertura mínima sobre o total declarado, comparamos o centroide editorial desses doadores ao
              perfil que você declarou no quiz. As regras de setor e eixos estão versionadas em{" "}
              <code className="rounded bg-muted px-1 text-sm">src/data/quiz/financiamento-setores.ts</code> (versão{" "}
              <code className="rounded bg-muted px-1 text-sm">
                QUIZ_FINANCIAMENTO_REGRAS_VERSION = {QUIZ_FINANCIAMENTO_REGRAS_VERSION}
              </code>
              ). Sem classificação suficiente, essa parcela some para aquele candidato.
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Votações nominais mapeadas hoje</h2>
          <p className="text-muted-foreground">
            Estas votações vêm de <code className="rounded bg-muted px-1 text-sm">votacoes_chave</code> no banco. O título precisa
            coincidir exatamente com o que está no código do quiz. Conferência automática:{" "}
            <code className="rounded bg-muted px-1 text-sm">npx tsx scripts/check-quiz-votacoes-chave.ts</code>.
          </p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            {titulosVotacaoQuiz.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Perguntas ainda sem voto no Congresso no modelo</h2>
          <p className="text-muted-foreground">
            Nestas perguntas a comparação usa espectro partidário, posições declaradas (se houver) e eixos declarados
            por você, sem comparar voto nominal de plenário.
          </p>
          <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
            {perguntasSemVotacaoNominal.map((p) => (
              <li key={p.id}>
                <span className="text-foreground">{p.texto}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Financiamento de campanha</h2>
          <p className="text-muted-foreground">
            Os maiores doadores e totais declarados no TSE continuam no texto de contexto no detalhe. Além disso, quando a
            lista de doadores permite classificar setores com cobertura mínima (constante{" "}
            <code className="rounded bg-muted px-1 text-sm">QUIZ_FIN_COBERTURA_MINIMA</code> no código), a comparação pode
            mostrar um sinal limitado no detalhe. A classificação é editorial e versionada; mudanças de regra exigem bump
            de versão e revisão desta página.
          </p>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Pesos técnicos internos</h2>
          <p className="text-muted-foreground">
            Internamente, cada card calcula sinais normalizados para explicar a comparação. Esses pesos não criam ranking
            público, recomendação ou prioridade de exibição. Sobre o total técnico, a referência é:
          </p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>em torno de 62% para o bloco votos + espectro (combinados),</li>
            <li>em torno de 21% para posições declaradas quando houver dados,</li>
            <li>em torno de 10% para projetos por tema quando houver dados,</li>
            <li>em torno de 7% para financiamento (doadores por setor) quando houver cobertura classificada.</li>
          </ul>
        </section>

        <section
          id="feedback-espectro"
          className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground"
        >
          <h2 className="text-lg font-semibold">Discordo da classificação do partido</h2>
          <p className="text-muted-foreground">
            O espectro partidário é um modelo editorial em revisão. Se achar que a sigla do candidato está mal posicionada
            nos eixos, envie um e-mail para{" "}
            <a
              href="mailto:contato@puxaficha.com.br?subject=Revis%C3%A3o%20do%20espectro%20partid%C3%A1rio%20no%20quiz"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              contato@puxaficha.com.br
            </a>{" "}
            com o partido e o motivo (opcional: print do resultado). Não alteramos a regra por mensagem isolada sem
            contexto, mas registramos para fila de revisão.
          </p>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Privacidade e link compartilhado</h2>
          <p className="text-muted-foreground">
            Por padrão, suas respostas não são enviadas ao servidor: o link completo codifica as respostas no próprio URL
            (versão do schema incluída). Qualquer pessoa com o link pode reconstruir a comparação no navegador.
          </p>
          <p className="text-muted-foreground">
            O botão <strong className="text-foreground">Link curto</strong> grava no banco apenas a query string já
            pública (mesmos parâmetros do resultado) e um token aleatório. Para limitar abuso, guardamos um hash do IP com
            sal configurável (<code className="rounded bg-muted px-1 text-sm">PF_QUIZ_SHORT_LINK_SALT</code>) e aplicamos
            teto de criações por hora. O link curto facilita compartilhar pré-visualizações sociais sem URLs gigantes.
          </p>
        </section>

        <section className="space-y-3 text-[length:var(--text-body)] leading-relaxed text-foreground">
          <h2 className="text-lg font-semibold">Detalhes e comparador</h2>
          <p className="text-muted-foreground">
            No resultado, dá para abrir o detalhamento por candidato (eixos, concordâncias e divergências de voto,
            alertas de contradição registrada, mudanças de partido). Cada card tem{" "}
            <strong className="text-foreground">Comparar</strong> para abrir o comparador com aquele candidato
            pré-selecionado (complete até quatro no painel). A lista do resultado usa ordem alfabética, sem botão de
            comparação automática dos mais próximos. Entre a última pergunta e o resultado há um passo breve de
            “processando” antes da navegação.
          </p>
        </section>
      </article>

      <Footer />
    </div>
  )
}
