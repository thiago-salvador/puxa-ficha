import type { PatrimonioAnoValor } from "@/lib/evolucao-patrimonial"
import {
  alertaEvolucaoPatrimonialVs2026,
  fonteDadosAbertosPatrimonioTse,
} from "@/lib/evolucao-patrimonial"
import { patrimonioDeclaradoAtipico, PATRIMONIO_ATIPICO_ROTULO } from "@/lib/patrimonio-atipico"
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
  // Valor atípico tem precedência: repetir "aumentou R$ X" amplificaria um
  // salto de ordem de grandeza que o próprio aviso pede para ler com cautela.
  const atipico = patrimonioDeclaradoAtipico(patrimonio)
  if (atipico) {
    const rotulo = PATRIMONIO_ATIPICO_ROTULO.charAt(0).toUpperCase() + PATRIMONIO_ATIPICO_ROTULO.slice(1)
    return (
      <NoticePanel
        role="note"
        tone="caution"
        eyebrow="Valor atípico"
        title={rotulo}
        description={
          <>
            O total declarado ao TSE em {atipico.anoAlvo} (<strong>{formatBRL(atipico.valorAlvo)}</strong>) é{" "}
            {Math.floor(atipico.fator).toLocaleString("pt-BR")} vezes o total declarado em {atipico.anoAnterior} (
            {formatBRL(atipico.valorAnterior)}). O valor oficial segue exibido como publicado; o aviso não indica erro
            nem causa.{" "}Fontes oficiais:{" "}
            <TrackedExternalSourceLink
              area="patrimonio_evolucao"
              href={fonteDadosAbertosPatrimonioTse(atipico.anoAnterior)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              TSE {atipico.anoAnterior}
            </TrackedExternalSourceLink>{" "}
            e{" "}
            <TrackedExternalSourceLink
              area="patrimonio_evolucao"
              href={fonteDadosAbertosPatrimonioTse(atipico.anoAlvo)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              TSE {atipico.anoAlvo}
            </TrackedExternalSourceLink>
            .
          </>
        }
        className={className}
        data-pf-patrimonio-atipico={atipico.anoAlvo}
        data-pf-patrimonio-atipico-base={atipico.anoAnterior}
      />
    )
  }

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
