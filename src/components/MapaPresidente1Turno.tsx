// cspell:ignore descricao diferenca eleitorado legivel pcts
import { BRAZIL_STATES } from "@/data/brazil-states"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { corDoPartido } from "@/lib/cores-finalistas"
import { formatarMargem, montarMapaPresidente } from "@/lib/mapa-presidente-uf"
import { formatarPercentual, href1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"
import { TituloSecao } from "@/components/Resultado1TurnoPartes"
import { SlashDivider } from "@/components/SlashDivider"
import { RotulosMapaBrasil } from "@/components/RotulosMapaBrasil"
import { PresidentePorEstadoInterativo, type FinalistaLegenda, type UfPresidenteLinha } from "@/components/PresidentePorEstadoInterativo"

const SEM_DADO_FILL = "var(--gray-200)"
/** Quantas UFs aparecem com a tabela recolhida: as de maior eleitorado. */
const LISTA_CURTA = 8


/**
 * Presidente por estado no 1º turno: tabela dos dois finalistas por UF ao lado
 * do mapa pintado pela cor do lado do mais votado (a régua da barra do hero).
 * Tudo do snapshot do TSE. O servidor desenha o mapa e formata os números; o
 * cliente só guarda qual UF está aberta no painel.
 */
export function MapaPresidente1Turno({ data }: { data: Pick<Resultados1Turno, "presidente_por_uf"> }) {
  const mapa = montarMapaPresidente(data)
  const primeira = mapa?.linhas.find((l) => l.dado)?.dado
  if (!mapa || !primeira) return null
  const porUf = new Map(mapa.linhas.map((l) => [l.uf, l]))

  const validosNaUf = (l: (typeof mapa.linhas)[number]) => {
    const f = l.dado?.finalistas.find((x) => (x.percentual_validos ?? 0) > 0)
    return f ? f.votos / ((f.percentual_validos as number) / 100) : 0
  }
  const maiores = new Set([...mapa.linhas].sort((a, b) => validosNaUf(b) - validosNaUf(a)).slice(0, LISTA_CURTA).map((l) => l.uf))
  const inicial = [...mapa.linhas].sort((a, b) => validosNaUf(b) - validosNaUf(a))[0].uf

  const contagemPorSq = new Map(mapa.contagem.map((c) => [c.sq, c.ufs]))
  const finalistas = primeira.finalistas.map((f) => ({
    nome: nomeLegivel(f.nome_urna),
    partido: f.partido,
    cor: corDoPartido(f.partido)?.cor ?? null,
    ufs: contagemPorSq.get(f.sq) ?? 0,
  })) as [FinalistaLegenda, FinalistaLegenda]
  const outros = mapa.contagem.filter((c) => !primeira.finalistas.some((f) => f.sq === c.sq))

  const linhas: UfPresidenteLinha[] = mapa.linhas.map((l) => {
    const [a, b] = l.dado?.finalistas ?? [null, null]
    const pa = a?.percentual_validos ?? null
    const pb = b?.percentual_validos ?? null
    return {
      uf: l.uf,
      nome: l.nome,
      pcts: [pa, pb],
      textos: [formatarPercentual(pa), formatarPercentual(pb)],
      vencedor: l.vencedor ? { nome: nomeLegivel(l.vencedor.nome_urna), cor: l.cor?.cor ?? null } : null,
      diferenca: pa !== null && pb !== null ? formatarMargem(Math.abs(pa - pb)) : null,
      href: href1Turno(l.uf),
      destaque: maiores.has(l.uf),
    }
  })

  const resumo = mapa.contagem.map((c) => `${nomeLegivel(c.nome_urna)} em ${c.ufs} ${c.ufs === 1 ? "estado" : "estados"}`).join(", ")
  const svg = (
    <svg
      viewBox="-20 -20 900 950"
      role="group"
      aria-label={`Mapa do Brasil: mais votado para Presidente em cada estado. ${resumo}.`}
      className="block w-full"
      data-pf-mapa-presidente
    >
      {BRAZIL_STATES.map((estado) => {
        const linha = porUf.get(estado.sigla)
        return (
          <path
            key={estado.sigla}
            id={`pf-mapa-uf-${estado.sigla}`}
            d={estado.d}
            role="img"
            aria-label={linha?.descricao ?? `${estado.name}: sem dado`}
            data-pf-mapa-uf={estado.sigla}
            fill={linha?.cor?.cor ?? SEM_DADO_FILL}
            stroke="var(--background)"
            strokeWidth={estado.sigla === "DF" ? 2.4 : 1.2}
            className="cursor-pointer transition-opacity duration-150 hover:opacity-85 motion-reduce:transition-none"
          >
            <title>{linha?.descricao ?? `${estado.name}: sem dado`}</title>
          </path>
        )
      })}
      <RotulosMapaBrasil />
    </svg>
  )

  const legenda = (
    <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3" data-pf-mapa-contagem>
      {[...finalistas, ...outros.map((o) => ({ nome: nomeLegivel(o.nome_urna), partido: o.partido, cor: o.cor?.cor ?? null, ufs: o.ufs }))].map((c) => (
        <li key={c.nome} className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-1 inline-block size-3.5 shrink-0 rounded-full" style={{ background: c.cor ?? SEM_DADO_FILL }} />
          <span className="min-w-0 text-[length:var(--text-body-sm)] leading-snug">
            <span className="font-bold text-foreground">{c.nome}</span> <span className="font-medium text-muted-foreground">· {c.partido}</span>
            <span className="block font-medium tabular-nums text-muted-foreground">
              mais votado em {c.ufs} {c.ufs === 1 ? "UF" : "UFs"}
            </span>
          </span>
        </li>
      ))}
      {mapa.semDado > 0 && (
        <li className="flex items-start gap-3 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
          <span aria-hidden="true" className="mt-1 inline-block size-3.5 shrink-0 rounded-full" style={{ background: SEM_DADO_FILL }} />
          {mapa.semDado} {mapa.semDado === 1 ? "UF" : "UFs"} sem dado
        </li>
      )}
    </ul>
  )

  return (
    <section id="mapa-presidente-1turno" className="scroll-mt-24" aria-labelledby="mapa-presidente-1turno-titulo">
      <TituloSecao titulo="Presidente por estado" id="mapa-presidente-1turno-titulo">
        <span className="block text-[length:var(--text-body-sm)] uppercase text-muted-foreground">Resultado do 1º turno</span>
        <span className="mt-1 block">Quem teve mais votos válidos em cada estado.</span>
      </TituloSecao>
      <SlashDivider className="mb-6 mt-6" />
      <PresidentePorEstadoInterativo linhas={linhas} finalistas={finalistas} legenda={legenda} inicial={inicial} mapa={svg} />
      <p className="mt-8 border-t border-border pt-4 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
        Percentuais dos votos válidos no 1º turno. Fonte: TSE, arquivo de cada estado.
        <br />O mapa mostra o mais votado em cada UF, não o tamanho de cada eleitorado.
      </p>
    </section>
  )
}
