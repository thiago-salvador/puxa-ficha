import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const ARQUIVO = fileURLToPath(new URL("../data/processos-decisao-editorial.json", import.meta.url))
const HASH = /^[0-9a-f]{64}$/
const CAMPOS = ["schema_version", "kind", "chave", "gerado_em", "origem", "nao_publicar"]

function objeto(valor: unknown): Record<string, unknown> {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    throw new Error("decisao editorial: objeto esperado")
  }
  return valor as Record<string, unknown>
}

export function validarDecisoes(valor: unknown): ReadonlySet<string> {
  const dados = objeto(valor)
  if (Object.keys(dados).sort().join("|") !== [...CAMPOS].sort().join("|")) {
    throw new Error("decisao editorial: chave ou campo inesperado")
  }
  if (dados.schema_version !== 1 || dados.kind !== "processos-decisao-editorial"
    || dados.chave !== "sha256(slug|cnj_digitos)") {
    throw new Error("decisao editorial: contrato invalido")
  }
  if (typeof dados.gerado_em !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dados.gerado_em)
    || Number.isNaN(Date.parse(`${dados.gerado_em}T00:00:00Z`))
    || new Date(`${dados.gerado_em}T00:00:00Z`).toISOString().slice(0, 10) !== dados.gerado_em) {
    throw new Error("decisao editorial: gerado_em invalido")
  }
  if (typeof dados.origem !== "string" || !dados.origem.trim()) {
    throw new Error("decisao editorial: origem invalida")
  }
  if (!Array.isArray(dados.nao_publicar) || dados.nao_publicar.length === 0) {
    throw new Error("decisao editorial: nao_publicar vazio ou invalido")
  }
  let anterior = ""
  for (const valorHash of dados.nao_publicar) {
    if (typeof valorHash !== "string" || !HASH.test(valorHash)) {
      throw new Error("decisao editorial: hash invalido")
    }
    if (valorHash <= anterior) throw new Error("decisao editorial: hashes fora de ordem ou duplicados")
    anterior = valorHash
  }
  return new Set(dados.nao_publicar as string[])
}

export function carregarDecisoes(path = ARQUIVO): ReadonlySet<string> {
  return validarDecisoes(JSON.parse(readFileSync(path, "utf8")) as unknown)
}

export function chaveDecisao(slug: string, cnj: string): string {
  return createHash("sha256").update(`${slug}|${cnj.replace(/\D/g, "")}`).digest("hex")
}

export function decididoNaoPublicar(decisoes: ReadonlySet<string>, slug: string, cnj: string): boolean {
  return decisoes.has(chaveDecisao(slug, cnj))
}
