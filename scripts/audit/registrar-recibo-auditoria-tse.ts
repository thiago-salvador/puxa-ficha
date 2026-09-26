/**
 * Grava em `coleta_log` o recibo da leitura oficial feita pela auditoria diária
 * (`npm run audit:data-freshness`). Lê só os artefatos que a auditoria já
 * escreveu em `reports/data-freshness/`; não baixa nada de novo.
 *
 * Sem `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o recibo não é gravado e o
 * aviso vai para o log e para o resumo do run. Com as credenciais, a gravação é
 * estrita: se falhar, o processo sai com erro, para o recibo não sumir calado.
 *
 * Também monta um recibo `tse-auditoria-candidatura` por ficha pública
 * conferida (Gov, Pres e Senado) e o escreve sempre em
 * `<dir>/recibos-candidatura.json`. No banco, esses recibos só entram quando a
 * rodada leu a fonte ao vivo (`live_official`) e há credencial de escrita; leitura
 * de ZIP local ou snapshot versionado fica só no JSON (dry-run).
 *
 * Uso: node --import tsx scripts/audit/registrar-recibo-auditoria-tse.ts [--dir=reports/data-freshness]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { supabase } from "../lib/supabase"
import { EXECUCAO, montarLinhas, registrarColetaOuFalhar } from "../lib/coleta-log"
import type { FichaTseResult } from "../lib/data-freshness/ficha-tse"
import {
  FONTE_TSE_AUDITORIA_CANDIDATURA,
  podeGravarRecibosCandidatura,
  reciboAuditoriaTse,
  recibosAuditoriaCandidatura,
  recibosPendentes,
  temCredencialDeEscrita,
  type ArtefatosAuditoriaTse,
  type ArtefatosRecibosCandidatura,
  type ReciboCandidatura,
} from "../lib/data-freshness/tse-audit-receipt"

function lerJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null
}

export function lerArtefatosAuditoriaTse(dir: string): ArtefatosAuditoriaTse {
  const source = lerJson(resolve(dir, "source.json"))
  if (!source || typeof source !== "object") {
    throw new Error(`source.json ausente ou inválido em ${dir}`)
  }
  const universe = lerJson(resolve(dir, "universe.json")) as { official?: unknown } | null
  const diff = lerJson(resolve(dir, "diff.json")) as { status?: unknown } | null
  return {
    source: source as ArtefatosAuditoriaTse["source"],
    officialCount: Array.isArray(universe?.official) ? universe.official.length : null,
    diffStatus: typeof diff?.status === "string" ? diff.status : null,
  }
}

export function lerArtefatosRecibosCandidatura(dir: string): ArtefatosRecibosCandidatura {
  const source = lerJson(resolve(dir, "source.json"))
  if (!source || typeof source !== "object") {
    throw new Error(`source.json ausente ou inválido em ${dir}`)
  }
  const diff = lerJson(resolve(dir, "diff.json")) as { ficha_checks?: { fichas?: unknown } | null } | null
  const fichas = diff?.ficha_checks?.fichas
  return {
    source: source as ArtefatosRecibosCandidatura["source"],
    fichas: Array.isArray(fichas) ? (fichas as FichaTseResult[]) : null,
  }
}

const LOTE = 200

/** Alvos que já têm recibo por candidato desta execução (re-run do mesmo run_id). */
async function alvosJaGravados(): Promise<Set<string>> {
  const { data, error } = await supabase.from("coleta_log").select("alvo")
    .eq("fonte", FONTE_TSE_AUDITORIA_CANDIDATURA).eq("execucao", EXECUCAO).limit(5000)
  if (error) throw new Error(`recibos já gravados desta execução: ${error.message}`)
  return new Set((data ?? []).map((row) => String((row as { alvo: unknown }).alvo)))
}

/**
 * Insert estrito em lotes, com candidato_id vindo da própria ficha conferida.
 * Os lotes não são uma transação; a atomicidade vem de reprocessar a mesma
 * execução, que grava só as fichas ainda sem recibo dela (recibosPendentes).
 */
async function gravarRecibosCandidatura(todos: ReciboCandidatura[]): Promise<number> {
  const recibos = recibosPendentes(todos, await alvosJaGravados())
  for (let inicio = 0; inicio < recibos.length; inicio += LOTE) {
    const lote = recibos.slice(inicio, inicio + LOTE)
    const ids = new Map(lote.map((recibo) => [recibo.alvo, recibo.candidato_id]))
    const { error } = await supabase.from("coleta_log").insert(montarLinhas(lote, ids))
    if (error) throw new Error(`recibos por candidato: ${error.message}`)
  }
  return recibos.length
}

function avisar(dir: string, aviso: string): void {
  console.log(`::warning::${aviso}`)
  const summary = resolve(dir, "summary.md")
  if (existsSync(summary)) appendFileSync(summary, `\n> ${aviso}\n`)
}

async function main(): Promise<void> {
  const dirArg = process.argv.slice(2).find((arg) => arg.startsWith("--dir="))
  const dir = resolve(dirArg ? dirArg.slice("--dir=".length) : "reports/data-freshness")
  const recibo = reciboAuditoriaTse(lerArtefatosAuditoriaTse(dir))
  const artefatosCandidatura = lerArtefatosRecibosCandidatura(dir)
  const porCandidato = recibosAuditoriaCandidatura(artefatosCandidatura)
  writeFileSync(
    resolve(dir, "recibos-candidatura.json"),
    `${JSON.stringify({ ignorado: porCandidato.ignorado, recibos: porCandidato.recibos }, null, 2)}\n`,
  )
  if (!recibo) {
    console.log("TSE_AUDIT_RECEIPT_SKIPPED: rodada sem leitura ao vivo da fonte oficial")
    console.log(`TSE_CANDIDACY_RECEIPTS_DRY_RUN: ${porCandidato.recibos.length} recibo(s) em recibos-candidatura.json`)
    return
  }
  if (!temCredencialDeEscrita()) {
    avisar(dir, "Recibos da auditoria TSE não gravados: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ausentes neste job.")
    return
  }
  await registrarColetaOuFalhar(recibo)
  console.log(`TSE_AUDIT_RECEIPT_RECORDED: ${recibo.resultado} volume=${recibo.volume ?? 0}`)
  const permitido = podeGravarRecibosCandidatura(recibo, artefatosCandidatura.source)
  if (!permitido.ok || porCandidato.recibos.length === 0) {
    console.log(`TSE_CANDIDACY_RECEIPTS_SKIPPED: ${!permitido.ok ? permitido.motivo : porCandidato.ignorado ?? "sem recibos"}`)
    return
  }
  const gravados = await gravarRecibosCandidatura(porCandidato.recibos)
  console.log(`TSE_CANDIDACY_RECEIPTS_NEW: ${gravados} de ${porCandidato.recibos.length} (os demais já tinham recibo desta execução)`)
  const encontrados = porCandidato.recibos.filter((item) => item.resultado === "encontrado").length
  console.log(
    `TSE_CANDIDACY_RECEIPTS_RECORDED: ${porCandidato.recibos.length} recibo(s), ` +
      `${encontrados} encontrado, ${porCandidato.recibos.length - encontrados} indeterminado`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
