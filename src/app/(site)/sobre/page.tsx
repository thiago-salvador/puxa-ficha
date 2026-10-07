import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowUpRight, CodeXml, FileText, Users } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"
import { SobreNav, type SobreNavItem } from "@/components/SobreNav"
import { Footer } from "@/components/Footer"
import { buildTwitterMetadata } from "@/lib/metadata"
import { isSenadoEnabled } from "@/lib/senado-feature"
import {
  APOIADORES_PUBLICOS,
  APOIOS_CONFERIDO_EM,
  APOIOS_SEM_NOME,
  APOIOS_TOTAL,
  RELATORES_OFICIAIS,
} from "@/data/apoiadores"

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

const NAV: SobreNavItem[] = [
  { id: "projeto", label: "O projeto" },
  { id: "como-funciona", label: "Como funciona" },
  { id: "codigo-aberto", label: "Código aberto" },
  { id: "financiamento", label: "Financiamento" },
  { id: "quem-faz", label: "Quem faz" },
  { id: "apoiadores", label: "Apoiadores" },
]

const P = "text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]"
const LINK_TEXTO =
  "font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
const LINK_SETA =
  "inline-flex min-h-11 items-center gap-1.5 text-[length:var(--text-body)] font-semibold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"

function Secao({
  id,
  numero,
  titulo,
  subtitulo,
  children,
}: {
  id: string
  numero: string
  titulo: string
  subtitulo?: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-24 border-b border-border py-10 first:pt-0 last:border-b-0 sm:py-12">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.2em] text-muted-foreground">{numero}</p>
      <h2
        id={`${id}-titulo`}
        className="mt-1 font-heading uppercase leading-[0.9] text-foreground"
        style={{ fontSize: "clamp(32px, 5vw, 56px)" }}
      >
        {titulo}
      </h2>
      {subtitulo ? (
        <p className="mt-2 text-[length:var(--text-body-lg)] font-medium leading-snug text-muted-foreground sm:text-[length:var(--text-heading-sm)]">{subtitulo}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}

function SubSection({ eyebrow, titulo, children }: { eyebrow: string; titulo: string; children: ReactNode }) {
  return (
    <div>
      <SlashDivider className="my-10" />
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <h3 className="mt-1 font-heading text-[length:var(--text-heading)] uppercase leading-[0.95] text-foreground sm:text-[length:var(--text-heading-lg)]">
        {titulo}
      </h3>
      <div className="mt-4">{children}</div>
    </div>
  )
}

/** Tabela de duas colunas (rótulo grande à esquerda, texto à direita) usada em metas e faixas. */
function Tabela({ linhas }: { linhas: { rotulo: ReactNode; texto: string }[] }) {
  return (
    <dl className="mt-6 border-t border-border">
      {linhas.map(({ rotulo, texto }, i) => (
        <div key={i} className="grid gap-1 border-b border-border py-4 sm:grid-cols-[14rem_1fr] sm:items-center sm:gap-0">
          <dt className="font-heading text-[length:var(--text-heading)] leading-none text-foreground sm:border-r sm:border-border sm:pr-6">
            {rotulo}
          </dt>
          <dd className="max-w-xl text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:pl-8">{texto}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Rótulo "Meta 01" / "Faixa 01": metas e faixas aparecem sem valor, que fica no APOIA.se. */
function RotuloNumerado({ tipo, indice }: { tipo: string; indice: number }) {
  return (
    <>
      <span className="block font-sans text-[length:var(--text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">
        {tipo}
      </span>
      {String(indice + 1).padStart(2, "0")}
    </>
  )
}

export default function SobrePage() {
  // O texto de cobertura acompanha a mesma flag que publica /senado e /uf/[uf]/senado.
  const senadoEnabled = isSenadoEnabled()
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 opacity-60" aria-hidden="true">
          <Image src="/images/sobre-congresso.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />
        <div className="relative mx-auto max-w-7xl px-5 pb-10 pt-28 sm:pb-12 sm:pt-32 md:px-12">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">Sobre</p>
          <h1 className="mt-2 font-heading uppercase leading-[0.85] text-white" style={{ fontSize: "clamp(36px, 8vw, 80px)" }}>
            Sobre o Puxa Ficha
          </h1>
          <p className="mt-3 text-[length:var(--text-body-lg)] font-medium text-white/90 sm:text-[length:var(--text-heading-sm)]">Política com contexto.</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-10 md:px-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 lg:py-14">
        <aside className="hidden border-r border-border lg:block">
          <SobreNav items={NAV} />
        </aside>

        <div className="min-w-0">
          <Secao id="projeto" numero="01" titulo="O projeto" subtitulo="Consulta pública sobre quem disputa o poder em 2026.">
            <div className="max-w-3xl space-y-5">
              <p className={P}>
                O Puxa Ficha é uma plataforma de consulta pública sobre candidatos mapeados para 2026. Nosso objetivo é oferecer
                informações públicas de forma acessível, com análise crítica e transparente, em uma linguagem direta, pensada para a
                classe trabalhadora.
              </p>
              {senadoEnabled ? (
                <p className={P}>
                  A cobertura atual é dos cargos majoritários: Presidência da República e governos estaduais, incluindo os vices das
                  chapas, e as candidaturas ao{" "}
                  <Link href="/senado" className={LINK_TEXTO}>
                    Senado
                  </Link>
                  , organizadas por estado. A Câmara dos Deputados fica de fora por enquanto, porque uma amostra pequena da casa
                  informaria menos do que sugere. Dados de mandato parlamentar continuam sendo usados como fonte sobre quem hoje ocupa
                  uma cadeira e disputa uma nova eleição.
                </p>
              ) : (
                <p className={P}>
                  A cobertura atual é da Presidência da República e dos governos estaduais, incluindo os vices das chapas.{" "}
                  <Link href="/parlamentares" className={LINK_TEXTO}>
                    Senado e Câmara dos Deputados
                  </Link>{" "}
                  ficam de fora por enquanto, porque uma amostra pequena das duas casas informaria menos do que sugere. Dados de
                  mandato parlamentar continuam sendo usados como fonte sobre quem hoje ocupa uma cadeira e disputa o Executivo.
                </p>
              )}
              <p className={P}>
                O Puxa Ficha é independente, não exibe publicidade e se financia por apoio coletivo. Acreditamos que a política precisa
                ser compreendida para além do discurso: é preciso confrontar o que é dito com o que é feito. Por isso, reunimos
                informações de diferentes fontes públicas e explicitamos nossos critérios, limites e metodologias.
              </p>
            </div>

            <ul className="mt-8 grid gap-4 border-b border-border pb-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
              {[
                { Icon: FileText, texto: "Gratuito" },
                { Icon: Users, texto: "Sem cadastro" },
                { Icon: CodeXml, texto: "Código aberto" },
              ].map(({ Icon, texto }) => (
                <li key={texto} className="flex items-center gap-4 sm:px-6 sm:first:pl-0 sm:last:pr-0">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-foreground">
                    <Icon className="size-6 text-foreground" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="text-[length:var(--text-body-lg)] font-bold text-foreground">{texto}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-x-10">
              <a href="#como-funciona" className={LINK_SETA}>
                Ver como funciona <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
              <a href="#financiamento" className={LINK_SETA}>
                Apoiar o projeto <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </Secao>

          <Secao id="como-funciona" numero="02" titulo="Como funciona" subtitulo="Da busca à fonte, em poucos passos.">
            <ol className="grid gap-6 border-b border-border pb-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
              {[
                {
                  titulo: "Consultar",
                  texto: "Busque por estado ou nome para ver quem são os candidatos e suas informações principais.",
                },
                {
                  titulo: "Comparar",
                  texto: "Veja lado a lado trajetórias, propostas, vínculos e outros dados relevantes, com linguagem acessível.",
                },
                {
                  titulo: "Conferir fontes",
                  texto: "Todas as informações têm fonte pública identificada. Você também encontra nossos critérios e limitações.",
                  link: true,
                },
              ].map(({ titulo, texto, link }, i) => (
                <li key={titulo} className="flex gap-4 md:px-6 md:first:pl-0 md:last:pr-0">
                  <span aria-hidden="true" className="shrink-0 pt-0.5 text-[length:var(--text-body)] font-bold tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-[length:var(--text-body-lg)] font-bold text-foreground">{titulo}</h3>
                    <p className="mt-1 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">{texto}</p>
                    {link ? (
                      <Link href="/metodologia" className={LINK_SETA}>
                        Ver metodologia <ArrowUpRight className="size-4" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-8 max-w-3xl space-y-5">
              <p className={P}>
                O Puxa Ficha organiza fontes públicas consultadas (TSE, Câmara, Senado, CGU, Wikipedia e outras) com rotinas
                automatizadas e checagens operacionais por fonte. A apuração não passa por intermediário: o que vai para uma ficha parte
                de fontes públicas, com prioridade para os registros oficiais do TSE, da Câmara e do Senado, e uma rotina automatizada
                revalida as fontes citadas antes de um candidato entrar ou voltar para a lista pública. Se uma fonte estiver fora do ar
                ou não sustentar o que foi afirmado, a publicação daquele candidato falha em vez de seguir.
              </p>
              <p className={P}>
                Nos perfis, pontos de atenção, alertas e destaques positivos exibem selos que indicam se o trecho foi escrito ou checado
                pela curadoria editorial, se envolveu IA ou se foi produzido por fluxo automático, e se ainda aguarda verificação
                adicional, com links para fontes quando houver. Pontos gerados por IA como alerta só entram na página pública após
                checagem editorial registrada no sistema. Isso não equivale a parecer jurídico nem a aprovação humana final.
              </p>
              <p className={P}>
                Para o detalhamento das fontes consultadas, frequência de atualização, pipeline de dados e indicadores de frescor, veja
                a{" "}
                <Link href="/metodologia" className={LINK_TEXTO}>
                  página de metodologia
                </Link>
                . A metodologia da comparação do quiz está em{" "}
                <Link href="/quiz/metodologia" className={LINK_TEXTO}>
                  Metodologia do quiz
                </Link>
                .
              </p>
            </div>
          </Secao>

          <Secao id="codigo-aberto" numero="03" titulo="Código aberto" subtitulo="Auditável por qualquer pessoa.">
            <div className="max-w-3xl space-y-5">
              <p className={P}>
                Todo o código do Puxa Ficha é público no{" "}
                <a href="https://github.com/thiago-salvador/puxa-ficha" target="_blank" rel="noopener noreferrer" className={LINK_TEXTO}>
                  github.com/thiago-salvador/puxa-ficha
                </a>
                , sob Apache License 2.0. Qualquer pessoa pode ler como as fichas são montadas, conferir se o que esta página descreve
                corresponde ao que o código realmente faz, apontar erro, propor correção ou hospedar a própria versão do projeto.
                Método fechado pede confiança; método aberto aceita conferência.
              </p>
              <p className={P}>
                Isso inclui a parte que costuma ficar invisível: as rotinas de coleta, os critérios que decidem o que entra numa ficha e
                as travas que impedem a publicação de um candidato enquanto uma fonte citada não se sustenta. Não é preciso acreditar na
                descrição do método, dá para ler o método.
              </p>
              <p className={P}>
                Colaboração é bem-vinda e tem uma porta só. Correção de dado, fonte melhor, erro de português ou código: tudo entra por
                issue ou pull request no repositório, à vista de todo mundo. Nenhuma alteração vai ao ar sem passar por revisão, e a
                decisão final sobre o que é publicado continua sendo editorial, não automática. Discordar do critério também é
                contribuição: o lugar de fazer isso é uma issue pública, não um canal privado.
              </p>
              <p className={P}>
                A licença Apache 2.0 cobre o código. Os dados exibidos são registros públicos, sujeitos à Lei de Acesso à Informação, e
                não à licença do software. Dado pessoal de quem não é candidato não entra: CPF de doador, por exemplo, aparece nos
                artefatos apenas como hash.
              </p>
            </div>
          </Secao>

          <Secao id="financiamento" numero="04 · Financiamento coletivo" titulo="Quem paga a conta">
            <div className="max-w-3xl space-y-5">
              <p className={P}>
                Um site que puxa a ficha de quem disputa poder não pode ser pago por quem disputa poder, nem por anunciante com
                interesse no resultado da eleição. Quem banca define, no limite, o que pode ser dito. Por isso o Puxa Ficha se financia
                por apoio coletivo, numa campanha aberta no APOIA.se, onde qualquer pessoa vê quanto foi arrecadado, quantas pessoas
                apoiam e para que serve cada faixa de valor.
              </p>
              <p className={P}>
                Nosso compromisso é com a independência editorial, a transparência nos critérios e o acesso livre para toda a
                população, com linguagem acessível e foco em quem vive do próprio trabalho.
              </p>
            </div>

            {/*
              Metas e recompensas conferidas uma a uma contra apoia.se/puxaficha em 17/08/2026,
              incluindo as metas 2, 3 e 4, que ficam atrás do carrossel e só aparecem depois de
              avançar. Valor de campanha errado numa página de doação é pior que valor ausente,
              então quem mexer aqui confere na página antes. Metas e faixas de apoio aparecem sem
              valor por decisão editorial (07/10/2026); os valores ficam no APOIA.se.

              Nota para a próxima leitura automatizada: naquele dia a campanha respondeu "Esta
              campanha foi excluída" nas primeiras tentativas de carga, e só rendeu o conteúdo
              real depois. O "excluída" era estado transitório, não campanha fora do ar.
            */}
            <SubSection eyebrow="Nossas metas" titulo="Para seguir em frente">
              <p className={`${P} max-w-3xl`}>
                A campanha tem quatro metas, que cobrem desde a infraestrutura do site até a continuidade do projeto após a eleição. Os valores e o quanto já foi arrecadado estão na página da campanha.
              </p>
              <Tabela
                linhas={[
                  "Cobrem os custos de infraestrutura do site por pelo menos três meses.",
                  "Remuneram as horas de apuração e reverificação contínua durante o ciclo.",
                  "Permitem formar uma equipe de desenvolvimento e dados para novas frentes, como calendário oficial e apuração de fatos levantados em debates.",
                  "Fazem o projeto se pagar por completo, com equipe dedicada e a possibilidade de seguir relevante depois da eleição.",
                ].map((texto, i) => ({ rotulo: <RotuloNumerado tipo="Meta" indice={i} />, texto }))}
              />
            </SubSection>

            <SubSection eyebrow="Formas de apoiar" titulo="Escolha a sua">
              <p className={`${P} max-w-3xl`}>
                Além de manter o projeto no ar, quem apoia ajuda a fortalecer uma ferramenta pública de informação e controle social.
                Veja as recompensas de cada faixa de apoio; os valores estão na página da campanha.
              </p>
              <Tabela
                linhas={[
                  "Nome no mural e ficha de apoiador personalizada no estilo dossiê do site.",
                  "Ficha em versão estendida, com carimbo dourado e número de série.",
                  "Nome nos créditos do relatório retrospectivo, publicado aberto depois da eleição com os números do ciclo inteiro.",
                  "Nome em destaque permanente nesta página, na seção de quem tornou o projeto possível.",
                ].map((texto, i) => ({ rotulo: <RotuloNumerado tipo="Faixa" indice={i} />, texto }))}
              />
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
                <a
                  href="https://apoia.se/puxaficha"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[8px] bg-foreground px-8 text-[length:var(--text-body-lg)] font-bold text-background transition-colors duration-200 hover:bg-[var(--gray-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                >
                  Apoiar no APOIA.se <ArrowUpRight className="size-5" aria-hidden="true" />
                </a>
                <span aria-hidden="true" className="hidden h-10 w-px bg-border sm:block" />
                <a href="#apoiadores" className={LINK_SETA}>
                  Ver mural de apoiadores <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            </SubSection>
          </Secao>

          <Secao id="quem-faz" numero="05" titulo="Quem faz">
            <div className="max-w-3xl space-y-4">
              <p className={P}>
                Projeto de{" "}
                <a href="https://instagram.com/salvador_thiago" target="_blank" rel="noopener noreferrer" className={LINK_TEXTO}>
                  Thiago Salvador
                </a>
                , criador de conteúdo sobre inteligência artificial e política.
              </p>
              <p className={P}>
                Dúvidas, sugestões ou pedidos de correção podem ser enviados para{" "}
                <a href="mailto:contato@puxaficha.com.br" className={LINK_TEXTO}>
                  contato@puxaficha.com.br
                </a>
                .
              </p>
              <p className={P}>
                Para retificar uma ficha pública, use esse canal e envie o link da ficha, o trecho questionado e a fonte oficial ou documento
                que sustenta a correção. Use o assunto <strong>Retificação de ficha</strong>. O pedido será analisado sem
                promessa de remoção automática de dados de interesse público.
              </p>
            </div>
          </Secao>

          <Secao id="apoiadores" numero="06" titulo="Apoiadores" subtitulo="Quem tornou o projeto possível.">
            <p className={`${P} max-w-3xl`}>
              O Puxa Ficha existe porque estas pessoas decidiram bancar informação pública, gratuita e sem anúncio.
            </p>
            {RELATORES_OFICIAIS.length > 0 ? (
              <div className="mt-8 max-w-2xl border-2 border-foreground p-5">
                <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">Relatores oficiais</p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {RELATORES_OFICIAIS.map((apoiador) => (
                    <li key={apoiador.nome} className="text-[length:var(--text-body-lg)] font-bold uppercase text-foreground">
                      <span aria-hidden="true">★ </span>
                      {apoiador.nome}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-8 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
              Mural de apoiadores
            </p>
            <ul className="mt-4 flex max-w-3xl flex-wrap gap-3">
              {APOIADORES_PUBLICOS.map((apoiador) => (
                <li key={apoiador.nome} className="border-2 border-foreground px-4 py-3 text-[length:var(--text-body)] font-bold text-foreground">
                  <span className="block text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground/70">
                    <span aria-hidden="true">▣ </span>
                    Apoiador confirmado
                  </span>
                  {apoiador.nome}
                </li>
              ))}
            </ul>
            {APOIOS_SEM_NOME > 0 ? (
              <p className="mt-4 text-[length:var(--text-body)] font-medium text-foreground/70">
                + {APOIOS_SEM_NOME} {APOIOS_SEM_NOME === 1 ? "pessoa apoia" : "pessoas apoiam"} de forma anônima.
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-[length:var(--text-body)] font-bold text-foreground">
                {APOIOS_TOTAL} {APOIOS_TOTAL === 1 ? "apoio" : "apoios"} até {APOIOS_CONFERIDO_EM}
              </p>
              <a href="https://apoia.se/puxaficha" target="_blank" rel="noopener noreferrer" className={LINK_SETA}>
                Apoie no APOIA.se <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </Secao>
        </div>
      </div>

      <Footer />
    </div>
  )
}
