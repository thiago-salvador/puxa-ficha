/**
 * Recorte do 2º turno para a seção /imprensa. Puro: lê o snapshot oficial do
 * 1º turno (TSE) e separa quem segue na disputa de quem fica no histórico.
 * Nenhum número é digitado aqui; tudo sai de `resultados-1turno-2026.json`.
 */
import { getResultados1Turno, type CandidatoResultado1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"
import { finalistasDaDisputa } from "@/lib/segundo-turno-2026"

export type Finalistas = [CandidatoResultado1Turno, CandidatoResultado1Turno]

export interface DueloImprensa {
  uf: string
  finalistas: Finalistas
}

export interface SegundoTurnoImprensa {
  /** Os dois finalistas a presidente, na ordem de votos do 1º turno; null sem disputa definida. */
  presidencia: Finalistas | null
  /** Duelos de governador, em ordem alfabética de UF. */
  duelos: DueloImprensa[]
  /** Governador eleito no 1º turno, por UF. */
  governadorEleito: ReadonlyMap<string, CandidatoResultado1Turno>
  /** Slugs de todas as fichas que seguem no 2º turno. */
  slugs: ReadonlySet<string>
}

export type StatusUfImprensa =
  | { kind: "segundo_turno"; finalistas: Finalistas }
  | { kind: "eleito_1turno"; eleito: CandidatoResultado1Turno }
  | { kind: "sem_resultado" }

export function segundoTurnoImprensa(data: Pick<Resultados1Turno, "disputas"> = getResultados1Turno()): SegundoTurnoImprensa {
  let presidencia: Finalistas | null = null
  const duelos: DueloImprensa[] = []
  const governadorEleito = new Map<string, CandidatoResultado1Turno>()
  const slugs = new Set<string>()
  for (const disputa of data.disputas) {
    if (disputa.cargo === "Senador") continue
    const finalistas = finalistasDaDisputa(disputa)
    if (finalistas) {
      for (const c of finalistas) if (c.slug) slugs.add(c.slug)
      if (disputa.cargo === "Presidente") presidencia = finalistas
      else duelos.push({ uf: disputa.uf, finalistas })
      continue
    }
    if (disputa.cargo === "Governador") {
      const eleito = disputa.candidatos.find((c) => c.fase === "eleito")
      if (eleito) governadorEleito.set(disputa.uf, eleito)
    }
  }
  duelos.sort((a, b) => a.uf.localeCompare(b.uf))
  return { presidencia, duelos, governadorEleito, slugs }
}

export function statusUfImprensa(segundo: SegundoTurnoImprensa, uf: string): StatusUfImprensa {
  const upper = uf.toUpperCase()
  const duelo = segundo.duelos.find((item) => item.uf === upper)
  if (duelo) return { kind: "segundo_turno", finalistas: duelo.finalistas }
  const eleito = segundo.governadorEleito.get(upper)
  return eleito ? { kind: "eleito_1turno", eleito } : { kind: "sem_resultado" }
}

/** Separa as linhas entre quem segue no 2º turno e o histórico do 1º turno, preservando a ordem. */
export function separarPorTurno<R extends { slug: string }>(rows: readonly R[], slugs: ReadonlySet<string>): { segundoTurno: R[]; historico: R[] } {
  const segundoTurno: R[] = []
  const historico: R[] = []
  for (const row of rows) (slugs.has(row.slug) ? segundoTurno : historico).push(row)
  return { segundoTurno, historico }
}

/** Mantém só as linhas do 2º turno quando o recorte pede; sem recorte, devolve tudo. */
export function aplicarRecorteTurno<R extends { slug: string }>(rows: readonly R[], turno: 2 | null, slugs: ReadonlySet<string>): R[] {
  return turno === 2 ? rows.filter((row) => slugs.has(row.slug)) : [...rows]
}

/**
 * Dataset com as linhas do recorte de turno; sem recorte, o mesmo objeto. O
 * recorte também entra em `filters.turno`, que o export publica no JSON e no
 * header de filtros.
 */
export function datasetDoTurno<D extends { rows: ReadonlyArray<{ slug: string }>; filters?: object }>(dataset: D, turno: 2 | null, slugs: ReadonlySet<string> = segundoTurnoImprensa().slugs): D {
  if (turno !== 2) return dataset
  return {
    ...dataset,
    rows: aplicarRecorteTurno(dataset.rows, turno, slugs),
    ...(dataset.filters ? { filters: { ...dataset.filters, turno } } : {}),
  }
}

/** Opções de cargo e UF da Mesa no 2º turno, lidas do snapshot: não dependem do filtro aplicado. */
export function opcoesMesa2Turno(segundo: SegundoTurnoImprensa = segundoTurnoImprensa()): { cargos: string[]; ufs: string[] } {
  return {
    cargos: [...(segundo.duelos.length ? ["Governador"] : []), ...(segundo.presidencia ? ["Presidente"] : [])],
    ufs: segundo.duelos.map((duelo) => duelo.uf),
  }
}

/** Nome do arquivo exportado: o recorte do 2º turno ganha o sufixo `-2turno` antes da extensão. */
export function nomeExportTurno(nome: string, turno: 2 | null): string {
  return turno === 2 ? nome.replace(/(\.[a-z]+)$/, "-2turno$1") : nome
}

/** "6 estados e o Distrito Federal": o DF não é estado, então entra pelo nome. */
export function rotuloUfs(ufs: readonly string[]): string {
  const temDf = ufs.some((uf) => uf.toUpperCase() === "DF")
  const estados = ufs.length - (temDf ? 1 : 0)
  const parteEstados = estados === 0 ? "" : `${estados} ${estados === 1 ? "estado" : "estados"}`
  if (!temDf) return parteEstados
  return parteEstados ? `${parteEstados} e o Distrito Federal` : "o Distrito Federal"
}
