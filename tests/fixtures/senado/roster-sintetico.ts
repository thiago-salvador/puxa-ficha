/**
 * Roster Senado 2026 sintético para testes de contrato.
 *
 * Substitui a leitura do manifesto local gerado a partir do pacote oficial do
 * TSE, que não é versionado. Nenhuma pessoa, SQ ou coligação aqui é real: os
 * nomes são fictícios e os SQs são curtos de propósito, para que nada se
 * confunda com identificador oficial ou documento pessoal.
 *
 * Cada UF recebe uma chapa completa (titular, 1º e 2º suplentes) com
 * julgamento DEFERIDO no complementar. O resultado do pleito ainda não
 * publicado vem como `#NE`, como no pacote oficial, para exercitar a regra de
 * que a situação estruturada vem do julgamento.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildSenadoRosterManifest, type SenadoRosterManifest } from "../../../scripts/lib/tse-roster"

export const UFS_SINTETICAS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

/** Titular SP usado pelos testes de perfil; os campos declarados vivem no teste. */
export const PERFIL_SINTETICO = {
  uf: "SP",
  nome_completo: "PESSOA PERFIL SINTETICA",
  nome_urna: "PERFIL SINTETICO",
  partido: "PTESTE",
} as const

/** Duas titularidades em UFs distintas com o mesmo nome completo. */
export const HOMONIMO_SINTETICO = {
  nome_completo: "PESSOA HOMONIMA SINTETICA",
  ufs: ["MG", "RJ"],
} as const

const CABECALHO_BASE = [
  "ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_CARGO", "DS_CARGO", "SQ_CANDIDATO", "NR_CANDIDATO",
  "NM_CANDIDATO", "NM_URNA_CANDIDATO", "SG_PARTIDO", "NM_PARTIDO", "SQ_COLIGACAO",
]
const CABECALHO_COMPLEMENTO = [
  "ANO_ELEICAO", "SG_UF", "SQ_CANDIDATO", "CD_SITUACAO_JULGAMENTO", "DS_SITUACAO_JULGAMENTO",
  "DS_SITUACAO_CANDIDATO_PLEITO", "ST_SUBSTITUIDO", "SQ_SUBSTITUIDO",
]

const linhaCsv = (valores: readonly (string | number)[]) => valores.map((valor) => `"${valor}"`).join(";")

/** SQ curto e determinístico: índice da UF (1..27) seguido do papel (1..3). */
export function sqSintetico(uf: string, papel: 1 | 2 | 3): string {
  const indice = UFS_SINTETICAS.indexOf(uf as (typeof UFS_SINTETICAS)[number])
  if (indice < 0) throw new Error(`UF fora do roster sintético: ${uf}`)
  return `${indice + 1}0${papel}`
}

function nomeTitular(uf: string): string {
  if (uf === PERFIL_SINTETICO.uf) return PERFIL_SINTETICO.nome_completo
  if ((HOMONIMO_SINTETICO.ufs as readonly string[]).includes(uf)) return HOMONIMO_SINTETICO.nome_completo
  return `TITULAR SINTETICO ${uf}`
}

function nomeUrnaTitular(uf: string): string {
  return uf === PERFIL_SINTETICO.uf ? PERFIL_SINTETICO.nome_urna : `TITULAR ${uf}`
}

export interface FontesRosterSintetico {
  dir: string
  snapshotPath: string
  complementPath: string
  cleanup(): void
}

/** Escreve snapshot e complementar sintéticos em diretório temporário. */
export function escreverFontesRosterSintetico(): FontesRosterSintetico {
  const dir = mkdtempSync(join(tmpdir(), "pf-senado-roster-sintetico-"))
  const base = [linhaCsv(CABECALHO_BASE)]
  const complemento = [linhaCsv(CABECALHO_COMPLEMENTO)]
  UFS_SINTETICAS.forEach((uf, indice) => {
    const coligacao = `${900 + indice}`
    const numero = `${10 + indice}`
    const partido = uf === PERFIL_SINTETICO.uf ? PERFIL_SINTETICO.partido : "PTESTE"
    const pessoas: Array<[1 | 2 | 3, string, string, string, string]> = [
      [1, "5", "SENADOR", nomeTitular(uf), nomeUrnaTitular(uf)],
      [2, "9", "1º SUPLENTE", `PRIMEIRO SUPLENTE SINTETICO ${uf}`, `SUPLENTE UM ${uf}`],
      [3, "10", "2º SUPLENTE", `SEGUNDO SUPLENTE SINTETICO ${uf}`, `SUPLENTE DOIS ${uf}`],
    ]
    for (const [papel, codigo, descricao, nome, urna] of pessoas) {
      const sq = sqSintetico(uf, papel)
      base.push(linhaCsv([2026, 1, uf, codigo, descricao, sq, numero, nome, urna, partido, "PARTIDO DE TESTE", coligacao]))
      complemento.push(linhaCsv([2026, uf, sq, 2, "DEFERIDO", "#NE", "N", -1]))
    }
  })
  const snapshotPath = join(dir, "consulta_cand_sintetico.csv")
  const complementPath = join(dir, "consulta_cand_complementar_sintetico.csv")
  writeFileSync(snapshotPath, base.join("\n"), "latin1")
  writeFileSync(complementPath, complemento.join("\n"), "latin1")
  return { dir, snapshotPath, complementPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Manifesto construído pelo mesmo builder de produção sobre as fontes sintéticas. */
export function buildRosterSintetico(generatedAt = "2026-09-14T00:00:00.000Z"): SenadoRosterManifest {
  const fontes = escreverFontesRosterSintetico()
  try {
    return buildSenadoRosterManifest({ snapshotPath: fontes.snapshotPath, complementPath: fontes.complementPath, generatedAt })
  } finally {
    fontes.cleanup()
  }
}
