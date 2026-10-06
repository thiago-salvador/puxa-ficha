// cspell:ignore descricao
import { ChevronDown, ChevronUp } from "lucide-react"
import { BRAZIL_STATES } from "@/data/brazil-states"
import { formatarMargem, montarMapaPresidente } from "@/lib/mapa-presidente-uf"
import { formatarPercentual, type Resultados1Turno } from "@/lib/resultados-1turno"
import { TituloSecao } from "@/components/Resultado1TurnoPartes"
import { SlashDivider } from "@/components/SlashDivider"

const SEM_DADO_FILL = "var(--gray-200)"

/**
 * Mapa compacto do 1º turno para Presidente: cada UF pintada pela cor do lado
 * do partido do mais votado (mesma régua da barra do hero). Tudo do snapshot do
 * TSE; a tabela por estado, recolhida, é a alternativa acessível ao mapa.
 */
export function MapaPresidente1Turno({ data }: { data: Pick<Resultados1Turno, "presidente_por_uf"> }) {
  const mapa = montarMapaPresidente(data)
  if (!mapa) return null
  const porUf = new Map(mapa.linhas.map((l) => [l.uf, l]))
  const primeira = mapa.linhas.find((l) => l.dado)?.dado
  const nomes = primeira ? [primeira.finalistas[0].nome_urna, primeira.finalistas[1].nome_urna] : ["", ""]
  const maisApertada = mapa.linhas
    .filter((l) => l.dado)
    .sort((a, b) => (a.dado?.margem_pp ?? 0) - (b.dado?.margem_pp ?? 0))[0]
  const resumo = mapa.contagem.map((c) => `${c.nome_urna} em ${c.ufs} ${c.ufs === 1 ? "estado" : "estados"}`).join(", ")
  return (
    <section id="mapa-presidente-1turno" className="scroll-mt-24" aria-labelledby="mapa-presidente-1turno-titulo">
      <TituloSecao titulo="Presidente por estado" id="mapa-presidente-1turno-titulo">
        Quem teve mais votos válidos em cada estado no 1º turno.
      </TituloSecao>
      <SlashDivider className="mb-6 mt-6" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-start md:gap-10">
        <svg
          viewBox="-20 -20 870 950"
          role="group"
          aria-label={`Mapa do Brasil: mais votado para Presidente em cada estado. ${resumo}.`}
          className="mx-auto w-full max-w-[22rem]"
          data-pf-mapa-presidente
        >
          {BRAZIL_STATES.map((estado) => {
            const linha = porUf.get(estado.sigla)
            return (
              <path
                key={estado.sigla}
                d={estado.d}
                role="img"
                aria-label={linha?.descricao ?? `${estado.name}: sem dado`}
                data-pf-mapa-uf={estado.sigla}
                fill={linha?.cor?.cor ?? SEM_DADO_FILL}
                stroke="var(--background)"
                strokeWidth={estado.sigla === "DF" ? 2.4 : 1.2}
                className="transition-opacity duration-150 hover:opacity-80 motion-reduce:transition-none"
              >
                <title>{linha?.descricao ?? `${estado.name}: sem dado`}</title>
              </path>
            )
          })}
        </svg>
        <div className="min-w-0">
          <ul className="space-y-3" data-pf-mapa-contagem>
            {mapa.contagem.map((c) => (
              <li key={c.sq} className="flex items-baseline gap-3">
                <span
                  aria-hidden="true"
                  className="inline-block size-3 shrink-0 rounded-[2px] ring-1 ring-[var(--gray-950)]/20"
                  style={{ background: c.cor?.cor ?? SEM_DADO_FILL }}
                />
                <span className="min-w-0">
                  <span className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground">{c.nome_urna}</span>{" "}
                  <span className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                    {c.partido}
                    {c.cor ? ` · ${c.cor.rotulo}` : ""}
                  </span>
                  <span className="block text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                    mais votado em {c.ufs} {c.ufs === 1 ? "estado" : "estados"}
                  </span>
                </span>
              </li>
            ))}
            {mapa.semDado > 0 && (
              <li className="flex items-baseline gap-3 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                <span aria-hidden="true" className="inline-block size-3 shrink-0 rounded-[2px]" style={{ background: SEM_DADO_FILL }} />
                {mapa.semDado} {mapa.semDado === 1 ? "estado" : "estados"} sem dado
              </li>
            )}
          </ul>
          {maisApertada?.dado && (
            <p className="mt-4 max-w-prose text-[length:var(--text-body-sm)] font-medium text-muted-foreground" data-pf-mapa-mais-apertada={maisApertada.uf}>
              Disputa mais apertada: {maisApertada.nome}, onde {maisApertada.dado.vencedor.nome_urna} ficou à frente por{" "}
              {/* A margem já termina em "p.p.": sem ponto final extra. */}
              {formatarMargem(maisApertada.dado.margem_pp)}
            </p>
          )}
          <details className="group mt-5 border-y border-border" data-pf-mapa-tabela>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-[length:var(--text-body-sm)] font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
              Ver tabela por estado
              <ChevronDown className="size-4 group-open:hidden" aria-hidden="true" />
              <ChevronUp className="hidden size-4 group-open:block" aria-hidden="true" />
            </summary>
            <div className="relative max-h-[28rem] overflow-auto pb-3">
              <table className="w-full text-left text-[length:var(--text-caption)] tabular-nums">
                <caption className="sr-only">Presidente, 1º turno: mais votado, percentuais dos válidos dos dois finalistas e margem em cada estado</caption>
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 font-semibold">Estado</th>
                    <th scope="col" className="py-2 pr-2 font-semibold">Mais votado</th>
                    <th scope="col" className="py-2 pr-2 text-right font-semibold">{nomes[0]}</th>
                    <th scope="col" className="py-2 pr-2 text-right font-semibold">{nomes[1]}</th>
                    <th scope="col" className="py-2 text-right font-semibold">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {mapa.linhas.map((l) => (
                    <tr key={l.uf} className="border-b border-border/60 last:border-0" data-pf-mapa-linha={l.uf}>
                      <th scope="row" className="py-1.5 pr-2 font-bold text-foreground">
                        <abbr title={l.nome} className="no-underline">{l.uf}</abbr>
                      </th>
                      <td className="py-1.5 pr-2 font-medium text-foreground">{l.vencedor?.nome_urna ?? "sem dado"}</td>
                      <td className="py-1.5 pr-2 text-right font-medium">{l.dado ? formatarPercentual(l.dado.finalistas[0].percentual_validos) : "sem dado"}</td>
                      <td className="py-1.5 pr-2 text-right font-medium">{l.dado ? formatarPercentual(l.dado.finalistas[1].percentual_validos) : "sem dado"}</td>
                      <td className="py-1.5 text-right font-medium">{l.dado ? formatarMargem(l.dado.margem_pp) : "sem dado"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="mt-3 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
            Percentuais dos votos válidos. Cor pelo lado do partido do mais votado, a mesma da barra do topo. Fonte: TSE, arquivo de cada estado.
          </p>
        </div>
      </div>
    </section>
  )
}
