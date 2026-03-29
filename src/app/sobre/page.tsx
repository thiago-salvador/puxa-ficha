import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sobre o projeto — Puxa Ficha",
  description: "Como funciona o Puxa Ficha, fontes de dados, metodologia e quem esta por tras.",
}

export default function SobrePage() {
  return (
    <main className="max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Sobre o Puxa Ficha</h1>

      <section className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
        <p>
          O Puxa Ficha e uma plataforma de consulta publica sobre candidatos
          das eleicoes brasileiras de 2026. O objetivo e oferecer informacoes
          oficiais de forma acessivel, com analise critica e transparente.
        </p>
        <p>
          Diferente de ferramentas que simulam neutralidade, o Puxa Ficha tem
          uma perspectiva editorial explicita: linguagem acessivel pra classe
          trabalhadora, foco em contradicoes entre discurso e pratica, e
          transparencia total sobre criterios e fontes.
        </p>
      </section>

      <Separator className="my-8" />

      <h2 className="text-xl font-semibold">Fontes de dados</h2>
      <div className="mt-4 grid gap-3">
        <SourceCard
          name="TSE (Tribunal Superior Eleitoral)"
          description="Candidaturas, patrimonio declarado, financiamento de campanha, certidoes criminais."
          url="https://dadosabertos.tse.jus.br"
        />
        <SourceCard
          name="Camara dos Deputados"
          description="Votacoes, gastos parlamentares (CEAP), projetos de lei, frentes parlamentares."
          url="https://dadosabertos.camara.leg.br"
        />
        <SourceCard
          name="Senado Federal"
          description="Votacoes, autorias, mandatos, comissoes."
          url="https://legis.senado.leg.br/dadosabertos"
        />
        <SourceCard
          name="Portal da Transparencia (CGU)"
          description="Dados complementares de gastos e contratos."
          url="https://portaldatransparencia.gov.br"
        />
      </div>

      <Separator className="my-8" />

      <h2 className="text-xl font-semibold">Metodologia</h2>
      <div className="mt-4 space-y-4 text-muted-foreground leading-relaxed">
        <p>
          Os dados sao coletados automaticamente por um pipeline que roda
          diariamente (APIs REST) e semanalmente (CSVs do TSE). O codigo e
          aberto e pode ser auditado no{" "}
          <a
            href="https://github.com/thiago-salvador/puxa-ficha"
            className="text-foreground underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            repositorio GitHub
          </a>.
        </p>
        <p>
          Os pontos de atencao (alertas sobre contradicoes, processos, patrimonio
          incompativel) sao curadoria humana, nao gerados por IA. Cada ponto
          inclui fontes verificaveis.
        </p>
      </div>

      <Separator className="my-8" />

      <h2 className="text-xl font-semibold">Quem faz</h2>
      <p className="mt-4 text-muted-foreground leading-relaxed">
        Projeto de{" "}
        <a
          href="https://instagram.com/salvador_thiago"
          className="text-foreground underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Thiago Salvador
        </a>
        , criador de conteudo sobre inteligencia artificial e politica.
      </p>
    </main>
  )
}

function SourceCard({
  name,
  description,
  url,
}: {
  name: string
  description: string
  url: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
        >
          {name}
        </a>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}
