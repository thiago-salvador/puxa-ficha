import type { MethodologySource } from "@/data/methodology-sources"
import { TrackedExternalSourceLink } from "./TrackedExternalSourceLink"
import { MetaBadge } from "./MetaBadge"

const FREQUENCY_LABEL: Record<MethodologySource["updateFrequency"], string> = {
  "diária": "Atualização diária",
  "semanal": "Atualização semanal",
  "mensal": "Atualização mensal",
  "por ciclo eleitoral": "Por ciclo eleitoral",
  "sob demanda": "Sob demanda",
}

const CURATION_CONFIG: Record<
  MethodologySource["curationType"],
  { label: string; tone: "neutral" | "muted" | "caution" }
> = {
  "automático": {
    label: "Automático",
    tone: "neutral",
  },
  curadoria: {
    label: "Curadoria editorial",
    tone: "muted",
  },
  misto: {
    label: "Automático + curadoria",
    tone: "caution",
  },
}

const SOURCE_KIND_CONFIG: Record<
  MethodologySource["sourceKind"],
  { label: string; tone: "neutral" | "muted" }
> = {
  base_oficial: {
    label: "Base oficial",
    tone: "neutral",
  },
  fonte_publica_complementar: {
    label: "Fonte complementar",
    tone: "muted",
  },
}

interface MethodologySourceCardProps {
  source: MethodologySource
}

export function MethodologySourceCard({ source }: MethodologySourceCardProps) {
  const curation = CURATION_CONFIG[source.curationType]
  const sourceKind = SOURCE_KIND_CONFIG[source.sourceKind]

  return (
    <div className="rounded-[12px] border border-border/50 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TrackedExternalSourceLink
          area="metodologia"
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[length:var(--text-body-sm)] font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60 sm:text-[length:var(--text-body)]"
        >
          {source.name}
        </TrackedExternalSourceLink>
        <div className="flex flex-wrap gap-1.5">
          <MetaBadge tone={sourceKind.tone}>
            {sourceKind.label}
          </MetaBadge>
          <MetaBadge tone={curation.tone}>
            {curation.label}
          </MetaBadge>
          <MetaBadge tone="muted">
            {FREQUENCY_LABEL[source.updateFrequency]}
          </MetaBadge>
        </div>
      </div>

      <p className="mt-2 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground sm:text-[length:var(--text-body-sm)]">
        {source.description}
      </p>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {source.dataTypes.map((dt) => (
          <li
            key={dt}
            className="rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-foreground"
          >
            {dt}
          </li>
        ))}
      </ul>

      {source.curationNote && (
        <p className="mt-2.5 text-[11px] font-medium italic leading-snug text-muted-foreground">
          {source.curationNote}
        </p>
      )}
    </div>
  )
}
