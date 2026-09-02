import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { SectionLabel, SectionTitle, SectionDivider } from "@/components/SectionHeader"
import { Footer } from "@/components/Footer"
import { MethodologySourceCard } from "@/components/MethodologySourceCard"
import { MethodologyPipelineSteps } from "@/components/MethodologyPipelineSteps"
import { MetaBadge } from "@/components/MetaBadge"
import { NoticePanel } from "@/components/NoticePanel"
import { METHODOLOGY_SOURCES } from "@/data/methodology-sources"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Metodologia e Fontes | Puxa Ficha"
const description =
  "De onde vem cada dado do Puxa Ficha, com que frequência atualiza, e como curadoria editorial, automação e selos de proveniência aparecem na ficha."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/metodologia" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/metodologia",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Metodologia e Fontes | Puxa Ficha",
      },
    ],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image: "/opengraph-image",
  }),
}

const FRESHNESS_INDICATORS = [
  {
    title: "Dado atual",
    tone: "neutral" as const,
    description: "A fonte respondeu recentemente e o dado está dentro do prazo esperado.",
  },
  {
    title: "Pode estar defasado",
    tone: "caution" as const,
    description:
      "O dado existe, mas a última atualização é mais antiga do que o esperado para aquela seção.",
  },
  {
    title: "Último dado disponível",
    tone: "neutral" as const,
    description:
      "O dado é histórico, como patrimônio de uma eleição anterior, e não existe versão mais recente.",
  },
  {
    title: "Sem dado estruturado",
    tone: "neutral" as const,
    description:
      "A seção não tem dado estruturado para este candidato. Pode significar que a fonte não cobre o cargo ou o período.",
  },
] as const

export default function MetodologiaPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
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
            Transparência
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Metodologia e Fontes
          </h1>
        </div>
      </section>

      <div className="pt-8 sm:pt-12">
        <SectionDivider />
      </div>

      {/* Intro */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <div className="max-w-2xl space-y-5">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            O Puxa Ficha organiza fontes públicas consultadas para montar cada perfil de candidato.
            Esta página detalha de onde vem cada dado, com que frequência atualiza e como curadoria
            editorial, automação e selos de proveniência se combinam na interface.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[length:var(--text-body-lg)]">
            A metodologia da comparação do quiz está em{" "}
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

      {/* 01 — Pipeline */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>01 Pipeline</SectionLabel>
        <SectionTitle>Como os dados chegam ao site</SectionTitle>
        <div className="mt-6 max-w-2xl sm:mt-8">
          <MethodologyPipelineSteps />
        </div>
      </section>

      <SectionDivider />

      {/* 02 — Fontes */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>02 Fontes</SectionLabel>
        <SectionTitle>Fontes de dados consultadas</SectionTitle>
        <p className="mt-4 max-w-2xl text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground sm:text-[length:var(--text-body)]">
          Cada card mostra o tipo de coleta (automático, curadoria editorial ou misto) e a
          frequência de atualização.
        </p>
        <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 lg:grid-cols-3">
          {METHODOLOGY_SOURCES.map((source) => (
            <MethodologySourceCard key={source.id} source={source} />
          ))}
        </div>
      </section>

      <SectionDivider />

      {/* 03 — Indicadores de frescor */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>03 Frescor</SectionLabel>
        <SectionTitle>Indicadores de frescor</SectionTitle>
        <p className="mt-4 max-w-2xl text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground sm:text-[length:var(--text-body)]">
          Nos perfis de candidatos, oito blocos de dados mostram um indicador de frescor: perfil
          atual, patrimônio, financiamento, gastos parlamentares, histórico político, mudanças de
          partido, proposições de autoria (projetos de lei, requerimentos, indicações e emendas) e
          votos. As abas Justiça e Alertas ainda não têm indicador, então
          não afirmamos data de verificação para elas. Veja o que cada estado significa:
        </p>
        <div className="mt-6 max-w-2xl space-y-3 sm:mt-8">
          {FRESHNESS_INDICATORS.map((item) => {
            return (
              <NoticePanel
                key={item.title}
                tone={item.tone}
                eyebrow={item.title}
                description={item.description}
              />
            )
          })}
        </div>
        <NoticePanel
          tone="caution"
          eyebrow="Fonte temporariamente instável"
          description="Quando uma fonte pública não responde durante a coleta, o perfil exibe este aviso. Os dados existentes continuam visíveis, mas podem estar incompletos até a próxima atualização."
          className="mt-6 max-w-2xl sm:mt-8"
        />
      </section>

      <SectionDivider />

      {/* 04 — IA e curadoria */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>04 IA e Curadoria</SectionLabel>
        <SectionTitle>O papel da IA e da curadoria</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Nos perfis, os destaques, incluindo alertas e pontos positivos, exibem selos que
            indicam a proveniência de cada trecho:
          </p>
          <div className="space-y-3">
            {[
              {
                label: "Curadoria",
                tone: "neutral" as const,
                desc: "Produção da equipe editorial; o selo na ficha indica se a verificação final já foi registrada ou se ainda há pendência.",
              },
              {
                label: "IA com checagem",
                tone: "positive" as const,
                desc: "Gerado com apoio de IA e liberado apenas quando há checagem editorial por fonte registrada.",
              },
              {
                label: "IA pendente checagem",
                tone: "caution" as const,
                desc: "Gerado por fluxo automático e ainda aguardando checagem. Não aparece na superfície pública.",
              },
            ].map((selo) => (
              <div
                key={selo.label}
                className="flex items-start gap-3 rounded-[12px] border border-border/50 px-4 py-3"
              >
                <MetaBadge
                  tone={selo.tone}
                  className="mt-0.5 shrink-0"
                >
                  {selo.label}
                </MetaBadge>
                <p className="text-[length:var(--text-body-sm)] font-medium leading-snug text-muted-foreground">
                  {selo.desc}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Pontos de atenção gerados com IA só entram na superfície pública depois de checagem
            editorial por fonte. Trechos de autoria ou conferência editorial podem aparecer com
            selo de pendência enquanto aguardam verificação adicional. Isso não é parecer jurídico
            nem aprovação humana final.
          </p>
          <h3 className="pt-2 text-[length:var(--text-body-lg)] font-semibold text-foreground">
            Resumos de programa de governo
          </h3>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Na aba de programa de governo, o resumo exibido é gerado por IA a partir do documento
            oficial que a candidatura registrou no TSE, e passa por um processo próprio antes de
            ser publicado:
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-[length:var(--text-body-sm)] font-medium leading-snug text-muted-foreground">
            <li>
              O PDF oficial é baixado do pacote do TSE, identificado por hash e extraído página a
              página. O documento é tratado como dado a resumir, nunca como instrução ao modelo.
            </li>
            <li>
              Um modelo gerador escreve de seis a oito frases e de quatro a seis temas. Cada frase
              e cada tema citam trechos literais do documento, com página, e o trecho precisa
              existir palavra por palavra no texto extraído. O parágrafo publicado é exatamente a
              união dessas frases verificadas: nada além delas entra no texto.
            </li>
            <li>
              Um segundo modelo, independente do primeiro, avalia cada frase e cada tema em seis
              dimensões: suporte na evidência, números, neutralidade, mistura de assuntos,
              identidade da candidatura e cobertura das cláusulas. Qualquer reprovação ou dúvida
              bloqueia a publicação.
            </li>
            <li>
              A aprovação final é humana e fica registrada com os hashes do documento e do
              resumo. Se o documento oficial ou o texto mudarem, a aprovação perde validade e o
              resumo sai do ar até nova revisão.
            </li>
          </ol>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            O resumo é descritivo: reproduz o que o documento propõe, sem avaliar mérito, sem
            comparar candidaturas e sem recomendar voto. O link para o PDF original no TSE aparece
            sempre ao lado, para conferência. Candidaturas sem documento localizado no pacote
            oficial são exibidas como tal, sem resumo.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* 05 — Links */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>05 Saiba mais</SectionLabel>
        <SectionTitle>Links relacionados</SectionTitle>
        <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
          {[
            { href: "/quiz/metodologia", label: "Metodologia do quiz", external: false },
            { href: "/sobre", label: "Sobre o projeto", external: false },
            { href: "mailto:contato@puxaficha.com.br", label: "Contato", external: true },
          ].map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                className="rounded-[12px] border border-border/50 px-5 py-3 text-[length:var(--text-body-sm)] font-bold text-foreground transition-colors hover:border-border sm:text-[length:var(--text-body)]"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-[12px] border border-border/50 px-5 py-3 text-[length:var(--text-body-sm)] font-bold text-foreground transition-colors hover:border-border sm:text-[length:var(--text-body)]"
              >
                {link.label}
              </Link>
            )
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
