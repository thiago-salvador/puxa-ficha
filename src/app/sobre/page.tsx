import type { Metadata } from "next"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"

export const metadata: Metadata = {
  title: "Sobre o projeto — Puxa Ficha",
  description:
    "Como funciona o Puxa Ficha, fontes de dados, metodologia e quem esta por tras.",
}

export default function SobrePage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="mx-auto max-w-7xl px-5 pb-10 pt-24 sm:pt-28 md:px-12 lg:pt-32">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/40">
          Sobre
        </p>
        <h1
          className="mt-2 font-heading uppercase leading-[0.85] text-black"
          style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
        >
          Puxa Ficha
        </h1>
      </section>

      <div className="mx-auto max-w-7xl px-5 md:px-12">
        <SlashDivider />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <div className="max-w-2xl space-y-5">
          <p className="text-[14px] font-medium leading-relaxed text-black/60 sm:text-[16px]">
            O Puxa Ficha e uma plataforma de consulta publica sobre candidatos das eleicoes
            brasileiras de 2026. O objetivo e oferecer informacoes oficiais de forma acessivel, com
            analise critica e transparente.
          </p>
          <p className="text-[14px] font-medium leading-relaxed text-black/60 sm:text-[16px]">
            Diferente de ferramentas que simulam neutralidade, o Puxa Ficha tem uma perspectiva
            editorial explicita: linguagem acessivel pra classe trabalhadora, foco em contradicoes
            entre discurso e pratica, e transparencia total sobre criterios e fontes.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 md:px-12">
        <SlashDivider />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/40">
          01 Fontes
        </p>
        <h2 className="mt-1 font-heading text-[22px] uppercase leading-[0.95] text-black sm:text-[28px] lg:text-[36px]">
          Fontes de dados
        </h2>
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
              className="block rounded-[12px] border border-black/8 px-4 py-3.5 transition-colors hover:border-black/15 sm:px-5 sm:py-4"
            >
              <span className="text-[13px] font-bold text-black sm:text-[14px]">
                {source.name}
              </span>
              <span className="mt-0.5 block text-[12px] font-medium text-black/40 sm:text-[13px]">
                {source.desc}
              </span>
            </a>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 md:px-12">
        <SlashDivider />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/40">
          02 Metodologia
        </p>
        <h2 className="mt-1 font-heading text-[22px] uppercase leading-[0.95] text-black sm:text-[28px] lg:text-[36px]">
          Como funciona
        </h2>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <p className="text-[14px] font-medium leading-relaxed text-black/60 sm:text-[16px]">
            Os dados sao coletados automaticamente por um pipeline que roda diariamente (APIs REST)
            e semanalmente (CSVs do TSE). O codigo e aberto e pode ser auditado no{" "}
            <a
              href="https://github.com/thiago-salvador/puxa-ficha"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-black underline decoration-black/20 underline-offset-2 hover:decoration-black/60"
            >
              repositorio GitHub
            </a>
            .
          </p>
          <p className="text-[14px] font-medium leading-relaxed text-black/60 sm:text-[16px]">
            Os pontos de atencao (alertas sobre contradicoes, processos, patrimonio incompativel)
            sao curadoria humana, nao gerados por IA. Cada ponto inclui fontes verificaveis.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 md:px-12">
        <SlashDivider />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/40">
          03 Autor
        </p>
        <h2 className="mt-1 font-heading text-[22px] uppercase leading-[0.95] text-black sm:text-[28px] lg:text-[36px]">
          Quem faz
        </h2>
        <p className="mt-6 max-w-2xl text-[14px] font-medium leading-relaxed text-black/60 sm:mt-8 sm:text-[16px]">
          Projeto de{" "}
          <a
            href="https://instagram.com/salvador_thiago"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-black underline decoration-black/20 underline-offset-2 hover:decoration-black/60"
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
