import type { Metadata } from "next"
import Image from "next/image"
import { SectionLabel, SectionTitle, SectionDivider } from "@/components/SectionHeader"
import { Footer } from "@/components/Footer"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Parlamentares | Puxa Ficha"
const description =
  "O Puxa Ficha ainda não possui páginas individuais para candidatos a deputado estadual, deputado federal e senador. Por que isso acontece, e como ajudar a garantir essas fichas."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/parlamentares",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/parlamentares",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Parlamentares | Puxa Ficha",
      },
    ],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image: "/opengraph-image",
  }),
}

const prose =
  "text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]"
const listClass =
  "list-disc space-y-1.5 pl-5 text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]"
const linkClass =
  "font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"

export default function ParlamentaresPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 opacity-40" aria-hidden="true">
          <Image
            src="/images/sobre-congresso.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Parlamentares
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Deputados e senadores
          </h1>
        </div>
      </section>

      <div className="pt-8 sm:pt-12">
        <SectionDivider />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>01 Fichas</SectionLabel>
        <SectionTitle>Precisamos da sua ajuda para garantir essas fichas</SectionTitle>
        <div className={`mt-6 max-w-2xl space-y-5 sm:mt-8 ${prose}`}>
          <p>
            O Puxa Ficha ainda não possui páginas individuais para candidatos a deputado estadual,
            deputado federal e senador.
          </p>
          <p>
            Não é porque essas candidaturas sejam menos importantes. É justamente o contrário: são
            os parlamentares que criam leis, aprovam o orçamento, fiscalizam governos e tomam
            decisões que afetam diretamente a vida da população.
          </p>
          <p>
            O desafio é a escala. Somados, esses três cargos reúnem{" "}
            <strong>19.031 registros de candidatura</strong>:
          </p>
          <ul className={listClass}>
            <li>
              <strong>11.090</strong> para deputado estadual;
            </li>
            <li>
              <strong>7.627</strong> para deputado federal;
            </li>
            <li>
              <strong>314</strong> para senador.
            </li>
          </ul>
          <p className="text-muted-foreground">
            <em>Fonte: Agência Senado.</em>
          </p>
          <p>Para cada ficha, precisamos localizar, cruzar e verificar informações como:</p>
          <ul className={listClass}>
            <li>patrimônio declarado;</li>
            <li>histórico eleitoral e partidário;</li>
            <li>mandatos anteriores e votações;</li>
            <li>processos judiciais;</li>
            <li>sanções e contas rejeitadas;</li>
            <li>doações e gastos de campanha;</li>
            <li>mudanças de partido;</li>
            <li>fontes oficiais que comprovem cada informação.</li>
          </ul>
          <p>
            Não basta gerar mais de 19 mil páginas automaticamente. É preciso distinguir pessoas com
            nomes semelhantes, conferir documentos, identificar dados desatualizados e evitar que
            uma informação seja atribuída ao candidato errado.
          </p>
          <p>
            <strong>Informação política errada também desinforma.</strong>
          </p>
          <p>
            Por isso, preferimos explicar com transparência que essas fichas ainda não estão
            prontas, em vez de publicar uma base incompleta ou pouco confiável.
          </p>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>02 Este é um projeto colaborativo</SectionLabel>
        <SectionTitle>Ajude com tempo, conhecimento ou recursos</SectionTitle>
        <div className={`mt-6 max-w-2xl space-y-5 sm:mt-8 ${prose}`}>
          <p>Existem algumas maneiras de contribuir com o Puxa Ficha.</p>
          <p>
            Desenvolvedores, profissionais de dados, pesquisadores, jornalistas e qualquer pessoa
            disposta a ajudar a tornar informações públicas mais acessíveis podem contribuir com:
          </p>
          <ul className={listClass}>
            <li>desenvolvimento e manutenção da plataforma;</li>
            <li>coleta, tratamento e cruzamento de dados;</li>
            <li>automações e integrações com fontes públicas;</li>
            <li>checagem de informações;</li>
            <li>verificação de documentos e fontes;</li>
            <li>identificação de erros ou dados desatualizados;</li>
            <li>pesquisa sobre candidatos;</li>
            <li>documentação da metodologia;</li>
            <li>revisão, design, comunicação e acessibilidade.</li>
          </ul>
          <p>
            Não é necessário ser especialista. Parte do trabalho envolve tarefas como conferir se
            uma fonte realmente corresponde ao candidato certo, revisar informações, localizar
            documentos públicos e reportar inconsistências.
          </p>
          <p>
            Toda contribuição precisa seguir uma metodologia comum e passar por revisão antes de ser
            publicada. O objetivo não é apenas produzir mais fichas, mas produzir fichas que possam
            ser verificadas por qualquer pessoa.
          </p>
          <p>
            Para chegar às candidaturas parlamentares, precisamos ampliar nossa capacidade de
            pesquisa, desenvolvimento, revisão e infraestrutura.
          </p>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>03 Apoio financeiro</SectionLabel>
        <SectionTitle>Apoie financeiramente</SectionTitle>
        <div className={`mt-6 max-w-2xl space-y-5 sm:mt-8 ${prose}`}>
          <p>
            As contribuições ajudam a pagar servidores, banco de dados, processamento, ferramentas
            de pesquisa e os custos necessários para manter as informações disponíveis e atualizadas
            até a eleição.
          </p>
          <p>
            <a
              href="https://apoia.se/puxaficha"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              Apoie o Puxa Ficha no APOIA.se
            </a>
          </p>
          <p>
            O Puxa Ficha é gratuito, não exige cadastro e não possui anúncios. Quanto mais pessoas
            participarem, maior poderá ser a cobertura das eleições de 2026.
          </p>
          <p>
            <strong>
              Antes de votar, puxe a ficha. Ajude a garantir que isso também seja possível para
              deputados e senadores.
            </strong>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
