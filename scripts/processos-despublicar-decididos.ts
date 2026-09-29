/**
 * Plano SHA-256: sha256(JSON.stringify([[id, preimagem_sha256], ...])),
 * pares ordenados por id em ordem crescente de code units. A preimagem usa
 * json.dumps(row, sort_keys=True, ensure_ascii=False) da linha retornada por select *.
 */
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { assertOutsideRepository } from "./audit/lib/private-output"
import { carregarDecisoes, decididoNaoPublicar } from "./lib/processos-decisao-editorial"
import { escreverAuditado as escreverAuditadoReal } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"

type Linha = Record<string, unknown>
type Cliente = typeof supabase
type Escritor = typeof escreverAuditadoReal
const HASH = /^[0-9a-f]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ItemPlano {
  id: string
  slug: string
  numero_cnj: string
  preimagem_sha256: string
}

interface Opcoes {
  plano: string
  out: string
  apply: boolean
  expectedPlanSha?: string
}

export interface Resumo {
  modo: "dry-run" | "apply"
  plano_sha256: string
  previstos: number
  conferidos: number
  excluidos: number
  pulados: string[]
  backup: string
}

export class CasSkipError extends Error {
  readonly exitCode = 4
}

function sha256(valor: string): string {
  return createHash("sha256").update(valor, "utf8").digest("hex")
}

function camposExatos(valor: unknown, esperados: string[], rotulo: string): Linha {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) throw new Error(`${rotulo}: objeto esperado`)
  const objeto = valor as Linha
  if (Object.keys(objeto).sort().join("|") !== [...esperados].sort().join("|")) {
    throw new Error(`${rotulo}: campos invalidos`)
  }
  return objeto
}

export function validarPlano(valor: unknown, decisoes: ReadonlySet<string>): ItemPlano[] {
  const raiz = camposExatos(valor, ["itens"], "plano")
  if (!Array.isArray(raiz.itens) || raiz.itens.length === 0) throw new Error("plano: itens vazios ou invalidos")
  const ids = new Set<string>()
  return raiz.itens.map((bruto, indice) => {
    const item = camposExatos(bruto, ["id", "slug", "numero_cnj", "preimagem_sha256"], `item ${indice}`)
    if (typeof item.id !== "string" || !UUID.test(item.id) || ids.has(item.id)) throw new Error(`item ${indice}: id invalido ou duplicado`)
    if (typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) throw new Error(`item ${indice}: slug invalido`)
    if (typeof item.numero_cnj !== "string" || !(/^[0-9]{20}$/.test(item.numero_cnj)
      || /^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$/.test(item.numero_cnj))) {
      throw new Error(`item ${indice}: numero_cnj invalido`)
    }
    if (typeof item.preimagem_sha256 !== "string" || !HASH.test(item.preimagem_sha256)) throw new Error(`item ${indice}: preimagem_sha256 invalida`)
    if (!decididoNaoPublicar(decisoes, item.slug, item.numero_cnj)) throw new Error(`item ${indice}: fora da decisao editorial nao_publicar`)
    ids.add(item.id)
    return item as unknown as ItemPlano
  })
}

/** Serialização dos tipos JSON retornados pela tabela, com espaços do Python. */
export function stringifyPreimagem(valor: unknown): string {
  if (valor === null || typeof valor === "string" || typeof valor === "boolean") return JSON.stringify(valor)
  if (typeof valor === "number" && Number.isFinite(valor)) return JSON.stringify(valor)
  if (Array.isArray(valor)) return `[${valor.map(stringifyPreimagem).join(", ")}]`
  if (valor !== null && typeof valor === "object") {
    return `{${Object.keys(valor).sort().map((chave) => `${JSON.stringify(chave)}: ${stringifyPreimagem((valor as Linha)[chave])}`).join(", ")}}`
  }
  throw new Error("preimagem: tipo fora de JSON")
}

export function shaPreimagem(linha: Linha): string {
  return sha256(stringifyPreimagem(linha))
}

export function shaPlano(itens: readonly ItemPlano[]): string {
  const pares = itens.map((item) => [item.id, item.preimagem_sha256])
    .sort(([a], [b]) => a! < b! ? -1 : a! > b! ? 1 : 0)
  return sha256(JSON.stringify(pares))
}

function lerOpcoes(argv: string[]): Opcoes {
  const permitidas = ["--plano=", "--out=", "--expected-plan-sha="]
  for (const arg of argv) {
    if (arg !== "--apply" && !permitidas.some((prefixo) => arg.startsWith(prefixo))) throw new Error(`flag desconhecida: ${arg}`)
  }
  function unica(nome: string): string | undefined {
    const valores = argv.filter((arg) => arg.startsWith(`--${nome}=`))
    if (valores.length > 1) throw new Error(`--${nome} duplicado`)
    return valores[0]?.slice(nome.length + 3)
  }
  const plano = unica("plano")
  const out = unica("out")
  const expectedPlanSha = unica("expected-plan-sha")
  if (!plano || !out) throw new Error("--plano e --out sao obrigatorios")
  if (argv.filter((arg) => arg === "--apply").length > 1) throw new Error("--apply duplicado")
  const apply = argv.includes("--apply")
  if (apply && (!expectedPlanSha || !HASH.test(expectedPlanSha))) throw new Error("--apply exige --expected-plan-sha=<64 hex>")
  if (!apply && expectedPlanSha) throw new Error("--expected-plan-sha exige --apply")
  return {
    plano: assertOutsideRepository(plano, "--plano"),
    out: assertOutsideRepository(out, "--out"),
    apply,
    expectedPlanSha,
  }
}

async function lerLinha(client: Cliente, id: string): Promise<Linha | null> {
  const { data, error } = await client.from("processos").select("*").eq("id", id)
  if (error) throw new Error(`leitura de processos: ${error.message}`)
  if ((data ?? []).length > 1) throw new Error("id de processos nao e unico")
  return (data?.[0] as Linha | undefined) ?? null
}

async function correspondeAoPlano(client: Cliente, item: ItemPlano, linha: Linha): Promise<boolean> {
  if (String(linha.id) !== item.id || String(linha.numero_processo ?? "").replace(/\D/g, "") !== item.numero_cnj.replace(/\D/g, "")) return false
  const candidatoId = linha.candidato_id
  if (typeof candidatoId !== "string" || !UUID.test(candidatoId)) return false
  const { data, error } = await client.from("candidatos").select("slug").eq("id", candidatoId)
  if (error) throw new Error(`leitura de candidatos: ${error.message}`)
  return data?.length === 1 && data[0]?.slug === item.slug
}

async function excluirSeIgual(client: Cliente, escreverAuditado: Escritor, item: ItemPlano, linha: Linha): Promise<boolean> {
  const excluidas = await escreverAuditado({
    script: "processos-despublicar-decididos",
    tabela: "processos",
    motivo: "retira processo com decisao editorial de nao publicar",
    recorte: `id=${item.id}`,
  }, () => {
    let consulta = client.from("processos").delete().eq("id", item.id)
    for (const [campo, valor] of Object.entries(linha)) {
      if (campo === "id") continue
      if (valor === null) consulta = consulta.is(campo, null)
      else if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") consulta = consulta.eq(campo, valor)
      else throw new Error(`CAS: coluna ${campo} nao escalar; nenhuma exclusao tentada`)
    }
    return consulta.select("id")
  })
  if (excluidas.length > 1) throw new Error("CAS: mais de uma linha excluida")
  return excluidas.length === 1
}

export async function main(
  argv = process.argv.slice(2),
  deps: { client?: Cliente; escrever?: Escritor; decisoes?: ReadonlySet<string>; emit?: (resumo: Resumo) => void } = {},
): Promise<Resumo> {
  const opcoes = lerOpcoes(argv)
  const itens = validarPlano(JSON.parse(readFileSync(opcoes.plano, "utf8")) as unknown, deps.decisoes ?? carregarDecisoes())
  const planoSha = shaPlano(itens)
  if (opcoes.apply && opcoes.expectedPlanSha !== planoSha) throw new Error("plano SHA divergente de --expected-plan-sha")
  const client = deps.client ?? supabase
  const escrever = deps.escrever ?? escreverAuditadoReal
  const atuais = await Promise.all(itens.map((item) => lerLinha(client, item.id)))
  if (!opcoes.apply) {
    for (let i = 0; i < itens.length; i++) {
      const linha = atuais[i]
      if (!linha || shaPreimagem(linha) !== itens[i]!.preimagem_sha256 || !await correspondeAoPlano(client, itens[i]!, linha)) {
        throw new Error(`dry-run: preimagem ou identidade divergente no item ${i}`)
      }
    }
  }
  mkdirSync(opcoes.out, { recursive: true, mode: 0o700 })
  const backup = join(opcoes.out, `processos-despublicar-${planoSha}-${randomUUID()}.json`)
  writeFileSync(backup, `${JSON.stringify({ plano_sha256: planoSha, linhas: atuais.filter((linha) => linha !== null) }, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  const pulados: string[] = []
  const excluidos: string[] = []
  if (opcoes.apply) {
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i]!
      const linha = await lerLinha(client, item.id)
      if (!linha || shaPreimagem(linha) !== item.preimagem_sha256 || !await correspondeAoPlano(client, item, linha)) {
        pulados.push(item.id)
        continue
      }
      if (await excluirSeIgual(client, escrever, item, linha)) excluidos.push(item.id)
      else pulados.push(item.id)
    }
    for (const id of excluidos) {
      if (await lerLinha(client, id)) throw new Error(`readback: id ainda presente: ${id}`)
    }
  }
  const resumo: Resumo = {
    modo: opcoes.apply ? "apply" : "dry-run", plano_sha256: planoSha,
    previstos: itens.length, conferidos: atuais.filter((linha) => linha !== null).length,
    excluidos: excluidos.length, pulados, backup,
  }
  ;(deps.emit ?? ((saida) => console.log(JSON.stringify(saida))))(resumo)
  if (pulados.length > 0) throw new CasSkipError(`CAS: ${pulados.length} item(ns) pulado(s); backup: ${backup}`)
  return resumo
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = erro instanceof CasSkipError ? erro.exitCode : 1
  })
}
