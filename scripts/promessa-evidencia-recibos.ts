/**
 * Recibo por candidato do processamento promessa x evidência (issue #434).
 *
 *   node --import tsx scripts/promessa-evidencia-recibos.ts            # dry-run
 *   node --import tsx scripts/promessa-evidencia-recibos.ts --apply    # grava
 *
 * Sem recibo, a ficha não tinha como separar "processado e nada encontrado" de
 * "nunca processado" nem de "falha de leitura". Este script grava em
 * `coleta_log` (fonte `promessa-evidencia`, escopo candidato, natureza coleta)
 * uma linha por candidato do universo da rotina (candidato público com programa
 * aprovado), com o desfecho da execução:
 *
 *   encontrado            volume = vínculos publicados para o programa atual
 *   sem_achado_no_escopo  houve pares no pré-filtro; a cascata não publicou nenhum
 *   vazio_confirmado      o pré-filtro não achou nenhum par
 *
 * O `detalhe` carrega `programa=`, `pares_avaliados=`, `publicados=` e a versão
 * da cascata; a ficha só usa o recibo se o programa for o mesmo que ela mostra.
 *
 * Entrada: `reports/promessa-evidencia/snapshot.json` e `pares.json` da mesma
 * execução e o estado publicado lido do banco (somente leitura). Trava: todo
 * vínculo publicado precisa existir nos pares atuais; se não existir, pares e
 * publicação estão fora de sincronia e nada é gravado.
 *
 * O publicador (`promessa-evidencia-publicar.ts --apply`) chama `gravarRecibos`
 * depois de publicar, então a rotina diária grava o recibo sozinha.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { detalheReciboPromessa, FONTE_RECIBO_PROMESSA } from "../src/lib/compromisso-evidencia"
import { ensureSupabaseClient } from "./lib/supabase"
import type { SnapshotEvidencias } from "./promessa-evidencia-coletar"
import type { ParCandidato } from "./promessa-evidencia-pares"
import { carregarProgramasComResumo } from "./promessa-evidencia-programas"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PASTA = path.join(ROOT, "reports/promessa-evidencia")

export type LinhaRecibo = {
  fonte: typeof FONTE_RECIBO_PROMESSA
  escopo: "candidato"
  alvo: string
  candidato_id: string
  resultado: "encontrado" | "sem_achado_no_escopo" | "vazio_confirmado"
  volume: number
  detalhe: string
  url: null
  execucao: string
  natureza: "coleta"
  executado_em: string
}

export type VinculoPublicado = { candidato_id: string; programa_chave: string; tema_id: string | null; tipo_evidencia: string; evidencia_ref: string }

type Cliente = ReturnType<typeof ensureSupabaseClient>

/**
 * Monta os recibos. Puro. Lança se algum vínculo publicado não estiver nos
 * pares atuais (publicação e pré-filtro de execuções diferentes).
 */
export function montarRecibos(input: {
  candidatos: ReadonlyArray<{ id: string; slug: string }>
  programaPorSlug: ReadonlyMap<string, string>
  pares: ReadonlyArray<Pick<ParCandidato, "candidatoId" | "programaChave" | "compromisso" | "evidencia">>
  publicados: ReadonlyArray<VinculoPublicado>
  versao: string
  execucao: string
  agora: string
}): LinhaRecibo[] {
  const chavePar = (programa: string, tema: string | null, tipo: string, ref: string) => [programa, tema ?? "", tipo, ref].join("|")
  const paresConhecidos = new Set(input.pares.map((p) => chavePar(p.programaChave, p.compromisso.temaId, p.evidencia.tipo, p.evidencia.ref)))
  const idsUniverso = new Set(input.candidatos.map((c) => c.id))
  const fora = input.publicados.filter((v) => idsUniverso.has(v.candidato_id)
    && !paresConhecidos.has(chavePar(v.programa_chave, v.tema_id, v.tipo_evidencia, v.evidencia_ref)))
  if (fora.length > 0) {
    throw new Error(`${fora.length} vínculo(s) publicado(s) fora dos pares atuais; rode coletar e pares da mesma execução antes do recibo`)
  }
  const recibos: LinhaRecibo[] = []
  for (const candidato of [...input.candidatos].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const programaChave = input.programaPorSlug.get(candidato.slug)
    if (!programaChave) throw new Error(`candidato do universo sem programa aprovado: ${candidato.slug}`)
    const paresAvaliados = input.pares.filter((p) => p.candidatoId === candidato.id && p.programaChave === programaChave).length
    const publicados = input.publicados.filter((v) => v.candidato_id === candidato.id && v.programa_chave === programaChave).length
    const resultado = publicados > 0 ? "encontrado" : paresAvaliados > 0 ? "sem_achado_no_escopo" : "vazio_confirmado"
    recibos.push({
      fonte: FONTE_RECIBO_PROMESSA,
      escopo: "candidato",
      alvo: candidato.slug,
      candidato_id: candidato.id,
      resultado,
      volume: publicados,
      detalhe: detalheReciboPromessa({ programaChave, paresAvaliados, publicados, versao: input.versao }),
      url: null,
      execucao: input.execucao,
      natureza: "coleta",
      executado_em: input.agora,
    })
  }
  return recibos
}

export function distribuicao(recibos: ReadonlyArray<LinhaRecibo>): Record<LinhaRecibo["resultado"], number> {
  const saida = { encontrado: 0, sem_achado_no_escopo: 0, vazio_confirmado: 0 }
  for (const r of recibos) saida[r.resultado] += 1
  return saida
}

async function lerPublicados(db: Cliente): Promise<VinculoPublicado[]> {
  const { data, error } = await db.from("compromisso_evidencia_publica")
    .select("candidato_id,programa_chave,tema_id,tipo_evidencia,evidencia_ref")
  if (error) throw new Error(`compromisso_evidencia_publica: ${error.message}`)
  return (data ?? []) as VinculoPublicado[]
}

/** Lê entradas locais e banco, monta os recibos e, com `apply`, grava num insert só. */
export async function gravarRecibos(options: { db: Cliente; apply: boolean; versao: string; agora?: string }): Promise<{ recibos: LinhaRecibo[]; gravados: number; arquivo: string }> {
  const agora = options.agora ?? new Date().toISOString()
  const snapshot = JSON.parse(readFileSync(path.join(PASTA, "snapshot.json"), "utf8")) as SnapshotEvidencias
  const { pares } = JSON.parse(readFileSync(path.join(PASTA, "pares.json"), "utf8")) as { pares: ParCandidato[] }
  const programas = await carregarProgramasComResumo()
  const recibos = montarRecibos({
    candidatos: snapshot.candidatos,
    programaPorSlug: new Map(programas.map((p) => [p.slug, p.programaChave])),
    pares,
    publicados: await lerPublicados(options.db),
    versao: options.versao,
    execucao: `promessa-evidencia:${agora}`,
    agora,
  })
  mkdirSync(PASTA, { recursive: true })
  const arquivo = path.join(PASTA, `recibos-${agora.slice(0, 10)}.json`)
  writeFileSync(arquivo, `${JSON.stringify({ gerado_em: agora, modo: options.apply ? "apply" : "dry-run", distribuicao: distribuicao(recibos), recibos }, null, 1)}\n`)
  if (!options.apply) return { recibos, gravados: 0, arquivo }
  const { data, error } = await options.db.from("coleta_log").insert(recibos).select("id")
  if (error) throw new Error(`coleta_log (recibos promessa): ${error.message}`)
  const gravados = data?.length ?? 0
  if (gravados !== recibos.length) throw new Error(`recibos gravados ${gravados} de ${recibos.length}`)
  return { recibos, gravados, arquivo }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const versao = process.argv.includes("--versao") ? process.argv[process.argv.indexOf("--versao") + 1] : "c2"
  if (!versao) throw new Error("uso: --versao <versao da cascata>")
  const { recibos, gravados, arquivo } = await gravarRecibos({ db: ensureSupabaseClient(), apply, versao })
  console.log(JSON.stringify({
    modo: apply ? "apply" : "dry-run",
    fonte: FONTE_RECIBO_PROMESSA,
    candidatos: recibos.length,
    distribuicao: distribuicao(recibos),
    gravados,
    execucao: recibos[0]?.execucao ?? null,
    arquivo: path.relative(ROOT, arquivo),
  }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
