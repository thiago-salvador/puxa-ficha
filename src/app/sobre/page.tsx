import type { Metadata } from "next"
import { SectionLabel, SectionTitle, SectionDivider } from "@/components/SectionHeader"
import { Footer } from "@/components/Footer"

export const metadata: Metadata = {
  title: "Sobre o projeto — Puxa Ficha",
  description:
    "Como funciona o Puxa Ficha, fontes de dados, metodologia e quem esta por tras.",
}

export default function SobrePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero banner */}
      <section className="relative overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/sobre-congresso.jpg"
          alt="Congresso Nacional, Brasilia"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
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
            O Puxa Ficha e uma plataforma de consulta publica sobre candidatos das eleicoes
            brasileiras de 2026. O objetivo e oferecer informacoes oficiais de forma acessivel, com
            analise critica e transparente.
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Diferente de ferramentas que simulam neutralidade, o Puxa Ficha tem uma perspectiva
            editorial explicita: linguagem acessivel pra classe trabalhadora, foco em contradicoes
            entre discurso e pratica, e transparencia total sobre criterios e fontes.
          </p>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>01 Fontes</SectionLabel>
        <SectionTitle>Fontes de dados</SectionTitle>
        <div className="mt-6 space-y-3 sm:mt-8">
          {[
            {
              name: "TSE (Tribunal Superior Eleitoral)",
              url: "https://dadosabertos.tse.jus.br",
              desc: "Candidaturas, patrimonio declarado, financiamento de campanha, certidoes criminais.",
            },
            {
              name: "Camara dos Deputados",
              url: "https://dadosabertos.camara.leg.br",
              desc: "Votacoes, gastos parlamentares (CEAP), projetos de lei, frentes parlamentares.",
            },
            {
              name: "Senado Federal",
              url: "https://legis.senado.leg.br/dadosabertos",
              desc: "Votacoes, autorias, mandatos, comissoes.",
            },
            {
              name: "Portal da Transparencia (CGU)",
              url: "https://portaldatransparencia.gov.br",
              desc: "Dados complementares de gastos e contratos.",
            },
          ].map((source) => (
            <a
              key={source.name}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-[12px] border border-border/50 px-4 py-3.5 transition-colors hover:border-border sm:px-5 sm:py-4"
            >
              <span className="text-[length:var(--text-body-sm)] font-bold text-foreground sm:text-[length:var(--text-body)]">
                {source.name}
              </span>
              <span className="mt-0.5 block text-[length:var(--text-caption)] font-medium text-foreground sm:text-[length:var(--text-body-sm)]">
                {source.desc}
              </span>
            </a>
          ))}
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>02 Metodologia</SectionLabel>
        <SectionTitle>Como funciona</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Os dados sao coletados automaticamente por um pipeline que roda diariamente (APIs REST)
            e semanalmente (CSVs do TSE). O codigo e aberto e pode ser auditado no{" "}
            <a
              href="https://github.com/thiago-salvador/puxa-ficha"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              repositorio GitHub
            </a>
            .
          </p>
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
            Os pontos de atencao (alertas sobre contradicoes, processos, patrimonio incompativel)
            sao curadoria humana, nao gerados por IA. Cada ponto inclui fontes verificaveis.
          </p>
        </div>
      </section>

      <SectionDivider />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>03 Autor</SectionLabel>
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
          , criador de conteudo sobre inteligencia artificial e politica.
        </p>
      </section>

      <Footer />
    </div>
  )
}
