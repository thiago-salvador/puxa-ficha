/**
 * Importa decisões da fila de revisão para `compromisso_evidencia`.
 *
 *   node --import tsx scripts/promessa-evidencia-importar-revisao.ts            # dry-run
 *   node --import tsx scripts/promessa-evidencia-importar-revisao.ts --apply    # grava
 *
 * Só item com decisão humana completa (decisão, motivo, revisor e data) vira
 * linha, e só essa linha recebe `verificado = true`. `nao_relacionada` não gera
 * linha. Toda escrita passa por `escreverAuditado`. A view pública decide o que
 * aparece: `contradiz` fica gravado para a revisão e não é exposto na v1.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { escreverAuditado } from "./lib/escrita-auditada"
import { ensureSupabaseClient } from "./lib/supabase"
import { DECISOES, SCHEMA_FILA_REVISAO, type FilaRevisao, type ItemFila } from "./promessa-evidencia-fila"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const FILA = path.join(ROOT, "reports/promessa-evidencia/fila-revisao.json")
const SCRIPT = "scripts/promessa-evidencia-importar-revisao.ts"
const MOTIVO_MINIMO = 12

export type LinhaCompromissoEvidencia = {
  candidato_id: string
  programa_chave: string
  frase_id: null
  tema_id: string
  tipo_evidencia: string
  evidencia_ref: string
  relacao: "sustenta" | "contradiz" | "relacionada"
  origem: "jev_sombra"
  probabilidade: number
  verificado: true
  revisado_por: string
  revisado_em: string
  motivo: string
  updated_at: string
}

export type PlanoImportacao = {
  linhas: LinhaCompromissoEvidencia[]
  naoRelacionadasRevisadas: number
  pendentes: number
  rejeitados: Array<{ par_id: string; motivo: string }>
}

function problemaDoItem(item: ItemFila): string | null {
  if (!DECISOES.includes(item.decisao as (typeof DECISOES)[number])) return "decisao fora do vocabulario"
  if (!item.motivo || item.motivo.trim().length < MOTIVO_MINIMO) return `motivo com menos de ${MOTIVO_MINIMO} caracteres`
  if (!item.revisado_por?.trim()) return "revisor ausente"
  if (!item.revisado_em || Number.isNaN(Date.parse(item.revisado_em))) return "data de revisao invalida"
  return null
}

export function planejarImportacao(fila: FilaRevisao, agora = new Date().toISOString()): PlanoImportacao {
  if (fila.schema_version !== SCHEMA_FILA_REVISAO) throw new Error(`fila com schema inesperado: ${fila.schema_version}`)
  const plano: PlanoImportacao = { linhas: [], naoRelacionadasRevisadas: 0, pendentes: 0, rejeitados: [] }
  const vistos = new Set<string>()
  for (const item of fila.itens) {
    if (item.decisao === null) {
      plano.pendentes += 1
      continue
    }
    const problema = problemaDoItem(item)
    if (problema) {
      plano.rejeitados.push({ par_id: item.par_id, motivo: problema })
      continue
    }
    if (item.decisao === "nao_relacionada") {
      plano.naoRelacionadasRevisadas += 1
      continue
    }
    const chave = [item.programa_chave, item.tema_id, item.evidencia.tipo, item.evidencia.ref].join("|")
    if (vistos.has(chave)) {
      plano.rejeitados.push({ par_id: item.par_id, motivo: "vinculo duplicado na fila" })
      continue
    }
    vistos.add(chave)
    plano.linhas.push({
      candidato_id: item.candidato_id,
      programa_chave: item.programa_chave,
      frase_id: null,
      tema_id: item.tema_id,
      tipo_evidencia: item.evidencia.tipo,
      evidencia_ref: item.evidencia.ref,
      relacao: item.decisao,
      origem: "jev_sombra",
      probabilidade: Number((item.jev.probabilidades[item.decisao] ?? 0).toFixed(4)),
      verificado: true,
      revisado_por: item.revisado_por!.trim(),
      revisado_em: new Date(item.revisado_em!).toISOString(),
      motivo: item.motivo!.trim(),
      updated_at: agora,
    })
  }
  return plano
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const fila = JSON.parse(readFileSync(FILA, "utf8")) as FilaRevisao
  const plano = planejarImportacao(fila)
  const resumo = {
    modo: apply ? "apply" : "dry-run",
    linhas: plano.linhas.length,
    por_relacao: Object.fromEntries(["sustenta", "contradiz", "relacionada"].map((r) => [r, plano.linhas.filter((l) => l.relacao === r).length])),
    nao_relacionadas_revisadas: plano.naoRelacionadasRevisadas,
    pendentes: plano.pendentes,
    rejeitados: plano.rejeitados,
  }
  if (plano.rejeitados.length > 0) {
    console.error(JSON.stringify(resumo, null, 2))
    throw new Error(`${plano.rejeitados.length} item(ns) com revisao incompleta; corrija a fila antes de importar`)
  }
  if (!apply || plano.linhas.length === 0) {
    console.log(JSON.stringify(resumo, null, 2))
    return
  }
  const db = ensureSupabaseClient()
  const gravadas = await escreverAuditado(
    {
      script: SCRIPT,
      tabela: "compromisso_evidencia",
      motivo: "importa vinculos compromisso x evidencia revisados por pessoa na fila de revisao",
      recorte: `${plano.linhas.length} linha(s) verificada(s)`,
    },
    () => db.from("compromisso_evidencia")
      .upsert(plano.linhas, { onConflict: "programa_chave,frase_id,tema_id,tipo_evidencia,evidencia_ref" })
      .select("id"),
  )
  console.log(JSON.stringify({ ...resumo, gravadas: gravadas.length }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
