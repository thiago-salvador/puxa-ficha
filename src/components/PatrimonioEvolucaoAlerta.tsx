import type { PatrimonioAnoValor } from "@/lib/evolucao-patrimonial"
import { alertaEvolucaoPatrimonialVs2026 } from "@/lib/evolucao-patrimonial"
import { formatBRL } from "@/lib/utils"
import { NoticePanel } from "./NoticePanel"

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
      title="Evolução patrimonial acima de R$ 1 milhão"
      description={
        <>
          O patrimônio declarado aumentou <strong>{formatBRL(alerta.aumento)}</strong> entre {alerta.anoAnterior} e{" "}
          {alerta.anoAlvo}. O sinal mostra apenas a variação dos valores declarados ao TSE e não determina sua causa.
        </>
      }
      className={className}
      data-pf-patrimonio-evolucao-alerta={alerta.aumento}
      data-pf-patrimonio-evolucao-de={alerta.anoAnterior}
      data-pf-patrimonio-evolucao-ate={alerta.anoAlvo}
    />
  )
}
