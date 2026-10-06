import Link from "next/link"
import { pinturaDoGovernador, type CorGovernadorUf } from "@/lib/mapa-governadores-espectro"
import type { ClasseEspectro } from "@/lib/espectro-eleitos"

const CLASSES: Array<{ classe: ClasseEspectro; rotulo: string }> = [
  { classe: "esquerda", rotulo: "Esquerda" },
  { classe: "centro", rotulo: "Centro" },
  { classe: "direita", rotulo: "Direita" },
]

function Amostra({ cor }: { cor: string }) {
  return <span className="size-3.5 shrink-0 rounded-sm border border-foreground/20" style={{ backgroundColor: cor }} aria-hidden />
}

/** Legenda do mapa de governadores: cor cheia para eleito, tom claro para quem lidera rumo ao 2º turno. */
export function LegendaEspectroGovernadores({ cores }: { cores: readonly CorGovernadorUf[] }) {
  if (cores.length === 0) return null
  const presentes = (situacao: CorGovernadorUf["situacao"]) =>
    CLASSES.filter(({ classe }) => cores.some((c) => c.classe === classe && c.situacao === situacao))
  const linhas = [
    { situacao: "eleito" as const, titulo: "Eleito no 1º turno" },
    { situacao: "lidera_2turno" as const, titulo: "2º turno, lado de quem ficou na frente" },
  ]
  return (
    <div className="mt-5 flex flex-col gap-2 text-[length:var(--text-body-sm)] text-foreground" data-pf-mapa-legenda-espectro="">
      {linhas.map(({ situacao, titulo }) => {
        const classes = presentes(situacao)
        if (classes.length === 0) return null
        return (
          <div key={situacao} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="font-semibold">{titulo}:</span>
            {classes.map(({ classe, rotulo }) => (
              <span key={classe} className="inline-flex items-center gap-1.5">
                <Amostra cor={pinturaDoGovernador({ classe, situacao })!.top} />
                {rotulo}
              </span>
            ))}
          </div>
        )
      })}
      <p className="text-muted-foreground">
        Cor pelo partido do governador, na{" "}
        <Link href="/quiz/metodologia" className="underline underline-offset-4">
          classificação do Puxa Ficha
        </Link>
        . Resultado: TSE.
      </p>
    </div>
  )
}
