/**
 * Publicação autônoma do vínculo promessa x evidência a partir da cascata
 * (ver scripts/promessa-jev/LIMIARES-cascata.md). Sem revisão item a item.
 *
 *   node --import tsx scripts/promessa-evidencia-publicar.ts                 # dry-run
 *   node --import tsx scripts/promessa-evidencia-publicar.ts --apply         # grava
 *   node --import tsx scripts/promessa-evidencia-publicar.ts --despublicar --apply
 *
 * Grava só o que passou em todas as camadas, como `relacionada`, origem
 * `cascata`. Reconcilia: vínculo da cascata que deixou de passar volta a
 * `verificado = false`. Toda escrita passa por `escreverAuditado`. Cada execução
 * grava uma amostra dos publicados para auditoria e, com `--apply`, um recibo
 * por candidato em `coleta_log` (ver `promessa-evidencia-recibos.ts`).
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { escreverAuditado } from "./lib/escrita-auditada"
import { ensureSupabaseClient } from "./lib/supabase"
import type { ParCandidato } from "./promessa-evidencia-pares"
import { distribuicao, gravarRecibos } from "./promessa-evidencia-recibos"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PASTA = path.join(ROOT, "reports/promessa-evidencia")
const SCRIPT = "scripts/promessa-evidencia-publicar.ts"
export const VERSAO_CASCATA = "c2"
const TAMANHO_AMOSTRA = 20

type CacheCascata = {
  jevCascata: Record<string, { model?: string; answers?: Record<string, { noul?: number }> }>
  verificador: Record<string, { modelo?: string }>
}

export type LinhaPublicacao = {
  candidato_id: string
  programa_chave: string
  frase_id: null
  tema_id: string
  tipo_evidencia: string
  evidencia_ref: string
  relacao: "relacionada"
  origem: "cascata"
  probabilidade: number
  verificado: true
  revisado_por: string
  revisado_em: string
  motivo: string
  updated_at: string
}

export function linhasParaPublicar(input: {
  pares: ParCandidato[]
  publicar: string[]
  cache: CacheCascata
  versao: string
  agora: string
}): LinhaPublicacao[] {
  const porId = new Map(input.pares.map((p) => [p.parId, p]))
  const linhas: LinhaPublicacao[] = []
  const vistos = new Set<string>()
  for (const parId of [...input.publicar].sort()) {
    const par = porId.get(parId)
    if (!par) throw new Error(`par da cascata ausente em pares.json: ${parId}`)
    const jev = input.cache.jevCascata[parId]
    const objeto = jev?.answers?.objeto_concreto?.noul
    if (typeof objeto !== "number") throw new Error(`par sem resposta do Jev na cascata: ${parId}`)
    const chave = [par.programaChave, par.compromisso.temaId, par.evidencia.tipo, par.evidencia.ref].join("|")
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const verificador = input.cache.verificador[parId]?.modelo ?? "verificador"
    linhas.push({
      candidato_id: par.candidatoId,
      programa_chave: par.programaChave,
      frase_id: null,
      tema_id: par.compromisso.temaId,
      tipo_evidencia: par.evidencia.tipo,
      evidencia_ref: par.evidencia.ref,
      relacao: "relacionada",
      origem: "cascata",
      probabilidade: Number(objeto.toFixed(4)),
      verificado: true,
      revisado_por: `cascata ${input.versao} (${jev?.model ?? "jev"} + ${verificador})`,
      revisado_em: input.agora,
      motivo: `aprovado pelas quatro camadas da cascata ${input.versao}`,
      updated_at: input.agora,
    })
  }
  return linhas
}

/** Amostra determinística por execução, para auditoria posterior. */
export function amostraAuditoria<T extends { evidencia_ref: string; tema_id: string }>(linhas: T[], semente: string, tamanho = TAMANHO_AMOSTRA): T[] {
  const ordem = (l: T) => createHash("sha256").update(`${semente}|${l.tema_id}|${l.evidencia_ref}`).digest("hex")
  return [...linhas].sort((a, b) => ordem(a).localeCompare(ordem(b))).slice(0, tamanho)
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const despublicar = process.argv.includes("--despublicar")
  const agora = new Date().toISOString()
  const db = apply ? ensureSupabaseClient() : null

  if (despublicar) {
    if (!db) {
      console.log(JSON.stringify({ modo: "dry-run", acao: "despublicar tudo com origem cascata" }))
      return
    }
    const linhas = await escreverAuditado(
      { script: SCRIPT, tabela: "compromisso_evidencia", motivo: "chave de despublicacao: retira tudo que veio da cascata automatica", recorte: "origem = cascata" },
      () => db.from("compromisso_evidencia").update({ verificado: false, updated_at: agora }).eq("origem", "cascata").eq("verificado", true).select("id"),
    )
    console.log(JSON.stringify({ modo: "apply", acao: "despublicar", linhas: linhas.length }))
    return
  }

  const { pares } = JSON.parse(readFileSync(path.join(PASTA, "pares.json"), "utf8")) as { pares: ParCandidato[] }
  const cascata = JSON.parse(readFileSync(path.join(PASTA, `cascata-${VERSAO_CASCATA}.json`), "utf8")) as {
    versao: string; publicar: string[]; cache: CacheCascata; falhasVerificador: number
  }
  if (cascata.versao !== VERSAO_CASCATA) throw new Error(`cascata com versao inesperada: ${cascata.versao}`)
  if (cascata.falhasVerificador > 0) throw new Error("cascata com falha do verificador; nada publicado")
  const linhas = linhasParaPublicar({ pares, publicar: cascata.publicar, cache: cascata.cache, versao: VERSAO_CASCATA, agora })
  const amostra = amostraAuditoria(linhas, agora)
  mkdirSync(PASTA, { recursive: true })
  const auditoria = path.join(PASTA, `auditoria-${agora.slice(0, 10)}.json`)
  writeFileSync(auditoria, `${JSON.stringify({ gerado_em: agora, versao: VERSAO_CASCATA, publicados: linhas.length, amostra }, null, 2)}\n`)
  const resumo = { modo: apply ? "apply" : "dry-run", versao: VERSAO_CASCATA, publicar: linhas.length, amostra_auditoria: path.relative(ROOT, auditoria) }
  if (!db) {
    console.log(JSON.stringify(resumo, null, 2))
    return
  }
  const gravadas = await escreverAuditado(
    { script: SCRIPT, tabela: "compromisso_evidencia", motivo: `publica vinculos aprovados pela cascata ${VERSAO_CASCATA}`, recorte: `${linhas.length} linha(s)` },
    () => db.from("compromisso_evidencia")
      .upsert(linhas, { onConflict: "programa_chave,frase_id,tema_id,tipo_evidencia,evidencia_ref" })
      .select("id,programa_chave,tema_id,tipo_evidencia,evidencia_ref"),
  )
  const publicadasAgora = new Set(gravadas.map((l) => [l.programa_chave, l.tema_id, l.tipo_evidencia, l.evidencia_ref].join("|")))
  const { data: ativas, error } = await db.from("compromisso_evidencia")
    .select("id,programa_chave,tema_id,tipo_evidencia,evidencia_ref").eq("origem", "cascata").eq("verificado", true)
  if (error) throw new Error(error.message)
  const retirar = (ativas ?? []).filter((l) => !publicadasAgora.has([l.programa_chave, l.tema_id, l.tipo_evidencia, l.evidencia_ref].join("|"))).map((l) => l.id)
  let retiradas = 0
  if (retirar.length > 0) {
    retiradas = (await escreverAuditado(
      { script: SCRIPT, tabela: "compromisso_evidencia", motivo: "reconcilia: vinculo da cascata que deixou de passar sai da publicacao", recorte: `${retirar.length} linha(s)` },
      () => db.from("compromisso_evidencia").update({ verificado: false, updated_at: agora }).in("id", retirar).select("id"),
    )).length
  }
  // Recibo por candidato depois da publicação: lê o estado publicado que acabou
  // de ser gravado, então descreve exatamente o que a ficha vai mostrar.
  const recibos = await gravarRecibos({ db, apply: true, versao: VERSAO_CASCATA, agora })
  console.log(JSON.stringify({ ...resumo, gravadas: gravadas.length, retiradas, recibos: { gravados: recibos.gravados, ...distribuicao(recibos.recibos) } }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
