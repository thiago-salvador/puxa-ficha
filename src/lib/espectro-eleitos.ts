/**
 * Espectro político dos eleitos no 1º turno.
 *
 * Conta só quem o TSE já marcou como eleito (Governador e Senador com fase
 * "eleito", mais as bancadas de deputados). Presidente é decidido no 2º turno e
 * não entra. A classe é do PARTIDO, no mapa editorial de dois eixos do quiz
 * (`getEspectroPartidario`), nunca da pessoa eleita. Partido fora do mapa fica
 * em "sem classificação": não se adivinha.
 */
import { getEspectroPartidario } from "@/data/quiz/espectro-partidario"
import { resolveCanonicalPartySigla } from "@/lib/party-utils"
import type { Resultados1Turno } from "@/lib/resultados-1turno"

export type ClasseEspectro = "esquerda" | "centro" | "direita" | "sem_classificacao"

export type CargoEspectro = "Governador" | "Senador" | "Deputado Federal" | "Deputado Estadual e Distrital"

const CARGOS_ESPECTRO: CargoEspectro[] = ["Governador", "Senador", "Deputado Federal", "Deputado Estadual e Distrital"]

/** Média abaixo disto é esquerda. */
const LIMITE_ESQUERDA = 4.5
/** Média acima disto é direita; de 4,5 a 5,5 (inclusive) é centro. */
const LIMITE_DIREITA = 5.5

export interface PartidoEspectro {
  sigla: string
  eleitos: number
  classe: ClasseEspectro
}

export interface LinhaEspectro {
  cargo: CargoEspectro | "Total"
  eleitos: number
  vagas: number
  esquerda: number
  centro: number
  direita: number
  sem_classificacao: number
  partidos: PartidoEspectro[]
}

export interface PendenciaEspectro {
  cargo: CargoEspectro
  ufs: string[]
}

export interface MetodologiaEspectro {
  /** Partidos distintos classificados entre os eleitos. */
  partidos: number
  /** Partidos com os dois eixos ancorados em documento do próprio partido. */
  fonte_nos_dois_eixos: number
  /** Partidos com pelo menos um eixo de curadoria editorial. */
  com_curadoria: number
}

export interface EspectroEleitos {
  linhas: LinhaEspectro[]
  total: LinhaEspectro
  pendencias: PendenciaEspectro[]
  metodologia: MetodologiaEspectro
}

/** Classe da média dos dois eixos: < 4,5 esquerda, 4,5 a 5,5 centro, > 5,5 direita. */
export function classeDaMedia(media: number): Exclude<ClasseEspectro, "sem_classificacao"> {
  if (media < LIMITE_ESQUERDA) return "esquerda"
  if (media > LIMITE_DIREITA) return "direita"
  return "centro"
}

/** Classe do partido pela sigla do TSE (resolve "PC do B", "UNIÃO" etc.); fora do mapa, "sem_classificacao". */
export function classificarEspectro(sigla: string | null | undefined): ClasseEspectro {
  const espectro = getEspectroPartidario(sigla)
  if (!espectro) return "sem_classificacao"
  return classeDaMedia((espectro.eixo_economico + espectro.eixo_social) / 2)
}

/** Rótulo da classe para tela. */
export function rotuloClasseEspectro(classe: ClasseEspectro): string {
  switch (classe) {
    case "esquerda":
      return "Esquerda"
    case "centro":
      return "Centro"
    case "direita":
      return "Direita"
    case "sem_classificacao":
      return "Sem classificação"
  }
}

function chavePartido(sigla: string | null | undefined): string {
  const limpa = (sigla ?? "").trim()
  if (!limpa) return "Sem sigla"
  return resolveCanonicalPartySigla(limpa) ?? limpa.toUpperCase()
}

function novaLinha(cargo: LinhaEspectro["cargo"]): LinhaEspectro {
  return { cargo, eleitos: 0, vagas: 0, esquerda: 0, centro: 0, direita: 0, sem_classificacao: 0, partidos: [] }
}

function somarPartidos(grupos: Map<string, number>[]): PartidoEspectro[] {
  const soma = new Map<string, number>()
  for (const g of grupos) for (const [sigla, n] of g) soma.set(sigla, (soma.get(sigla) ?? 0) + n)
  return [...soma.entries()]
    .map(([sigla, eleitos]) => ({ sigla, eleitos, classe: classificarEspectro(sigla) }))
    .sort((a, b) => b.eleitos - a.eleitos || a.sigla.localeCompare(b.sigla, "pt-BR"))
}

function fecharLinha(linha: LinhaEspectro, porPartido: Map<string, number>[]): LinhaEspectro {
  linha.partidos = somarPartidos(porPartido)
  for (const p of linha.partidos) {
    linha.eleitos += p.eleitos
    linha[p.classe] += p.eleitos
  }
  return linha
}

export function contarEspectroEleitos(data: Resultados1Turno): EspectroEleitos {
  const porCargo = new Map<CargoEspectro, { vagas: number; partidos: Map<string, number>; ufsPendentes: Set<string> }>()
  for (const cargo of CARGOS_ESPECTRO) porCargo.set(cargo, { vagas: 0, partidos: new Map(), ufsPendentes: new Set() })

  const registrarDisputa = (cargo: CargoEspectro, uf: string, vagas: number, eleitos: string[], oficial: boolean) => {
    const alvo = porCargo.get(cargo)!
    alvo.vagas += vagas
    for (const partido of eleitos) {
      const k = chavePartido(partido)
      alvo.partidos.set(k, (alvo.partidos.get(k) ?? 0) + 1)
    }
    if (!oficial || eleitos.length < vagas) alvo.ufsPendentes.add(uf.toUpperCase())
  }

  // Presidente fica de fora: a disputa vai ao 2º turno.
  for (const d of data.disputas) {
    if (d.cargo !== "Governador" && d.cargo !== "Senador") continue
    const eleitos = d.candidatos.filter((c) => c.fase === "eleito").map((c) => c.partido)
    registrarDisputa(d.cargo, d.uf, d.vagas, eleitos, d.fechamento_oficial)
  }

  for (const b of data.bancadas ?? []) {
    const cargo: CargoEspectro = b.cargo === "Deputado Federal" ? "Deputado Federal" : "Deputado Estadual e Distrital"
    const vistos = new Set<string>()
    const partidos: string[] = []
    for (const e of b.eleitos) {
      if (vistos.has(e.sq)) continue
      vistos.add(e.sq)
      partidos.push(e.partido)
    }
    registrarDisputa(cargo, b.uf, b.vagas, partidos, b.fechamento_oficial)
  }

  const linhas = CARGOS_ESPECTRO.map((cargo) => {
    const alvo = porCargo.get(cargo)!
    const linha = novaLinha(cargo)
    linha.vagas = alvo.vagas
    return fecharLinha(linha, [alvo.partidos])
  })

  const total = novaLinha("Total")
  total.vagas = linhas.reduce((s, l) => s + l.vagas, 0)
  fecharLinha(
    total,
    linhas.map((l) => new Map(l.partidos.map((p) => [p.sigla, p.eleitos] as const))),
  )

  const pendencias: PendenciaEspectro[] = CARGOS_ESPECTRO.flatMap((cargo) => {
    const ufs = [...porCargo.get(cargo)!.ufsPendentes].sort((a, b) => a.localeCompare(b, "pt-BR"))
    return ufs.length > 0 ? [{ cargo, ufs }] : []
  })

  let fonteNosDoisEixos = 0
  let comCuradoria = 0
  let partidosClassificados = 0
  for (const p of total.partidos) {
    const e = getEspectroPartidario(p.sigla)
    if (!e) continue
    partidosClassificados += 1
    if (e.fonte_economico.tipo !== "curadoria" && e.fonte_social.tipo !== "curadoria") fonteNosDoisEixos += 1
    else comCuradoria += 1
  }

  return {
    linhas,
    total,
    pendencias,
    metodologia: { partidos: partidosClassificados, fonte_nos_dois_eixos: fonteNosDoisEixos, com_curadoria: comCuradoria },
  }
}
