/**
 * Troca auditada de `processos.url_fonte`, linha por linha.
 *
 * Entrada: `--plano=<arquivo.json>` com
 *   [{ "id": "<uuid>", "url_fonte_antes": "<url|null>", "url_fonte_depois": "<url>", "motivo": "..." }]
 * Padrão é dry-run: lê as linhas atuais, confere que `url_fonte` ainda é o valor
 * esperado e imprime o diff com o nível de fonte antes e depois.
 * `--apply` exige `--backup=<arquivo.json>` e grava o backup das linhas tocadas
 * antes de qualquer UPDATE. Cada UPDATE só altera `url_fonte` e só acontece se o
 * valor atual ainda for o esperado. Depois do apply, relê as linhas (readback).
 *
 * Uso: node --import tsx scripts/audit/processos-url-fonte.ts --plano=plano.json [--apply --backup=backup.json]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { nivelFonteProcesso, type FonteProcessoNivel } from "../../src/lib/djen-consulta-url"
import { escreverAuditado } from "../lib/escrita-auditada"
import { supabase } from "../lib/supabase"

export interface ItemPlano {
  id: string
  url_fonte_antes: string | null
  url_fonte_depois: string
  motivo: string
}

interface LinhaProcesso {
  id: string
  numero_processo: string | null
  url_fonte: string | null
}

export interface DiffItem {
  id: string
  aplicavel: boolean
  motivo_bloqueio?: string
  antes: { url_fonte: string | null; nivel: FonteProcessoNivel | null }
  depois: { url_fonte: string; nivel: FonteProcessoNivel | null }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function argumento(prefixo: string): string | undefined {
  return process.argv.find((valor) => valor.startsWith(prefixo))?.slice(prefixo.length)
}

export function validarPlano(bruto: unknown): ItemPlano[] {
  if (!Array.isArray(bruto) || bruto.length === 0) throw new Error("plano vazio ou não é lista")
  const vistos = new Set<string>()
  return bruto.map((item, indice) => {
    const linha = item as Partial<ItemPlano>
    if (typeof linha.id !== "string" || !UUID.test(linha.id)) throw new Error(`item ${indice}: id inválido`)
    if (vistos.has(linha.id)) throw new Error(`item ${indice}: id duplicado`)
    vistos.add(linha.id)
    if (linha.url_fonte_antes !== null && typeof linha.url_fonte_antes !== "string") throw new Error(`item ${indice}: url_fonte_antes inválido`)
    if (typeof linha.url_fonte_depois !== "string" || !/^https:\/\//.test(linha.url_fonte_depois)) {
      throw new Error(`item ${indice}: url_fonte_depois precisa ser https`)
    }
    if (typeof linha.motivo !== "string" || !linha.motivo.trim()) throw new Error(`item ${indice}: motivo vazio`)
    return linha as ItemPlano
  })
}

export function montarDiff(plano: ItemPlano[], atuais: LinhaProcesso[]): DiffItem[] {
  const porId = new Map(atuais.map((linha) => [linha.id, linha]))
  return plano.map((item) => {
    const atual = porId.get(item.id)
    const depois = {
      url_fonte: item.url_fonte_depois,
      nivel: nivelFonteProcesso({ id: item.id, numero_processo: atual?.numero_processo ?? null, url_fonte: item.url_fonte_depois }),
    }
    if (!atual) {
      return { id: item.id, aplicavel: false, motivo_bloqueio: "linha não encontrada", antes: { url_fonte: null, nivel: null }, depois }
    }
    const antes = { url_fonte: atual.url_fonte, nivel: nivelFonteProcesso(atual) }
    if ((atual.url_fonte ?? null) !== item.url_fonte_antes) {
      return { id: item.id, aplicavel: false, motivo_bloqueio: "url_fonte atual difere do esperado", antes, depois }
    }
    if (!depois.nivel) return { id: item.id, aplicavel: false, motivo_bloqueio: "url nova não é publicável", antes, depois }
    return { id: item.id, aplicavel: true, antes, depois }
  })
}

async function lerLinhas(ids: string[]): Promise<LinhaProcesso[]> {
  const { data, error } = await supabase.from("processos").select("id, numero_processo, url_fonte").in("id", ids)
  if (error) throw new Error(`leitura falhou: ${error.message}`)
  return (data ?? []) as LinhaProcesso[]
}

async function main() {
  const arquivoPlano = argumento("--plano=")
  if (!arquivoPlano) throw new Error("--plano=<arquivo.json> é obrigatório")
  const plano = validarPlano(JSON.parse(readFileSync(resolve(arquivoPlano), "utf8")))
  const apply = process.argv.includes("--apply")
  const atuais = await lerLinhas(plano.map((item) => item.id))
  const diff = montarDiff(plano, atuais)
  const bloqueados = diff.filter((item) => !item.aplicavel)
  console.log(JSON.stringify({ modo: apply ? "apply" : "dry-run", total: diff.length, bloqueados: bloqueados.length, diff }, null, 2))
  if (!apply) return
  if (bloqueados.length > 0) throw new Error("apply recusado: há itens bloqueados no diff")

  const arquivoBackup = argumento("--backup=")
  if (!arquivoBackup) throw new Error("--apply exige --backup=<arquivo.json>")
  if (existsSync(resolve(arquivoBackup))) throw new Error("backup já existe; use outro caminho")
  writeFileSync(resolve(arquivoBackup), JSON.stringify(atuais, null, 2), { flag: "wx" })

  for (const item of plano) {
    const tocadas = await escreverAuditado(
      {
        script: "processos-url-fonte",
        tabela: "processos",
        motivo: `troca de url_fonte por fonte verificada: ${item.motivo}`,
        recorte: `processo ${item.id}, só a coluna url_fonte, condicionado ao valor anterior`,
      },
      () => {
        const consulta = supabase.from("processos").update({ url_fonte: item.url_fonte_depois }).eq("id", item.id)
        return (item.url_fonte_antes === null ? consulta.is("url_fonte", null) : consulta.eq("url_fonte", item.url_fonte_antes)).select("id")
      },
    )
    if (tocadas.length !== 1) throw new Error(`update ${item.id} tocou ${tocadas.length} linha(s)`)
  }

  const depois = await lerLinhas(plano.map((item) => item.id))
  const readback = plano.map((item) => {
    const linha = depois.find((row) => row.id === item.id)
    return { id: item.id, ok: linha?.url_fonte === item.url_fonte_depois, nivel: linha ? nivelFonteProcesso(linha) : null }
  })
  console.log(JSON.stringify({ readback }, null, 2))
  if (readback.some((item) => !item.ok)) throw new Error("readback divergente")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
