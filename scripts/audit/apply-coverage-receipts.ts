/**
 * Grava em `coleta_log` recibos de cobertura que FECHAM célula da matriz, e só
 * esses. Padrão é dry-run; a escrita exige `--apply`, credencial de serviço e
 * uma lista explícita de fontes.
 *
 * Cada recibo é reavaliado contra o perfil público do momento com a mesma
 * régua da matriz (`audit-cobertura-fichas.ts`): se a prova não fecha mais a
 * célula (payload mudou, identidade não confere, estado não é publicado nem
 * vazio confirmado), o recibo é recusado. Recibo `indeterminado` nunca é
 * gravado por aqui, porque só trocaria um estado aberto por outro.
 *
 * Antes do INSERT, o último recibo de cada (alvo, fonte) é salvo em backup; o
 * INSERT devolve os ids, e o rollback é apagar exatamente esses ids.
 *
 * Uso:
 *   node --import tsx scripts/audit/apply-coverage-receipts.ts \
 *     --in=/privado/recibos.json --allow-fonte=tse-patrimonio,camara-gastos \
 *     --out-dir=/privado/aplicacao [--profiles=/privado/perfis.json | --base-url=https://puxaficha.com.br] \
 *     [--incluir-abertos --recibos-atuais=/privado/coleta-log.json] [--apply --execucao=f8:20260925]
 *
 * `--incluir-abertos` grava também os recibos `erro`/`indeterminado` da mesma
 * entrada (fonte que não respondeu, prova que não fechou), por ficha e só para
 * família aplicável. Família com prazo em dias (parlamentar) não recebe recibo
 * aberto por cima de prova vigente; família sem prazo (histórico) sempre
 * recebe, e o recibo aberto posterior derruba a prova na régua.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { isHousePartitionFamily, publicFamilyHouseRows, publicFamilyRowCount } from "./lib/coverage-source-proof"
import {
  adaptLatestReceipts,
  buildCoverageMatrix,
  familyWithoutFreshnessSla,
  receiptFamilies,
  requiredCoverageHouses,
  type CoverageFamily,
  type CoverageProfile,
  type LatestReceiptRow,
} from "./audit-cobertura-fichas"

export type PlannedReceipt = {
  fonte: string
  escopo: "candidato"
  alvo: string
  candidato_id: string
  resultado: "encontrado" | "vazio_confirmado"
  volume: number
  url: string | null
  detalhe: string | null
  familia: CoverageFamily
  estado_projetado: "publicado" | "vazio_confirmado"
}

export type PlanResult = {
  planned: PlannedReceipt[]
  rejected: Array<{ fonte: string | null; alvo: string | null; motivo: string }>
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Reavalia cada recibo sozinho contra o perfil público; aceita só o que fecha a célula. */
export function planCoverageReceipts(rows: LatestReceiptRow[], profiles: CoverageProfile[], allowedSources: ReadonlySet<string>): PlanResult {
  const bySlug = new Map(profiles.map((profile) => [text(profile.slug) ?? "", profile]))
  const planned: PlannedReceipt[] = []
  const rejected: PlanResult["rejected"] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const fonte = text(row.fonte)
    const alvo = text(row.alvo)
    const reject = (motivo: string) => rejected.push({ fonte, alvo, motivo })
    if (!fonte || !allowedSources.has(fonte)) { reject("fonte fora da lista permitida"); continue }
    if (text(row.escopo) !== "candidato") { reject("escopo não é candidato"); continue }
    const profile = alvo ? bySlug.get(alvo) : undefined
    if (!alvo || !profile) { reject("alvo fora da coorte pública lida"); continue }
    if (text(row.candidato_id) !== text(profile.id)) { reject("candidato_id não confere com o perfil público"); continue }
    const resultado = text(row.resultado)
    if (resultado !== "encontrado" && resultado !== "vazio_confirmado") { reject(`resultado ${resultado ?? "ausente"} não fecha célula`); continue }
    const families = receiptFamilies(fonte, row.detalhe, row.url) ?? []
    if (families.length !== 1) { reject("recibo precisa mapear exatamente uma família"); continue }
    const familia = families[0]
    // Vazio só contra payload sem linha; encontrado só contra payload com linha.
    const multiHouse = isHousePartitionFamily(familia)
    const publicRows = publicFamilyRowCount(profile, familia)
    let detail: Record<string, unknown> | null = null
    try { detail = typeof row.detalhe === "string" ? JSON.parse(row.detalhe) as Record<string, unknown> : row.detalhe as Record<string, unknown> ?? null } catch { detail = null }
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) { reject("detalhe ausente ou não é JSON de objeto"); continue }
    let partition: Record<string, unknown> | null = null
    if (multiHouse) {
      const proof = detail.coverage_proof as Record<string, unknown> | undefined
      partition = proof?.house_partition && typeof proof.house_partition === "object" ? proof.house_partition as Record<string, unknown> : null
      const house = partition?.casa
      const byHouse = publicFamilyHouseRows(profile, familia)
      if (!byHouse || (house !== "camara" && house !== "senado") || !Array.isArray(byHouse[house])) {
        reject("linhas públicas sem partição válida por casa"); continue
      }
      const houseRows = byHouse[house]!
      if (resultado === "vazio_confirmado" && houseRows.length > 0) { reject(`vazio contra ${houseRows.length} linha(s) pública(s) da casa ${house}`); continue }
      if (resultado === "encontrado" && houseRows.length === 0) { reject(`encontrado sem linha pública da casa ${house}`); continue }
    } else {
      if (resultado === "vazio_confirmado" && publicRows > 0) { reject(`vazio contra ${publicRows} linha(s) publicada(s) em ${familia}`); continue }
      if (resultado === "encontrado" && publicRows === 0) { reject(`encontrado sem linha publicada em ${familia}`); continue }
    }
    const key = `${alvo}|${fonte}|${familia}`
    if (seen.has(key)) { reject("recibo duplicado para a mesma ficha, fonte e família"); continue }
    // A régua completa, só com este recibo: o que ele sozinho faz com a célula.
    const probe = { ...row, executado_em: new Date(Date.now() - 1000).toISOString() }
    let probeRows: LatestReceiptRow[] = [probe]
    if (multiHouse) {
      const roundId = text(row.execucao)
      if (!roundId) { reject("prova por casa sem identificador da rodada"); continue }
      const required = requiredCoverageHouses(profile, familia)
      const publicPartitions = publicFamilyHouseRows(profile, familia)!
      if (required.length === 0 || required.some((house) => !publicPartitions[house]) ||
          Object.entries(publicPartitions).some(([house, houseRows]) => (houseRows?.length ?? 0) > 0 && !required.includes(house as "camara" | "senado"))) {
        reject("casas requeridas não cobrem toda a partição pública"); continue
      }
      const paired: LatestReceiptRow[] = []
      for (const house of required) {
        const matches = rows.filter((candidateRow) => {
          if (text(candidateRow.alvo) !== alvo || text(candidateRow.candidato_id) !== text(profile.id) || text(candidateRow.execucao) !== roundId) return false
          const candidateSource = text(candidateRow.fonte)
          if (!candidateSource || !allowedSources.has(candidateSource)) return false
          const candidateFamilies = receiptFamilies(candidateSource, candidateRow.detalhe, candidateRow.url) ?? []
          if (candidateFamilies.length !== 1 || candidateFamilies[0] !== familia) return false
          let candidateDetail: Record<string, unknown> | null = null
          try { candidateDetail = typeof candidateRow.detalhe === "string" ? JSON.parse(candidateRow.detalhe) : candidateRow.detalhe as Record<string, unknown> } catch { return false }
          const candidateProof = candidateDetail?.coverage_proof as Record<string, unknown> | undefined
          const candidatePartition = candidateProof?.house_partition as Record<string, unknown> | undefined
          const receiptSource = candidateSource.toLocaleLowerCase()
          const labelHouse = receiptSource.startsWith("camara") ? "camara" : receiptSource.startsWith("senado") || receiptSource === "ceaps-senado" ? "senado" : null
          return candidatePartition?.casa === house && candidateProof?.identity &&
            (candidateProof.identity as Record<string, unknown>).house === house && labelHouse === house &&
            (candidateRow.resultado === "encontrado" || candidateRow.resultado === "vazio_confirmado")
        })
        if (matches.length !== 1) { reject(`esperada exatamente uma prova da casa ${house} na mesma rodada`); break }
        paired.push({ ...matches[0], executado_em: new Date(Date.now() - 1000).toISOString() })
      }
      if (paired.length !== required.length) continue
      const totalPublicPreviewRows = Object.values(publicPartitions).reduce((sum, items) => sum + (items?.length ?? 0), 0)
      if (totalPublicPreviewRows !== publicRows) { reject("união das partições não coincide com o payload público"); continue }
      if (familia === "projetos_lei") {
        const detailRows = paired.map((item) => JSON.parse(String(item.detalhe)) as Record<string, unknown>)
        const sourceCount = detailRows.reduce((sum, item) => sum + Number((item.coverage_proof as Record<string, unknown>)?.source_rows ?? NaN), 0)
        if (!Number.isSafeInteger(profile.projetos_lei_total) || sourceCount !== profile.projetos_lei_total) {
          reject("soma das contagens oficiais por casa não confere com projetos_lei_total")
          continue
        }
      }
      probeRows = paired
    }
    const joins = adaptLatestReceipts(probeRows, [profile]).joins
    const cell = buildCoverageMatrix([profile], [], joins).cells.find((item) => item.familia === familia)
    if (!cell || (cell.estado !== "publicado" && cell.estado !== "vazio_confirmado")) {
      reject(`a régua não fecha ${familia} com este recibo (${cell?.estado ?? "sem célula"})`)
      continue
    }
    // Famílias anuais: o detalhe precisa dizer quais eleições a prova cobre,
    // para que recibo de outro ano na mesma fonte não seja lido como substituto.
    // O detalhe gravado precisa ser JSON de objeto: é ele que a régua relê.
    const revisions = Array.isArray((detail?.coverage_proof as Record<string, unknown> | undefined)?.source_revisions)
      ? (detail!.coverage_proof as Record<string, unknown>).source_revisions as Array<Record<string, unknown>> : []
    const years = [...new Set(revisions.map((revision) => Number(revision?.year)).filter((year) => Number.isInteger(year) && year > 1900))].sort((a, b) => a - b)
    if (["patrimonio", "financiamento", "historico_politico"].includes(familia) && years.length === 0) {
      reject("prova sem os anos/eleições cobertos")
      continue
    }
    seen.add(key)
    planned.push({
      fonte, escopo: "candidato", alvo, candidato_id: text(profile.id)!, resultado,
      volume: resultado === "encontrado" ? Math.max(1, Math.trunc(Number(row.volume) || 1)) : 0,
      url: text(row.url), detalhe: detail ? JSON.stringify({ ...detail, anos_cobertos: years }) : null,
      familia, estado_projetado: cell.estado,
    })
  }
  return { planned, rejected }
}

export type OpenReceipt = {
  fonte: string
  escopo: "candidato"
  alvo: string
  candidato_id: string
  resultado: "erro" | "indeterminado"
  volume: 0
  url: string | null
  detalhe: string
  familia: CoverageFamily
}

/**
 * Recibos abertos e honestos (`erro`, `indeterminado`) da mesma rodada: fonte
 * que não respondeu ou prova que não fechou fica registrada por ficha, em vez
 * de sumir. Só entram para família aplicável à ficha, e nunca para um
 * (alvo, fonte) que a rodada já prova com recibo que fecha a célula.
 */
export function planOpenReceipts(
  rows: LatestReceiptRow[],
  profiles: CoverageProfile[],
  allowedSources: ReadonlySet<string>,
  closing: readonly PlannedReceipt[],
  currentReceipts: LatestReceiptRow[],
): { planned: OpenReceipt[]; rejected: PlanResult["rejected"] } {
  // Célula fechada por prova ainda vigente não é reaberta por uma rodada que
  // não conseguiu provar: quem a reabre é o prazo de frescor da própria prova.
  const currentJoins = adaptLatestReceipts(currentReceipts, profiles).joins
  const bySlug = new Map(profiles.map((profile) => [text(profile.slug) ?? "", profile]))
  const closed = new Set(closing.map((item) => `${item.alvo}|${item.fonte}`))
  const planned: OpenReceipt[] = []
  const rejected: PlanResult["rejected"] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const resultado = text(row.resultado)
    if (resultado !== "erro" && resultado !== "indeterminado") continue
    const fonte = text(row.fonte)
    const alvo = text(row.alvo)
    const reject = (motivo: string) => rejected.push({ fonte, alvo, motivo })
    if (!fonte || !allowedSources.has(fonte)) { reject("fonte fora da lista permitida"); continue }
    if (text(row.escopo) !== "candidato") { reject("escopo não é candidato"); continue }
    const profile = alvo ? bySlug.get(alvo) : undefined
    if (!alvo || !profile) { reject("alvo fora da coorte pública lida"); continue }
    if (text(row.candidato_id) !== text(profile.id)) { reject("candidato_id não confere com o perfil público"); continue }
    if (Number(row.volume ?? 0) !== 0) { reject("recibo aberto com volume diferente de zero"); continue }
    const families = receiptFamilies(fonte, row.detalhe, row.url) ?? []
    if (families.length !== 1) { reject("recibo precisa mapear exatamente uma família"); continue }
    const familia = families[0]
    let detail: unknown = null
    try { detail = typeof row.detalhe === "string" ? JSON.parse(row.detalhe) : row.detalhe } catch { detail = null }
    if (!detail || typeof detail !== "object" || Array.isArray(detail) || !text((detail as Record<string, unknown>).motivo)) { reject("recibo aberto sem detalhe JSON com motivo"); continue }
    const key = `${alvo}|${fonte}`
    if (closed.has(key)) { reject("a rodada já prova esta fonte para a ficha"); continue }
    if (seen.has(key)) { reject("recibo aberto duplicado para a mesma ficha e fonte"); continue }
    const cell = buildCoverageMatrix([profile], [], currentJoins).cells.find((item) => item.familia === familia)
    if (!cell?.aplicavel) { reject(`${familia} não se aplica à ficha`); continue }
    // Família com prazo (parlamentar): a prova vigente só cai pelo prazo; uma
    // rodada sem acesso à fonte não a apaga. Família sem prazo (histórico):
    // o recibo aberto sempre entra, senão divergência nova ficaria escondida.
    if (!familyWithoutFreshnessSla(familia) && (cell.estado === "publicado" || cell.estado === "vazio_confirmado")) { reject(`${familia} já fechada por prova vigente dentro do prazo`); continue }
    seen.add(key)
    planned.push({ fonte, escopo: "candidato", alvo, candidato_id: text(profile.id)!, resultado, volume: 0, url: text(row.url), detalhe: JSON.stringify(detail), familia })
  }
  return { planned, rejected }
}

function arg(name: string): string | null {
  const prefix = `--${name}=`
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null
}

async function loadProfiles(slugs: string[]): Promise<CoverageProfile[]> {
  const file = arg("profiles")
  if (file) return JSON.parse(readFileSync(resolve(file), "utf8")) as CoverageProfile[]
  const base = (arg("base-url") ?? "https://puxaficha.com.br").replace(/\/$/, "")
  const profiles: CoverageProfile[] = []
  for (const slug of slugs) {
    let response = await fetch(`${base}/api/candidato-profile/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } })
    // A rota pública limita por IP; 429 é espera, não ausência.
    for (let attempt = 1; response.status === 429 && attempt <= 5; attempt++) {
      await new Promise((accept) => setTimeout(accept, 5_000 * attempt))
      response = await fetch(`${base}/api/candidato-profile/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } })
    }
    if (!response.ok) throw new Error(`perfil ${slug}: HTTP ${response.status}`)
    const envelope = await response.json() as { data?: CoverageProfile; sourceStatus?: unknown }
    if (envelope.sourceStatus !== "live" || envelope.data?.slug !== slug) throw new Error(`perfil ${slug} não publicado ou divergente`)
    profiles.push(envelope.data)
    await new Promise((accept) => setTimeout(accept, 250))
  }
  return profiles
}

function writePrivate(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" })
}

async function main(): Promise<void> {
  const input = arg("in")
  const outDir = arg("out-dir")
  const allow = new Set((arg("allow-fonte") ?? "").split(",").map((item) => item.trim()).filter(Boolean))
  const apply = process.argv.includes("--apply")
  if (!input || !outDir || allow.size === 0) throw new Error("use --in=, --out-dir= e --allow-fonte=")
  const raw = JSON.parse(readFileSync(resolve(input), "utf8")) as { receipts?: LatestReceiptRow[]; rows?: LatestReceiptRow[] } | LatestReceiptRow[]
  const rows = Array.isArray(raw) ? raw : raw.receipts ?? raw.rows ?? []
  const slugs = [...new Set(rows.map((row) => text(row.alvo)).filter((slug): slug is string => Boolean(slug)))]
  const profiles = await loadProfiles(slugs)
  const plan = planCoverageReceipts(rows, profiles, allow)
  let open: ReturnType<typeof planOpenReceipts> = { planned: [], rejected: [] }
  if (process.argv.includes("--incluir-abertos")) {
    // Sem os recibos atuais não há como saber se a célula está fechada: o
    // recibo aberto poderia reabrir prova vigente. Exige a leitura.
    const currentPath = arg("recibos-atuais")
    if (!currentPath) throw new Error("--incluir-abertos exige --recibos-atuais=<snapshot de coleta_log>")
    const rawCurrent = JSON.parse(readFileSync(resolve(currentPath), "utf8")) as { rows?: LatestReceiptRow[]; receipts?: LatestReceiptRow[] } | LatestReceiptRow[]
    const current = Array.isArray(rawCurrent) ? rawCurrent : rawCurrent.rows ?? rawCurrent.receipts ?? []
    open = planOpenReceipts(rows, profiles, allow, plan.planned, current)
  }
  mkdirSync(resolve(outDir), { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const byFamily: Record<string, number> = {}
  for (const item of plan.planned) byFamily[`${item.fonte}|${item.familia}|${item.estado_projetado}`] = (byFamily[`${item.fonte}|${item.familia}|${item.estado_projetado}`] ?? 0) + 1
  const openByResult: Record<string, number> = {}
  for (const item of open.planned) openByResult[`${item.fonte}|${item.familia}|${item.resultado}`] = (openByResult[`${item.fonte}|${item.familia}|${item.resultado}`] ?? 0) + 1
  writePrivate(resolve(outDir, `plano-${stamp}.json`), { mode: apply ? "apply" : "dry-run", input: resolve(input), profiles_read: profiles.length, by_family: byFamily, planned: plan.planned, rejected: plan.rejected, abertos: open.planned, abertos_recusados: open.rejected })
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", entrada: rows.length, planejados: plan.planned.length, recusados: plan.rejected.length, por_familia: byFamily, abertos: open.planned.length, abertos_por_resultado: openByResult }))
  if (!apply) return

  const execucao = arg("execucao")
  if (!execucao || !/^[a-z0-9][a-z0-9:._-]{2,80}$/i.test(execucao)) throw new Error("--apply exige --execucao=<id único da rodada>")
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("--apply exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
  const { createClient } = await import("@supabase/supabase-js")
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const already = await db.from("coleta_log").select("id", { count: "exact", head: true }).eq("execucao", execucao)
  if (already.error) throw new Error(already.error.message)
  if ((already.count ?? 0) > 0) throw new Error(`execução ${execucao} já tem ${already.count} linha(s); nada gravado`)
  // Backup: último recibo de cada (alvo, fonte) afetado, antes do INSERT.
  const backup: unknown[] = []
  for (const item of [...plan.planned, ...open.planned]) {
    const { data, error } = await db.from("coleta_log").select("id,fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,url,execucao")
      .eq("alvo", item.alvo).eq("fonte", item.fonte).eq("escopo", "candidato").order("executado_em", { ascending: false }).limit(1)
    if (error) throw new Error(error.message)
    backup.push({ alvo: item.alvo, fonte: item.fonte, anterior: data?.[0] ?? null })
  }
  writePrivate(resolve(outDir, `backup-${stamp}.json`), { execucao, backup })
  const insertRows = [...plan.planned, ...open.planned].map((item) => ({
    fonte: item.fonte, escopo: item.escopo, alvo: item.alvo, candidato_id: item.candidato_id, resultado: item.resultado,
    volume: item.volume, url: item.url, detalhe: item.detalhe, execucao, duracao_ms: null,
  }))
  if (insertRows.length === 0) {
    console.log(JSON.stringify({ execucao, inseridos: 0, readback: 0, ok: true }))
    return
  }
  const inserted = await db.from("coleta_log").insert(insertRows).select("id,alvo,fonte,resultado")
  if (inserted.error) throw new Error(inserted.error.message)
  const ids = (inserted.data ?? []).map((row) => row.id as number)
  const readback = await db.from("coleta_log").select("id", { count: "exact", head: true }).eq("execucao", execucao)
  const ok = !readback.error && readback.count === insertRows.length && ids.length === insertRows.length
  writePrivate(resolve(outDir, `aplicacao-${stamp}.json`), { execucao, planejados: insertRows.length, inseridos: ids.length, readback: readback.count ?? null, ok, ids, rollback: `delete from coleta_log where execucao = '${execucao}' and id = any(array[${ids.join(",")}])` })
  console.log(JSON.stringify({ execucao, inseridos: ids.length, readback: readback.count ?? null, ok }))
  if (!ok) throw new Error("readback não confere com o planejado")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
