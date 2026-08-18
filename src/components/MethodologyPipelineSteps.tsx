import { ProcessStep } from "./ProcessStep"

const PIPELINE_STEPS = [
  {
    title: "Coleta de dados",
    description:
      "APIs REST oficiais (Câmara, Senado, CGU, TCU) são consultadas diariamente. CSVs do TSE são baixados semanalmente. Indicadores estaduais (IBGE, Ipea, Siconfi) são atualizados sob demanda.",
  },
  {
    title: "Processamento e cruzamento",
    description:
      "Os dados brutos são normalizados, deduplicados e cruzados entre fontes. Candidaturas são vinculadas ao histórico eleitoral, de 1994 a 2024, patrimônio, votações e financiamento.",
  },
  {
    title: "Enriquecimento",
    description:
      "Biografias e fotos vêm da Wikipedia/Wikidata. Notícias recentes do Google News. Redes sociais entram quando disponíveis, com checagens automáticas de formato, dedupe e proveniência; curadoria editorial é usada quando o conteúdo vira claim público.",
  },
  {
    title: "Curadoria editorial",
    description:
      "Pontos de atenção, posições declaradas e contradições são tratados como conteúdo editorial; selos na ficha indicam o que já tem checagem por fonte, o que ainda aguarda verificação adicional ou o que veio de fluxo automático. Pontos gerados por IA só ficam públicos após checagem editorial registrada.",
  },
  {
    title: "Publicação",
    description:
      "Candidatos só ficam visíveis após passagem pelo gate de auditoria factual automatizado. Indicadores de frescor mostram a idade de cada seção nos perfis.",
  },
] as const

export function MethodologyPipelineSteps() {
  return (
    <div className="relative space-y-0">
      {PIPELINE_STEPS.map((step, i) => {
        const isLast = i === PIPELINE_STEPS.length - 1
        return (
          <ProcessStep
            key={step.title}
            index={i + 1}
            title={step.title}
            description={step.description}
            isLast={isLast}
          />
        )
      })}
    </div>
  )
}
