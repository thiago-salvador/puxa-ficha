import type { PatrimonioAnoValor } from "@/lib/evolucao-patrimonial"
import {
  alertaEvolucaoPatrimonialVs2026,
  fonteDadosAbertosPatrimonioTse,
} from "@/lib/evolucao-patrimonial"
import { formatBRL } from "@/lib/utils"
import { NoticePanel } from "./NoticePanel"
import { TrackedExternalSourceLink } from "./TrackedExternalSourceLink"

export function PatrimonioEvolucaoAlerta({
  patrimonio,
  className,
}: {
  patrimonio: PatrimonioAnoValor[]
  className?: string
}) {
  const alerta = alertaEvolucaoPatrimonialVs2026(patrimonio)
  if (!alerta) return null

  return (
    <NoticePanel
      role="note"
      tone="caution"
      eyebrow="Sinal de alerta"
      title="Aumento patrimonial expressivo"
      description={
        <>
          O patrimônio declarado aumentou <strong>{formatBRL(alerta.aumento)}</strong> entre {alerta.anoAnterior} e{" "}
          {alerta.anoAlvo}. O sinal mostra apenas a variação dos valores declarados ao TSE e não determina sua causa.
          {" "}Fontes oficiais:{" "}
          <TrackedExternalSourceLink
            area="patrimonio_evolucao"
            href={fonteDadosAbertosPatrimonioTse(alerta.anoAnterior)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            TSE {alerta.anoAnterior}
          </TrackedExternalSourceLink>{" "}
          e{" "}
          <TrackedExternalSourceLink
            area="patrimonio_evolucao"
            href={fonteDadosAbertosPatrimonioTse(alerta.anoAlvo)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            TSE {alerta.anoAlvo}
          </TrackedExternalSourceLink>
          .
        </>
      }
      className={className}
      data-pf-patrimonio-evolucao-alerta={alerta.aumento}
      data-pf-patrimonio-evolucao-de={alerta.anoAnterior}
      data-pf-patrimonio-evolucao-ate={alerta.anoAlvo}
    />
  )
}
