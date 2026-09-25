/**
 * Publicação autônoma do vínculo promessa x evidência a partir da cascata
 * (ver scripts/promessa-jev/LIMIARES-cascata.md). Sem revisão item a item.
 *
 *   node --import tsx scripts/promessa-evidencia-publicar.ts                 # dry-run
 *   node --import tsx scripts/promessa-evidencia-publicar.ts --apply         # grava
 *   node --import tsx scripts/promessa-evidencia-publicar.ts --despublicar --apply
 *
 * Grava só o que passou em todas as camadas, como `relacionada`, origem
 * `cascata`. Reconcilia com trava de variância: vínculo publicado que a cascata
 * deixou de aprovar só é retirado (`verificado = false`) quando a ENTRADA mudou
 * (texto do tema do programa, conteúdo ou fonte da evidência, ou o par sumiu do
 * pré-filtro porque a evidência foi despublicada). Se a entrada é a mesma e só o
 * rótulo do Jev ou do verificador variou, o vínculo fica publicado e vira item
 * de revisão em `variancia-AAAA-MM-DD.json`. A impressão da entrada (sha256)
 * vai no `motivo`, coluna privada. Toda escrita passa por `escreverAuditado`. Cada execução
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

/** JSON com chaves ordenadas: a impressão não pode depender da ordem de montagem. */
function jsonEstavel(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(",")}]`
  if (valor && typeof valor === "object") {
    return `{${Object.keys(valor as Record<string, unknown>).sort()
      .map((k) => `${JSON.stringify(k)}:${jsonEstavel((valor as Record<string, unknown>)[k])}`).join(",")}}`
  }
  return JSON.stringify(valor ?? null)
}

/**
 * Impressão da entrada que a cascata julga: o tema do programa (título,
 * descrição, trechos e frases) e a evidência (tipo, ref, conteúdo, data, fonte).
 * Não entra nada do Jev nem do verificador: rótulo novo com a mesma entrada
 * mantém a mesma impressão.
 */
export function impressaoDaEntrada(par: Pick<ParCandidato, "programaChave" | "compromisso" | "evidencia">): string {
  const { compromisso: c, evidencia: e } = par
  return createHash("sha256").update(jsonEstavel({
    programa: par.programaChave,
    tema: { id: c.temaId, titulo: c.titulo, descricao: c.descricao, evidencias: c.evidencias, frases: c.frases },
    evidencia: { tipo: e.tipo, ref: e.ref, conteudo: e.conteudo, data: e.data, url: e.url },
  })).digest("hex")
}

const MARCA_IMPRESSAO = "entrada="

export function impressaoNoMotivo(motivo: string | null | undefined): string | null {
  return motivo?.match(/entrada=([0-9a-f]{64})/u)?.[1] ?? null
}

const chaveVinculo = (programa: string, tema: string | null, tipo: string, ref: string) => [programa, tema ?? "", tipo, ref].join("|")

export type VinculoAtivo = {
  id: string
  programa_chave: string
  tema_id: string | null
  tipo_evidencia: string
  evidencia_ref: string
  motivo: string | null
}

export type PlanoReconciliacao = {
  retirar: Array<{ id: string; chave: string; causa: "par_ausente" | "entrada_alterada" }>
  mantidosPorVariancia: Array<{ id: string; chave: string; impressao: string; sem_impressao_anterior: boolean }>
  /** Vínculos publicados antes da impressão existir: recebem a impressão atual. */
  carimbar: Array<{ id: string; motivo: string }>
}

/**
 * Decide o destino de cada vínculo ativo que a cascata não aprovou nesta
 * execução. Puro. Retira só com entrada alterada ou par ausente; o resto é
 * variância do modelo e fica publicado.
 */
export function planejarReconciliacao(input: {
  ativas: ReadonlyArray<VinculoAtivo>
  publicadasAgora: ReadonlySet<string>
  pares: ReadonlyArray<Pick<ParCandidato, "programaChave" | "compromisso" | "evidencia">>
}): PlanoReconciliacao {
  const atual = new Map(input.pares.map((p) => [chaveVinculo(p.programaChave, p.compromisso.temaId, p.evidencia.tipo, p.evidencia.ref), impressaoDaEntrada(p)]))
  const plano: PlanoReconciliacao = { retirar: [], mantidosPorVariancia: [], carimbar: [] }
  for (const ativa of input.ativas) {
    const chave = chaveVinculo(ativa.programa_chave, ativa.tema_id, ativa.tipo_evidencia, ativa.evidencia_ref)
    if (input.publicadasAgora.has(chave)) continue
    const impressaoAtual = atual.get(chave)
    if (!impressaoAtual) {
      plano.retirar.push({ id: ativa.id, chave, causa: "par_ausente" })
      continue
    }
    const anterior = impressaoNoMotivo(ativa.motivo)
    if (anterior && anterior !== impressaoAtual) {
      plano.retirar.push({ id: ativa.id, chave, causa: "entrada_alterada" })
      continue
    }
    plano.mantidosPorVariancia.push({ id: ativa.id, chave, impressao: impressaoAtual, sem_impressao_anterior: !anterior })
    if (!anterior) {
      plano.carimbar.push({ id: ativa.id, motivo: `${(ativa.motivo ?? "aprovado pela cascata").trim()} | ${MARCA_IMPRESSAO}${impressaoAtual}` })
    }
  }
  return plano
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
      motivo: `aprovado pelas quatro camadas da cascata ${input.versao} | ${MARCA_IMPRESSAO}${impressaoDaEntrada(par)}`,
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
  const planoDe = async (leitor: ReturnType<typeof ensureSupabaseClient>) => {
    const { data, error } = await leitor.from("compromisso_evidencia")
      .select("id,programa_chave,tema_id,tipo_evidencia,evidencia_ref,motivo").eq("origem", "cascata").eq("verificado", true)
    if (error) throw new Error(error.message)
    const plano = planejarReconciliacao({
      ativas: (data ?? []) as VinculoAtivo[],
      publicadasAgora: new Set(linhas.map((l) => chaveVinculo(l.programa_chave, l.tema_id, l.tipo_evidencia, l.evidencia_ref))),
      pares,
    })
    const arquivo = path.join(PASTA, `variancia-${agora.slice(0, 10)}.json`)
    writeFileSync(arquivo, `${JSON.stringify({ gerado_em: agora, modo: apply ? "apply" : "dry-run", ...plano }, null, 1)}\n`)
    return { plano, arquivo: path.relative(ROOT, arquivo) }
  }
  const contagemPlano = (plano: PlanoReconciliacao) => ({
    retirar_entrada_alterada: plano.retirar.filter((r) => r.causa === "entrada_alterada").length,
    retirar_par_ausente: plano.retirar.filter((r) => r.causa === "par_ausente").length,
    mantidos_por_variancia: plano.mantidosPorVariancia.length,
  })
  if (!db) {
    // Dry-run lê o estado publicado (somente leitura) para mostrar o plano de
    // reconciliação; sem credencial, mostra só a publicação.
    let reconciliacao: Record<string, unknown>
    try {
      const { plano, arquivo } = await planoDe(ensureSupabaseClient())
      reconciliacao = { ...contagemPlano(plano), arquivo_variancia: arquivo }
    } catch (erro) {
      reconciliacao = { indisponivel: erro instanceof Error ? erro.message : String(erro) }
    }
    console.log(JSON.stringify({ ...resumo, reconciliacao }, null, 2))
    return
  }
  const gravadas = await escreverAuditado(
    { script: SCRIPT, tabela: "compromisso_evidencia", motivo: `publica vinculos aprovados pela cascata ${VERSAO_CASCATA}`, recorte: `${linhas.length} linha(s)` },
    () => db.from("compromisso_evidencia")
      .upsert(linhas, { onConflict: "programa_chave,frase_id,tema_id,tipo_evidencia,evidencia_ref" })
      .select("id,programa_chave,tema_id,tipo_evidencia,evidencia_ref"),
  )
  const gravadasChaves = new Set(gravadas.map((l) => chaveVinculo(l.programa_chave, l.tema_id, l.tipo_evidencia, l.evidencia_ref)))
  if (gravadasChaves.size !== linhas.length) throw new Error(`upsert devolveu ${gravadasChaves.size} de ${linhas.length} linhas; reconciliacao abortada`)
  const { plano, arquivo: arquivoVariancia } = await planoDe(db)
  const retirar = plano.retirar.map((r) => r.id)
  let retiradas = 0
  if (retirar.length > 0) {
    retiradas = (await escreverAuditado(
      { script: SCRIPT, tabela: "compromisso_evidencia", motivo: "reconcilia: vinculo cuja entrada mudou ou cujo par sumiu sai da publicacao", recorte: `${retirar.length} linha(s)` },
      () => db.from("compromisso_evidencia").update({ verificado: false, updated_at: agora }).in("id", retirar).select("id"),
    )).length
  }
  let carimbados = 0
  if (plano.carimbar.length > 0) {
    carimbados = (await escreverAuditado(
      { script: SCRIPT, tabela: "compromisso_evidencia", motivo: "registra a impressao da entrada em vinculo publicado antes da trava de variancia", recorte: `${plano.carimbar.length} linha(s), so a coluna motivo` },
      async () => {
        const respostas = await Promise.all(plano.carimbar.map((c) =>
          db.from("compromisso_evidencia").update({ motivo: c.motivo }).eq("id", c.id).select("id")))
        return { data: respostas.flatMap((r) => r.data ?? []), error: respostas.find((r) => r.error)?.error ?? null }
      },
    )).length
  }
  // Recibo por candidato depois da publicação: lê o estado publicado que acabou
  // de ser gravado, então descreve exatamente o que a ficha vai mostrar.
  const recibos = await gravarRecibos({ db, apply: true, versao: VERSAO_CASCATA, agora })
  console.log(JSON.stringify({
    ...resumo,
    gravadas: gravadas.length,
    retiradas,
    ...contagemPlano(plano),
    carimbados,
    arquivo_variancia: arquivoVariancia,
    recibos: { gravados: recibos.gravados, ...distribuicao(recibos.recibos) },
  }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
