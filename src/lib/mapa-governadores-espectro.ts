import { classificarEspectro, rotuloClasseEspectro, type ClasseEspectro } from "@/lib/espectro-eleitos"
import { hasResultados1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"

/** Pintura de um estado no mapa (face de cima, lateral, hover) e cor da sigla. */
export interface PinturaEstado {
  top: string
  side: string
  hover: string
  /** Sigla escura sobre tons claros (2º turno); clara sobre a cor cheia. */
  siglaEscura: boolean
}

export type SituacaoGovernador = "eleito" | "lidera_2turno"

export interface CorGovernadorUf {
  uf: string
  classe: ClasseEspectro
  situacao: SituacaoGovernador
  nome: string
  partido: string
  descricao: string
}

const VAR_ESPECTRO: Partial<Record<ClasseEspectro, string>> = {
  esquerda: "var(--espectro-esquerda)",
  centro: "var(--espectro-centro)",
  direita: "var(--espectro-direita)",
}

/**
 * Lado de cada UF no mapa de governadores: o partido do eleito no 1º turno ou, com 2º turno,
 * o de quem ficou na frente no 1º turno (mais votos entre os dois finalistas). Partido sem
 * classe no mapa editorial fica de fora e o estado mantém a cor da região.
 */
export function coresGovernadoresPorUf(data: Resultados1Turno): CorGovernadorUf[] {
  if (!hasResultados1Turno(data)) return []
  const lista: CorGovernadorUf[] = []
  for (const d of data.disputas) {
    if (d.cargo !== "Governador") continue
    const eleito = d.candidatos.find((c) => c.fase === "eleito")
    const finalistas = d.candidatos.filter((c) => c.fase === "segundo_turno")
    const lider = eleito ?? (finalistas.length === 2 ? [...finalistas].sort((a, b) => b.votos - a.votos)[0] : undefined)
    if (!lider) continue
    if (!eleito && finalistas[0].votos === finalistas[1].votos) continue
    const classe = classificarEspectro(lider.partido)
    if (!VAR_ESPECTRO[classe]) continue
    const situacao: SituacaoGovernador = eleito ? "eleito" : "lidera_2turno"
    const lado = rotuloClasseEspectro(classe).toLowerCase()
    lista.push({
      uf: d.uf.toUpperCase(),
      classe,
      situacao,
      nome: lider.nome_urna,
      partido: lider.partido,
      descricao: eleito
        ? `${lider.nome_urna} (${lider.partido}) eleito no 1º turno, ${lado}`
        : `2º turno; ${lider.nome_urna} (${lider.partido}) ficou na frente no 1º turno, ${lado}`,
    })
  }
  return lista
}

/** Cor cheia para o eleito; o mesmo lado em tom claro para quem lidera rumo ao 2º turno. */
export function pinturaDoGovernador(cor: Pick<CorGovernadorUf, "classe" | "situacao">): PinturaEstado | null {
  const base = VAR_ESPECTRO[cor.classe]
  if (!base) return null
  if (cor.situacao === "eleito") {
    return {
      top: base,
      side: `color-mix(in srgb, ${base} 70%, black)`,
      hover: `color-mix(in srgb, ${base} 82%, white)`,
      siglaEscura: false,
    }
  }
  return {
    top: `color-mix(in srgb, ${base} 32%, white)`,
    side: `color-mix(in srgb, ${base} 52%, white)`,
    hover: `color-mix(in srgb, ${base} 22%, white)`,
    siglaEscura: true,
  }
}

export function pinturasPorUf(cores: readonly CorGovernadorUf[]): Record<string, PinturaEstado> {
  const out: Record<string, PinturaEstado> = {}
  for (const cor of cores) {
    const pintura = pinturaDoGovernador(cor)
    if (pintura) out[cor.uf] = pintura
  }
  return out
}
