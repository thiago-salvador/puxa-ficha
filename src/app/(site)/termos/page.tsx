import type { Metadata } from "next"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { SectionDivider, SectionLabel, SectionTitle } from "@/components/SectionHeader"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Termos de Uso | Puxa Ficha"
const description =
  "Termos de uso do Puxa Ficha: finalidade informativa, limites do quiz, uso de IA, correções e alertas por email."
const image = "/opengraph-image"

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/termos",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/termos",
    type: "website",
    images: [
      {
        url: image,
        width: 1200,
        height: 630,
        alt: "Termos de Uso | Puxa Ficha",
      },
    ],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image,
  }),
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
      {children}
    </p>
  )
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
      {children}
    </ul>
  )
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/60" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Legal
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Termos de uso
          </h1>
        </div>
      </section>

      <div className="pt-8 sm:pt-12">
        <SectionDivider />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <div className="max-w-2xl space-y-5">
          <P>
            Estes termos descrevem os limites de uso do Puxa Ficha. O projeto organiza dados
            públicos e conteúdo editorial sobre candidatos e agentes políticos para fins de
            informação, transparência e debate público.
          </P>
          <P>
            Última atualização: 21 de maio de 2026. Esta página é informativa e não substitui
            parecer jurídico.
          </P>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>01</SectionLabel>
        <SectionTitle>Natureza do projeto</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O Puxa Ficha não é partido político, campanha, coligação, federação, comitê eleitoral
            ou consultoria jurídica. O conteúdo não deve ser lido como propaganda eleitoral,
            recomendação de voto, pesquisa eleitoral, enquete eleitoral, aconselhamento jurídico ou
            decisão automatizada.
          </P>
          <P>
            As fichas podem destacar fatos públicos, pontos de atenção, contradições documentais e
            dados positivos. Esses recortes são editoriais, dependem das fontes disponíveis e podem
            ser atualizados quando houver nova evidência.
          </P>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>02</SectionLabel>
        <SectionTitle>Quiz</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O quiz é uma ferramenta de comparação programática. Ele mostra candidatos em ordem
            alfabética e apresenta sinais documentais, como votações públicas, posições declaradas,
            projetos de lei, financiamento classificado e espectro partidário com curadoria editorial.
          </P>
          <Ul>
            <li>O quiz não ranqueia candidatos.</li>
            <li>O quiz não recomenda, sugere ou prioriza candidato, campanha, partido ou federação.</li>
            <li>O quiz não indica preferência eleitoral nem favorecimento político direto ou indireto.</li>
            <li>Percentuais e pesos técnicos, quando existirem internamente, servem para explicar sinais do card, não para ordenar a lista pública.</li>
          </Ul>
          <P>
            A metodologia pública do quiz está em{" "}
            <Link
              href="/quiz/metodologia"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              /quiz/metodologia
            </Link>
            .
          </P>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>03</SectionLabel>
        <SectionTitle>Fontes e correções</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O produto usa bases públicas, fontes oficiais e fontes complementares identificadas.
            Mesmo com checagens, pode haver erro, atraso, dado incompleto ou mudança factual ainda
            não refletida na interface.
          </P>
          <P>
            Pedidos de correção devem ser enviados para{" "}
            <a
              href="mailto:contato@puxaficha.com.br?subject=Retifica%C3%A7%C3%A3o%20de%20ficha"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              contato@puxaficha.com.br
            </a>{" "}
            com link da página, trecho questionado e fonte oficial ou documento de suporte. O pedido
            será analisado sem promessa de remoção automática de dado de interesse público.
          </P>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>04</SectionLabel>
        <SectionTitle>IA e curadoria</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O Puxa Ficha pode usar inteligência artificial para estruturar, resumir ou apoiar
            conteúdo editorial. Quando um ponto de atenção gerado com IA aparece publicamente, ele
            deve estar identificado por selo e passar por checagem editorial por fonte.
          </P>
          <P>
            Esse processo não equivale a parecer jurídico, revisão jurídica humana ou aprovação
            humana final de todas as fichas. Quando a fonte ou a checagem não forem suficientes, o
            conteúdo deve permanecer pendente, oculto ou descrito com ressalva.
          </P>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>05</SectionLabel>
        <SectionTitle>Alertas por email</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Alertas por email dependem de confirmação do endereço informado. O usuário pode gerenciar
            ou cancelar acompanhamentos pelos links enviados no próprio email. Digests podem sofrer
            atraso, falhar temporariamente ou ser suspensos para manutenção, prevenção de abuso ou
            correção de dados.
          </P>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>06</SectionLabel>
        <SectionTitle>Uso permitido</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            É vedado usar o Puxa Ficha para tentar burlar controles técnicos, coletar dados em massa
            de forma abusiva, simular identidade de terceiros, assediar candidatos ou usuários, gerar
            desinformação ou atribuir ao projeto uma recomendação política que ele não faz.
          </P>
          <P>
            A{" "}
            <Link
              href="/privacidade"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              Política de Privacidade
            </Link>{" "}
            complementa estes termos.
          </P>
        </div>
      </section>

      <Footer />
    </div>
  )
}
