import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { SectionLabel, SectionTitle, SectionDivider } from "@/components/SectionHeader"
import { Footer } from "@/components/Footer"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Sobre o projeto | Puxa Ficha"
const description =
  "O Puxa Ficha é um projeto de mídia independente e de código aberto. Como funciona, fontes de dados, metodologia e quem está por trás."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/sobre",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/sobre",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Sobre o Puxa Ficha",
      },
    ],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image: "/opengraph-image",
  }),
}

export default function SobrePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero banner */}
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
            Sobre
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Puxa Ficha
          </h1>
        </div>
      </section>

      <div className="pt-8 sm:pt-12">
        <SectionDivider />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <div className="max-w-2xl space-y-5">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            O Puxa Ficha é uma plataforma de consulta pública sobre candidatos mapeados para
            2026. O objetivo é oferecer informações públicas disponíveis de forma acessível, com
            análise crítica e transparente.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            A cobertura atual é dos cargos majoritários do Executivo: Presidência da República e
            governos estaduais, incluindo os vices das chapas. Senado e Câmara dos Deputados ficam
            de fora por enquanto, porque uma amostra pequena das duas casas informaria menos do que
            sugere. Dados de mandato parlamentar continuam sendo usados como fonte sobre quem hoje
            ocupa uma cadeira e disputa o Executivo.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Diferente de ferramentas que simulam neutralidade, o Puxa Ficha tem uma perspectiva
            editorial explícita: linguagem acessível para a classe trabalhadora, foco em contradições
            entre discurso e prática, e transparência sobre critérios, limites e fontes.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            É um projeto de mídia independente e de código aberto, e as duas coisas se sustentam
            uma na outra. Independente porque a apuração não passa por intermediário: o que vai para
            uma ficha parte de fontes públicas, com prioridade para os registros oficiais do TSE, da
            Câmara e do Senado, e uma rotina automatizada revalida as fontes citadas antes de um
            candidato entrar ou voltar para a lista pública. Se uma fonte estiver fora do ar ou não
            sustentar o que foi afirmado, a publicação daquele candidato falha em vez de seguir.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Aberto porque o código que faz tudo isso é público. Método fechado pede confiança;
            método aberto aceita conferência.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Nos perfis, alertas e destaques positivos exibem selos que indicam se o trecho foi escrito ou
            checado pela curadoria editorial, se envolveu IA ou se foi produzido por fluxo automático.
            O selo também indica se o trecho ainda aguarda verificação adicional, com links para fontes
            quando houver.
          </p>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>01 Fontes e Metodologia</SectionLabel>
        <SectionTitle>Como funciona</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            O Puxa Ficha organiza fontes públicas consultadas (TSE, Câmara, Senado, CGU, Wikipedia
            e outras) com rotinas automatizadas e checagens operacionais por fonte.
            Pontos de atenção e trechos editoriais exibem selos que indicam se já houve checagem
            editorial, se ainda há pendência de verificação ou se o trecho veio de fluxo automático.
            Pontos gerados por IA como alerta só entram na página pública após checagem editorial
            registrada no sistema. Isso não equivale a parecer jurídico nem a aprovação humana final.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Para o detalhamento das fontes consultadas, frequência de atualização, pipeline de dados
            e indicadores de frescor, veja a{" "}
            <Link
              href="/metodologia"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              página de metodologia
            </Link>
            . A metodologia da comparação do quiz está em{" "}
            <Link
              href="/quiz/metodologia"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              Metodologia do quiz
            </Link>
            .
          </p>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>02 Código aberto</SectionLabel>
        <SectionTitle>Auditável por qualquer pessoa</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Todo o código do Puxa Ficha é público no{" "}
            <a
              href="https://github.com/thiago-salvador/puxa-ficha"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              github.com/thiago-salvador/puxa-ficha
            </a>
            , sob Apache License 2.0. Qualquer pessoa pode ler como as fichas são montadas, conferir
            se o que esta página descreve corresponde ao que o código realmente faz, apontar erro,
            propor correção ou hospedar a própria versão do projeto.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Isso inclui a parte que costuma ficar invisível: as rotinas de coleta, os critérios que
            decidem o que entra numa ficha e as travas que impedem a publicação de um candidato
            enquanto uma fonte citada não se sustenta. Não é preciso acreditar na descrição do
            método, dá para ler o método.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Colaboração é bem-vinda e tem uma porta só. Correção de dado, fonte melhor, erro de
            português ou código: tudo entra por issue ou pull request no repositório, à vista de
            todo mundo. Nenhuma alteração vai ao ar sem passar por revisão, e a decisão final sobre
            o que é publicado continua sendo editorial, não automática. Discordar do critério também
            é contribuição: o lugar de fazer isso é uma issue pública, não um canal privado.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            A licença Apache 2.0 cobre o código. Os dados exibidos são registros públicos, sujeitos
            à Lei de Acesso à Informação, e não à licença do software. Dado pessoal de quem não é
            candidato não entra: CPF de doador, por exemplo, aparece nos artefatos apenas como hash.
          </p>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>03 Financiamento coletivo</SectionLabel>
        <SectionTitle>Quem paga a conta</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Um site que puxa a ficha de quem disputa poder não pode ser pago por quem disputa
            poder, nem por anunciante com interesse no resultado da eleição. Quem banca define, no
            limite, o que pode ser dito. Por isso o Puxa Ficha se financia por apoio coletivo, numa
            campanha aberta no APOIA.se, onde qualquer pessoa vê quanto foi arrecadado, quantas
            pessoas apoiam e para que serve cada faixa de valor.
          </p>
          {/*
            Metas e recompensas conferidas uma a uma contra apoia.se/puxaficha em 17/08/2026,
            incluindo as metas 2, 3 e 4, que ficam atrás do carrossel e só aparecem depois de
            avançar. Valor de campanha errado numa página de doação é pior que valor ausente,
            então quem mexer aqui confere na página antes.

            Nota para a próxima leitura automatizada: naquele dia a campanha respondeu "Esta
            campanha foi excluída" nas primeiras tentativas de carga, e só rendeu o conteúdo
            real depois. O "excluída" era estado transitório, não campanha fora do ar.
          */}
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            A campanha declara quatro metas. R$ 2.000 cobrem os custos de infraestrutura do site por
            pelo menos três meses. R$ 5.000 remuneram as horas de apuração e reverificação contínua
            durante o ciclo. R$ 10.000 permitem formar uma equipe de desenvolvimento e dados para
            novas frentes, como calendário oficial e apuração de fatos levantados em debates.
            R$ 25.000 fazem o projeto se pagar por completo, com equipe dedicada e a possibilidade
            de seguir relevante depois da eleição.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            O apoio começa em R$ 19, com nome no mural de apoiadores e uma ficha de apoiador
            personalizada no estilo dossiê do site. A partir de R$ 49, a ficha vem em versão
            estendida, com carimbo dourado e número de série. A partir de R$ 99, o nome entra nos
            créditos do relatório retrospectivo que será publicado aberto depois da eleição, com os
            números do ciclo inteiro. A partir de R$ 249, o nome fica em destaque permanente nesta
            página, na seção de quem tornou o projeto possível.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Todo o conteúdo do site é gratuito, sem cadastro e sem anúncio. O que o apoio paga é a
            operação por trás disso: servidores, banco de dados, monitoramento e as horas de
            conferência contra as fontes oficiais que mantêm o site no ar e atualizado até outubro
            de 2026. A campanha está em{" "}
            <a
              href="https://apoia.se/puxaficha"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              apoia.se/puxaficha
            </a>
            .
          </p>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>04 Autor</SectionLabel>
        <SectionTitle>Quem faz</SectionTitle>
        <p className="mt-6 max-w-2xl text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:mt-8 sm:text-[length:var(--text-body-lg)]">
          Projeto de{" "}
          <a
            href="https://instagram.com/salvador_thiago"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
          >
            Thiago Salvador
          </a>
          , criador de conteúdo sobre inteligência artificial e política.
        </p>
        <p className="mt-4 text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
          Dúvidas, sugestões ou pedidos de correção podem ser enviados para{" "}
          <a
            href="mailto:contato@puxaficha.com.br"
            className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
          >
            contato@puxaficha.com.br
          </a>
          .
        </p>
        <p className="mt-4 max-w-2xl text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
          Para retificar uma ficha pública, use esse canal e envie o link da ficha, o trecho
          questionado e a fonte oficial ou documento que sustenta a correção. Use o assunto{" "}
          <strong>Retificação de ficha</strong>. O pedido será analisado sem promessa de remoção
          automática de dados de interesse público.
        </p>
      </section>

      <Footer />
    </div>
  )
}
