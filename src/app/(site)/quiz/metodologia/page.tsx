import type { Metadata } from "next"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { quizPerguntasOrdenadas, QUIZ_VERSION } from "@/data/quiz/perguntas"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Metodologia do quiz | Puxa Ficha"
const description = "Comparação de respostas com votos e posições documentadas, com limites de cobertura explícitos e sem recomendação de voto."
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/quiz/metodologia" },
  openGraph: { title, description, url: "https://puxaficha.com.br/quiz/metodologia", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: title }] },
  twitter: buildTwitterMetadata({ title, description }),
}

export default function QuizMetodologiaPage() {
  const perguntas = quizPerguntasOrdenadas()
  return (
    <div className="min-h-screen bg-background pt-16">
      <header className="border-b border-border px-4 py-4">
        <nav className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
          <Link href="/quiz" className="hover:text-foreground">Quiz</Link>
          <Link href="/" className="hover:text-foreground">Início</Link>
        </nav>
      </header>
      <article className="mx-auto max-w-2xl space-y-8 px-4 py-12">
        <header className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Transparência · Versão {QUIZ_VERSION}</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Metodologia do quiz</h1>
          <p className="text-muted-foreground">O quiz compara suas respostas com evidências públicas disponíveis. Os candidatos aparecem em ordem alfabética. Não é recomendação de voto, ranking ou previsão eleitoral.</p>
        </header>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">O que é comparado</h2>
          <p>Entram apenas votos nominais e posições documentadas sobre a mesma política da pergunta. A evidência precisa corresponder à pessoa e à matéria, com fonte consultável.</p>
          <p>Quando existem voto e posição para a mesma pergunta, o voto nominal tem prioridade. A mesma pergunta não ganha peso extra por ter mais documentos. Um voto histórico mostra a decisão naquela data, não garante a posição atual do candidato.</p>
          <p>Abstenção, obstrução, ausência e voto não registrado não são tratados como apoio, oposição ou neutralidade. Declarações ambíguas ficam como contexto, sem coincidência calculada.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Respostas e importância</h2>
          <p>Concordância total, parcial, neutralidade, discordância parcial e total são representadas por 1, 0,75, 0,5, 0,25 e 0. A coincidência documental é a proximidade entre sua resposta e a posição expressa na fonte.</p>
          <p>Cada pergunta comparável tem peso igual. Marcar “Dar mais peso a este tema” dobra o peso dessa pergunta. Essa é uma regra transparente de preferência do usuário, sem pretensão de calibração científica.</p>
          <p>“Não tenho opinião formada” e respostas ausentes ficam fora do cálculo. Não são convertidas em neutralidade nem em posição política de centro.</p>
          <p>Os percentuais por tema descrevem somente as evidências encontradas. Não são uma probabilidade de representação, uma nota de competência nem um resultado comparável entre candidatos com coberturas diferentes.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Dados que são apenas contexto</h2>
          <p>Partido, projetos apresentados, trajetória e financiamento podem ajudar a conhecer um candidato. Não entram na coincidência calculada. Quantidade de projetos não informa seu sentido; identidade do doador não demonstra posição política; o partido não substitui a posição individual.</p>
          <p>O quiz não atribui uma identidade política a você a partir de um ponto em eixos editoriais.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Cobertura e fontes incompletas</h2>
          <p>Cada card informa quantas perguntas puderam ser comparadas. Sem evidência suficiente, o campo fica vazio. Falta de registro na base não significa que a pessoa nunca votou ou nunca se posicionou.</p>
          <p>Registros com identidade, escopo ou fonte pendentes de revisão ficam fora da comparação. A indicação de curadoria não elimina a possibilidade de erro: os links permitem conferir as evidências.</p>
          <p>Falhas de consulta são sinalizadas. Perguntas sem evidência equivalente disponível registram sua opinião, mas não contribuem para comparar candidatos.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Políticas históricas do quiz</h2>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            {perguntas.filter((p) => p.votacao_titulos?.length).map((p) => <li key={p.id}>{p.texto}</li>)}
          </ul>
          <p>As referências usam a identificação oficial da matéria e a etapa da votação. Não associamos um voto apenas porque o título parece semelhante. A fonte de cada comparação aparece nos detalhes do candidato.</p>
          <p>Para as emendas de relator, esta versão usa somente posições documentadas: ainda não há uma votação nominal validada ligada à pergunta.</p>
          <p>Preservação ambiental não é equiparada a marco temporal; transferência de renda em geral não é equiparada a um voto no pacote do Auxílio Brasil. Reformas estaduais ou municipais e privatizações de outras empresas não substituem a política específica da pergunta.</p>
        </section>
        <section id="feedback-espectro" className="space-y-3">
          <h2 className="text-lg font-semibold">Revisão e limites</h2>
          <p>Esta versão corrige associações e cálculos identificados em auditoria. Ainda não existe validação independente que permita afirmar que o quiz encontra os candidatos mais adequados. Por isso, não produz uma ordem de recomendação.</p>
          <p>As perguntas mudaram nesta versão. Links de resultados anteriores pedem que você refaça o quiz, para evitar interpretar respostas antigas como se fossem dadas às perguntas atuais.</p>
          <Link href="/sobre" className="font-medium underline underline-offset-4">Sobre o projeto e canais de contato</Link>
        </section>
      </article>
      <Footer />
    </div>
  )
}
