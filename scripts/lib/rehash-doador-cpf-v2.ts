/**
 * Rehash estreito do `cpf_hash` de doador pessoa física com a chave v2 (#409).
 *
 * Não reingere nada: a linha de financiamento publicada continua com os mesmos
 * nomes, valores, tipos, CNPJs e ordem. A única mudança permitida é acrescentar
 * `cpf_hash` e `cpf_hash_versao` a um doador que ainda não tem hash, quando a
 * fonte oficial do mesmo pleito (mesmo SQ e UF) dá exatamente um CPF para
 * aquele nome. A lista completa de doadores vem do ingest canônico em dry-run
 * (`planStorageRows`), então a regra de exclusividade CNPJ/CPF e a
 * normalização de nome são as mesmas do ingest.
 */
import { createHash } from "node:crypto"
import { DONOR_CPF_HASH_VERSION } from "../../src/lib/financiamento-doador-identifiers"
import { stripAccents } from "../../src/lib/strip-accents"

/**
 * Impressão digital da chave v2 (16 hex de sha256("pf-cpf-hash-v2-fp:" + chave)).
 * Não revela a chave; serve para recusar execução com chave errada antes de
 * gravar hash que nunca casaria com os 690 já gravados.
 */
export const DONOR_CPF_HASH_V2_FINGERPRINT = "126d0c6a9e66cc26"

export function fingerprintDaChave(chave: string): string {
  return createHash("sha256").update(`pf-cpf-hash-v2-fp:${chave.trim()}`).digest("hex").slice(0, 16)
}

/** Lança se a chave presente não é a v2 registrada. */
export function exigirChaveV2(chave: string | undefined): void {
  if (!chave?.trim()) throw new Error("PF_DOADOR_CPF_HASH_SALT ausente: rehash e coleta com CPF exigem a chave v2")
  const fp = fingerprintDaChave(chave)
  if (fp !== DONOR_CPF_HASH_V2_FINGERPRINT) {
    throw new Error(`PF_DOADOR_CPF_HASH_SALT não é a chave v2 (impressão ${fp}); nada foi gravado`)
  }
}

/** Mesma normalização de `aggregateMaioresDoadores` em src/lib/financiamento-public.ts. */
export function normalizarNomeDoador(value: unknown): string {
  return typeof value === "string" ? stripAccents(value).replace(/\s+/g, " ").toUpperCase().trim() : ""
}

type Doador = Record<string, unknown>

export interface LinhaFinanciamentoAtual {
  id: string
  candidato_id: string
  ano_eleicao: number
  sq_candidato: string | null
  uf_candidatura: string | null
  maiores_doadores: unknown
}

export type DesfechoRehash =
  | { tipo: "atualizar"; id: string; antes: Doador[]; depois: Doador[]; hashes_novos: number }
  | { tipo: "inalterado"; id: string }
  | { tipo: "sem_fonte"; id: string }
  | {
      tipo: "parcial"
      id: string
      antes: Doador[]
      depois: Doador[]
      hashes_novos: number
      sem_correspondencia: number
    }
  | { tipo: "conflito"; id: string; motivo: string }

function precisaHash(d: Doador): boolean {
  if (d.tipo !== "PF") return false
  return !(typeof d.cpf_hash === "string" && d.cpf_hash && d.cpf_hash_versao === DONOR_CPF_HASH_VERSION)
}

/**
 * Decide o rehash de uma linha. `doadoresFonte` é a lista completa normalizada
 * para armazenamento (um item por nome, `cpf_hash` só quando o nome tem um
 * único CPF e nenhum CNPJ), ou `null` quando o pacote não tem o pleito.
 */
export function planejarRehashLinha(
  atual: LinhaFinanciamentoAtual,
  doadoresFonte: Doador[] | null,
): DesfechoRehash {
  const antes = Array.isArray(atual.maiores_doadores) ? (atual.maiores_doadores as Doador[]) : []
  const pendentes = antes.filter(precisaHash)
  if (pendentes.length === 0) return { tipo: "inalterado", id: atual.id }
  if (!doadoresFonte) return { tipo: "sem_fonte", id: atual.id }

  const porNome = new Map<string, Doador>()
  for (const d of doadoresFonte) {
    const k = normalizarNomeDoador(d.nome)
    if (k) porNome.set(k, d)
  }

  let novos = 0
  let semCorrespondencia = 0
  const depois = antes.map((d) => {
    if (!precisaHash(d)) return d
    if (typeof d.cpf_hash === "string" && d.cpf_hash) {
      // Hash antigo (sem versão ou v1): nunca sobrescrito aqui; vai para revisão.
      semCorrespondencia++
      return d
    }
    const fonte = porNome.get(normalizarNomeDoador(d.nome))
    const hash = typeof fonte?.cpf_hash === "string" ? fonte.cpf_hash : null
    if (!hash || fonte?.cnpj) {
      semCorrespondencia++
      return d
    }
    novos++
    return { ...d, cpf_hash: hash, cpf_hash_versao: DONOR_CPF_HASH_VERSION }
  })

  const invariante = verificarSoHashMudou(antes, depois)
  if (invariante) return { tipo: "conflito", id: atual.id, motivo: invariante }
  if (novos === 0) return { tipo: "parcial", id: atual.id, antes, depois: antes, hashes_novos: 0, sem_correspondencia: semCorrespondencia }
  if (semCorrespondencia > 0) {
    return { tipo: "parcial", id: atual.id, antes, depois, hashes_novos: novos, sem_correspondencia: semCorrespondencia }
  }
  return { tipo: "atualizar", id: atual.id, antes, depois, hashes_novos: novos }
}

/** Devolve motivo quando algo além de `cpf_hash`/`cpf_hash_versao` mudou; `null` se ok. */
export function verificarSoHashMudou(antes: Doador[], depois: Doador[]): string | null {
  if (antes.length !== depois.length) return "quantidade de doadores mudou"
  for (let i = 0; i < antes.length; i++) {
    const a = antes[i]!
    const b = depois[i]!
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of chaves) {
      if (k === "cpf_hash" || k === "cpf_hash_versao") {
        if (a[k] !== undefined && a[k] !== b[k]) return `doador ${i}: ${k} existente seria alterado`
        continue
      }
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return `doador ${i}: campo ${k} mudaria`
    }
  }
  return null
}

export function chaveContexto(candidatoId: string, ano: number, sq: unknown, uf: unknown): string {
  const t = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  return `${candidatoId}|${ano}|${t(sq)}|${t(uf).toUpperCase()}`
}
