import { BRAZIL_STATES } from "@/data/brazil-states"

/** Estados pequenos demais para a sigla caber dentro: rótulo fora, com linha guia. */
const ROTULO_EXTERNO: Record<string, number> = { RN: 262, PB: 292, PE: 322, AL: 352, SE: 382 }
/** Ajustes de posição onde a sigla no centro colide com o vizinho. */
const ROTULO_DESLOCADO: Record<string, [number, number]> = { GO: [462, 512], DF: [552, 482] }

/**
 * Siglas das UFs sobre o mapa de `BRAZIL_STATES` (viewBox -20 -20 900 950).
 * `contorno` põe um halo escuro na sigla branca, para ler sobre listras.
 */
export function RotulosMapaBrasil({ contorno = false }: { contorno?: boolean }) {
  return (
    <g aria-hidden="true" className="pointer-events-none select-none font-sans" fontWeight={700}>
      {BRAZIL_STATES.map((estado) => {
        const externo = ROTULO_EXTERNO[estado.sigla]
        if (externo !== undefined) {
          return (
            <g key={estado.sigla}>
              <circle cx={estado.cx} cy={estado.cy} r={3.5} fill="var(--gray-950)" />
              <line x1={estado.cx} y1={estado.cy} x2={822} y2={externo} stroke="var(--gray-950)" strokeWidth={1.4} />
              <text x={830} y={externo} dominantBaseline="central" fontSize={22} fill="var(--gray-950)">
                {estado.sigla}
              </text>
            </g>
          )
        }
        const [x, y] = ROTULO_DESLOCADO[estado.sigla] ?? [estado.cx, estado.cy]
        const fora = estado.sigla === "DF"
        return (
          <text
            key={estado.sigla}
            x={x}
            y={y}
            textAnchor={fora ? "start" : "middle"}
            dominantBaseline="central"
            fontSize={["ES", "RJ", "SC", "DF"].includes(estado.sigla) ? 18 : 22}
            fill={fora ? "var(--gray-950)" : "#fff"}
            {...(contorno && !fora ? { stroke: "rgba(0,0,0,0.55)", strokeWidth: 4, paintOrder: "stroke" } : {})}
          >
            {estado.sigla}
          </text>
        )
      })}
    </g>
  )
}
