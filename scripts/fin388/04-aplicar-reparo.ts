/**
 * Issue #388, passos 5 a 9: reescreve `cpf_hash` de doador com a chave v2,
 * grava SQ e UF oficiais, move para quarentena as linhas cuja atribuição foi
 * removida e corrige o CPF do cadastro de rodrigo-pacheco.
 *
 *   --dry-run (padrão)  monta o plano, confere contra o backup e não escreve.
 *   --apply             exige o plano do dry-run, confere o estado vivo contra
 *                       ele (CAS) e só então escreve, com trilha auditada e
 *                       compensação em caso de falha. Termina com readback.
 *
 * Nenhum CPF ou valor de chave é impresso. Arquivos com dado sensível ficam
 * 0600 no diretório de trabalho privado.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { supabase } from "../lib/supabase"
import { escreverAuditado } from "../lib/escrita-auditada"
import { parseCSV } from "../lib/parse-csv-local"
import { normalizeMaioresDoadoresForStorage } from "../../src/lib/financiamento-public"
import { DONOR_CPF_HASH_VERSION, hashCpfForDonorStorage } from "../../src/lib/financiamento-doador-identifiers"
import { stripAccents } from "../../src/lib/strip-accents"

const WORK = resolve(process.env.PF388_WORK ?? "")
const REPO = resolve(process.env.PF388_REPO ?? process.cwd())
const MODE = process.argv.includes("--apply") ? "apply" : "dry-run"
const PLAN = join(WORK, "plano-388.private.json")
const SCRIPT = "fin388-aplicar-reparo"
const PACHECO = { slug: "rodrigo-pacheco", ano: 2018, sq: "130000604556", uf: "MG", nome: "RODRIGO OTAVIO SOARES PACHECO", cargo: "SENADOR" }

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
type Row = Record<string, Json>
type Donor = Record<string, Json>

const norm = (v: string) => stripAccents(v).replace(/\s+/g, " ").toUpperCase().trim()
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "")
function canonical(v: Json): Json {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k]!)]))
  return v
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const fp = (r: Row) => sha(JSON.stringify(canonical({
  maiores_doadores: r.maiores_doadores ?? null,
  sq_candidato: (r.sq_candidato as string) || null,
  uf_candidatura: (r.uf_candidatura as string) || null,
})))
const hashed = (d: Donor) => typeof d.cpf_hash === "string" && d.cpf_hash.trim() !== ""
function write0600(path: string, data: unknown) { writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`); chmodSync(path, 0o600) }
function fail(msg: string): never { throw new Error(`ABORT: ${msg}`) }

async function fetchAll(table: string, select: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).order("id").range(from, from + 999)
    if (error) fail(`${table}: ${error.message}`)
    out.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 1000) break
  }
  return out
}

function readBackupFinanciamento(): Map<string, Row> {
  const dir = readFileSync(join(WORK, "ultimo-backup.path"), "utf8").trim()
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { archive: string }
  const tar = execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
    "-in", join(dir, manifest.archive), "-pass", `file:${join(dir, "backup.passphrase")}`], { maxBuffer: 1 << 30 })
  const scratch = mkdtempSync(join(tmpdir(), "fin388-bk-"))
  try {
    writeFileSync(join(scratch, "b.tar"), tar)
    const jsonl = execFileSync("tar", ["-xOf", join(scratch, "b.tar"), "financiamento.jsonl"], { maxBuffer: 1 << 30 }).toString()
    return new Map(jsonl.split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l) as Row; return [String(r.id), r] }))
  } finally { rmSync(scratch, { recursive: true, force: true }) }
}

async function officialPachecoCpf(): Promise<string> {
  const zip = join(REPO, "data", "tse", "consulta_cand_2018.zip")
  const members = execFileSync("unzip", ["-Z1", zip]).toString().split("\n").filter((m) => /_(MG|BRASIL)\.csv$/i.test(m))
  if (members.length === 0) fail("consulta_cand_2018 sem membro MG/BRASIL")
  const scratch = mkdtempSync(join(tmpdir(), "fin388-cc-"))
  const found = new Map<string, { nome: string; uf: string; cargo: string }>()
  try {
    execFileSync("unzip", ["-o", "-q", zip, ...members, "-d", scratch])
    for (const m of members) {
      await parseCSV(join(scratch, m), (row) => {
        if ((row.SQ_CANDIDATO ?? "").trim() !== PACHECO.sq) return
        found.set(digits(row.NR_CPF_CANDIDATO), { nome: norm(row.NM_CANDIDATO ?? ""), uf: (row.SG_UF ?? "").trim(), cargo: norm(row.DS_CARGO ?? "") })
      })
    }
  } finally { rmSync(scratch, { recursive: true, force: true }) }
  if (found.size !== 1) fail(`SQ ${PACHECO.sq}: ${found.size} CPFs distintos na fonte oficial`)
  const [[cpf, info]] = [...found.entries()] as [[string, { nome: string; uf: string; cargo: string }]]
  if (cpf.length !== 11) fail("CPF oficial do SQ não tem 11 dígitos")
  if (info.nome !== PACHECO.nome || info.uf !== PACHECO.uf || !info.cargo.includes(PACHECO.cargo)) {
    fail(`linha oficial do SQ ${PACHECO.sq} não confere com nome, UF e cargo esperados`)
  }
  return cpf
}

async function buildPlan() {
  const bridge = JSON.parse(readFileSync(join(WORK, "bridge-final.private.json"), "utf8")) as {
    resolved: Array<{ candidato_id: string; slug: string; ano: number; sq: string; official_uf: string }>
    attribution_removed: Array<{ candidato_id: string; slug: string; ano: number }>
  }
  const rebuilt = JSON.parse(readFileSync(join(WORK, "rebuilt-donors.private.json"), "utf8")) as Record<string, Donor[]>
  const salt = readFileSync(join(WORK, "salt-v2.secret"), "utf8").trim()
  if (salt.length < 32) fail("chave v2 ausente ou curta")
  const saltFp = readFileSync(join(WORK, "salt-v2.fingerprint"), "utf8").trim()

  const all = await fetchAll("financiamento", "*")
  if (all.length !== 2039) fail(`financiamento tem ${all.length} linhas, esperado 2039`)
  const alvo = all.filter((r) => Array.isArray(r.maiores_doadores) && (r.maiores_doadores as Donor[]).some(hashed))
  if (alvo.length !== 108) fail(`${alvo.length} linhas com cpf_hash, esperado 108`)

  const backup = readBackupFinanciamento()
  for (const r of alvo) {
    const b = backup.get(String(r.id))
    if (!b || fp(b) !== fp(r)) fail(`linha ${r.id} diverge do backup cifrado`)
  }

  const byCtx = new Map(alvo.map((r) => [`${r.candidato_id}|${r.ano_eleicao}`, r]))
  const updates: Array<{ id: string; slug: string; ano: number; sq: string; uf: string; before_fp: string; after: Row; after_fp: string; hashes: number }> = []
  let totalHashes = 0
  for (const c of bridge.resolved) {
    const r = byCtx.get(`${c.candidato_id}|${c.ano}`) ?? fail(`contexto sem linha: ${c.slug} ${c.ano}`)
    if ((r.sq_candidato as string) || (r.uf_candidatura as string)) fail(`linha ${r.id} já tem SQ/UF`)
    const fonte = normalizeMaioresDoadoresForStorage((rebuilt[c.sq] ?? []) as never, Number.MAX_SAFE_INTEGER)
    const porNome = new Map(fonte.map((f) => [norm(f.nome), f]))
    let n = 0
    const novos = (r.maiores_doadores as Donor[]).map((d) => {
      if (!hashed(d)) return d
      const f = porNome.get(norm(String(d.nome ?? ""))) ?? fail(`${c.slug} ${c.ano}: doador com hash sem nome na fonte`)
      const cpf = String(f.cpf_hash ?? "")
      if (!/^\d{11}$/.test(cpf)) fail(`${c.slug} ${c.ano}: doador com hash sem CPF único na fonte`)
      if (Math.abs(Number(f.valor) - Number(d.valor)) > 0.005) fail(`${c.slug} ${c.ano}: valor diverge da fonte`)
      const novo = hashCpfForDonorStorage(cpf, salt)
      if (novo === d.cpf_hash) fail("hash v2 igual ao legado, chave suspeita")
      n += 1
      return { ...d, cpf_hash: novo, cpf_hash_versao: DONOR_CPF_HASH_VERSION }
    })
    const uf = String(c.official_uf).toUpperCase()
    if (!/^[A-Z]{2}$/.test(uf)) fail(`UF inválida para ${c.slug} ${c.ano}`)
    const after: Row = { maiores_doadores: novos as Json, sq_candidato: String(c.sq), uf_candidatura: uf }
    updates.push({ id: String(r.id), slug: c.slug, ano: c.ano, sq: String(c.sq), uf, before_fp: fp(r), after, after_fp: fp(after), hashes: n })
    totalHashes += n
  }
  if (updates.length !== 103 || totalHashes !== 690) fail(`plano com ${updates.length} linhas e ${totalHashes} hashes, esperado 103 e 690`)

  const quarentena: Array<{ id: string; slug: string; ano: number; before_fp: string; row: Row }> = []
  for (const c of bridge.attribution_removed) {
    const r = byCtx.get(`${c.candidato_id}|${c.ano}`) ?? fail(`contexto removido sem linha: ${c.slug} ${c.ano}`)
    if (r.sq_candidato || r.uf_candidatura || r.cargo_candidatura || r.despublicado_em || r.despublicacao_motivo) {
      fail(`linha ${r.id} tem campo que a quarentena não preserva`)
    }
    quarentena.push({ id: String(r.id), slug: c.slug, ano: c.ano, before_fp: fp(r), row: r })
  }
  if (quarentena.length !== 5) fail(`${quarentena.length} linhas para quarentena, esperado 5`)
  const { data: jaQ, error: eQ } = await supabase.from("financiamento_quarentena").select("id").in("id", quarentena.map((q) => q.id))
  if (eQ) fail(eQ.message)
  if ((jaQ ?? []).length) fail("id de quarentena já existe")

  const { data: cands, error: eC } = await supabase.from("candidatos").select("id,slug,cpf").eq("slug", PACHECO.slug)
  if (eC) fail(eC.message)
  if (!cands || cands.length !== 1) fail("cadastro de rodrigo-pacheco não é único")
  const cand = cands[0] as { id: string; cpf: string | null }
  const oficial = await officialPachecoCpf()
  if (digits(cand.cpf) === oficial) fail("CPF do cadastro já é o oficial; premissa da correção não se confirma")

  return {
    issue: 388, generated_at: new Date().toISOString(), salt_fingerprint: saltFp, hash_version: DONOR_CPF_HASH_VERSION,
    updates, quarentena,
    pacheco: { candidato_id: cand.id, before_cpf: cand.cpf, before_sha: sha(String(cand.cpf ?? "")), after_cpf: oficial },
  }
}

type Plan = Awaited<ReturnType<typeof buildPlan>>

function summary(plan: Plan) {
  return {
    issue: 388, modo: MODE, salt_fingerprint: plan.salt_fingerprint, hash_version: plan.hash_version,
    linhas_reescritas: plan.updates.length,
    hashes_reescritos: plan.updates.reduce((a, u) => a + u.hashes, 0),
    sq_uf_gravados: plan.updates.length,
    quarentena: plan.quarentena.map((q) => `${q.slug} ${q.ano}`),
    pacheco_cpf_corrigido: true,
    por_contexto: plan.updates.map((u) => ({ slug: u.slug, ano: u.ano, uf: u.uf, sq: u.sq, hashes: u.hashes })),
  }
}

async function liveRow(id: string): Promise<Row | null> {
  const { data, error } = await supabase.from("financiamento").select("*").eq("id", id)
  if (error) fail(error.message)
  return ((data ?? [])[0] as Row | undefined) ?? null
}

async function apply(plan: Plan) {
  // CAS em lote: o estado vivo inteiro tem que ser o do plano antes da primeira escrita.
  for (const u of plan.updates) { const r = await liveRow(u.id); if (!r || fp(r) !== u.before_fp) fail(`CAS: ${u.slug} ${u.ano} mudou desde o dry-run`) }
  for (const q of plan.quarentena) { const r = await liveRow(q.id); if (!r || fp(r) !== q.before_fp) fail(`CAS: ${q.slug} ${q.ano} mudou desde o dry-run`) }
  const { data: pc } = await supabase.from("candidatos").select("cpf").eq("id", plan.pacheco.candidato_id)
  if (sha(String((pc?.[0] as { cpf?: string } | undefined)?.cpf ?? "")) !== plan.pacheco.before_sha) fail("CAS: CPF do cadastro mudou desde o dry-run")

  const feitos: string[] = []
  let quarentenaInserida = false, quarentenaRemovida = false, pachecoFeito = false
  try {
    for (const u of plan.updates) {
      const r = await liveRow(u.id)
      if (!r || fp(r) !== u.before_fp) fail(`CAS: ${u.slug} ${u.ano} mudou durante o apply`)
      const got = await escreverAuditado(
        { script: SCRIPT, tabela: "financiamento", motivo: "reescreve cpf_hash de doador com chave v2 e grava SQ/UF oficiais da candidatura", recorte: `id=${u.id}; ${u.slug} ${u.ano}` },
        () => supabase.from("financiamento").update(u.after).eq("id", u.id).or("sq_candidato.is.null,sq_candidato.eq.").select("id"),
      )
      if (got.length !== 1) fail(`update de ${u.slug} ${u.ano} tocou ${got.length} linhas`)
      feitos.push(u.id)
    }
    const ids = plan.quarentena.map((q) => q.id)
    const qRows = plan.quarentena.map((q) => {
      const r = q.row
      return {
        id: r.id, candidato_id: r.candidato_id, ano_eleicao: r.ano_eleicao,
        total_arrecadado: r.total_arrecadado, total_fundo_partidario: r.total_fundo_partidario,
        total_fundo_eleitoral: r.total_fundo_eleitoral, total_pessoa_fisica: r.total_pessoa_fisica,
        total_recursos_proprios: r.total_recursos_proprios, maiores_doadores: r.maiores_doadores, fonte: r.fonte,
        created_at: r.created_at, maiores_doadores_publicos: r.maiores_doadores_publicos,
        quarentena_motivo: `sem candidatura oficial de ${q.slug} em ${q.ano} (nem por CPF nem por nome completo); atribuição removida, issue #388`,
        sq_errado: null, sq_pertence_a: null,
      }
    })
    const ins = await escreverAuditado(
      { script: SCRIPT, tabela: "financiamento_quarentena", motivo: "move para quarentena financiamento sem candidatura oficial no ano do contexto", recorte: `id in (${ids.join(", ")})` },
      () => supabase.from("financiamento_quarentena").insert(qRows).select("id"),
    )
    if (ins.length !== 5) fail(`quarentena inseriu ${ins.length} linhas`)
    quarentenaInserida = true
    const del = await escreverAuditado(
      { script: SCRIPT, tabela: "financiamento", motivo: "remove da tabela viva o financiamento já copiado para a quarentena", recorte: `id in (${ids.join(", ")})` },
      () => supabase.from("financiamento").delete().in("id", ids).or("sq_candidato.is.null,sq_candidato.eq.").select("id"),
    )
    if (del.length !== 5) fail(`remoção tocou ${del.length} linhas`)
    quarentenaRemovida = true
    const pat = await escreverAuditado(
      { script: SCRIPT, tabela: "candidatos", motivo: "corrige CPF do cadastro pelo CPF da linha oficial do SQ da candidatura", recorte: `slug=${PACHECO.slug}` },
      () => supabase.from("candidatos").update({ cpf: plan.pacheco.after_cpf }).eq("id", plan.pacheco.candidato_id).select("id"),
    )
    if (pat.length !== 1) fail(`correção de CPF tocou ${pat.length} linhas`)
    pachecoFeito = true
  } catch (error) {
    process.stderr.write(`falha no apply, compensando: ${error instanceof Error ? error.message : String(error)}\n`)
    const beforeRows = readBackupFinanciamento()
    for (const id of feitos.reverse()) {
      const b = beforeRows.get(id)!
      await escreverAuditado(
        { script: SCRIPT, tabela: "financiamento", motivo: "compensação: restaura a linha ao estado anterior ao reparo", recorte: `id=${id}` },
        () => supabase.from("financiamento").update({ maiores_doadores: b.maiores_doadores, sq_candidato: b.sq_candidato, uf_candidatura: b.uf_candidatura }).eq("id", id).select("id"),
      )
    }
    const ids = plan.quarentena.map((q) => q.id)
    if (quarentenaRemovida) {
      await escreverAuditado(
        { script: SCRIPT, tabela: "financiamento", motivo: "compensação: devolve à tabela viva as linhas da quarentena", recorte: `id in (${ids.join(", ")})` },
        () => supabase.from("financiamento").insert(plan.quarentena.map((q) => Object.fromEntries(Object.entries(q.row).filter(([k]) => k !== "maiores_doadores_publicos")))).select("id"),
      )
    }
    if (quarentenaInserida) {
      await escreverAuditado(
        { script: SCRIPT, tabela: "financiamento_quarentena", motivo: "compensação: desfaz a cópia para a quarentena", recorte: `id in (${ids.join(", ")})` },
        () => supabase.from("financiamento_quarentena").delete().in("id", ids).select("id"),
      )
    }
    if (pachecoFeito) {
      await escreverAuditado(
        { script: SCRIPT, tabela: "candidatos", motivo: "compensação: restaura o CPF anterior do cadastro", recorte: `slug=${PACHECO.slug}` },
        () => supabase.from("candidatos").update({ cpf: plan.pacheco.before_cpf }).eq("id", plan.pacheco.candidato_id).select("id"),
      )
    }
    throw error
  }
}

async function readback(plan: Plan) {
  const problemas: string[] = []
  for (const u of plan.updates) {
    const r = await liveRow(u.id)
    if (!r) { problemas.push(`${u.slug} ${u.ano}: linha sumiu`); continue }
    if (fp(r) !== u.after_fp) problemas.push(`${u.slug} ${u.ano}: estado difere do plano`)
    if (r.sq_candidato !== u.sq || r.uf_candidatura !== u.uf) problemas.push(`${u.slug} ${u.ano}: SQ/UF`)
    const ds = (r.maiores_doadores as Donor[]) ?? []
    if (ds.filter(hashed).some((d) => d.cpf_hash_versao !== DONOR_CPF_HASH_VERSION)) problemas.push(`${u.slug} ${u.ano}: hash sem versão v2`)
    const pub = JSON.stringify(r.maiores_doadores_publicos ?? [])
    if (/cpf_hash|cpf_hash_versao|"cpf"/.test(pub)) problemas.push(`${u.slug} ${u.ano}: campo sensível no payload público`)
  }
  const ids = plan.quarentena.map((q) => q.id)
  const { data: viva } = await supabase.from("financiamento").select("id").in("id", ids)
  if ((viva ?? []).length) problemas.push("linha removida ainda na tabela viva")
  const { data: q } = await supabase.from("financiamento_quarentena").select("id,maiores_doadores").in("id", ids)
  if ((q ?? []).length !== 5) problemas.push(`quarentena tem ${(q ?? []).length} de 5`)
  const { data: pc } = await supabase.from("candidatos").select("cpf").eq("id", plan.pacheco.candidato_id)
  if (digits((pc?.[0] as { cpf?: string } | undefined)?.cpf) !== plan.pacheco.after_cpf) problemas.push("CPF do cadastro não é o oficial")
  const all = await fetchAll("financiamento", "id,maiores_doadores")
  const comHash = all.filter((r) => Array.isArray(r.maiores_doadores) && (r.maiores_doadores as Donor[]).some(hashed))
  const legado = comHash.filter((r) => (r.maiores_doadores as Donor[]).filter(hashed).some((d) => d.cpf_hash_versao !== DONOR_CPF_HASH_VERSION))
  return { linhas_financiamento: all.length, linhas_com_hash: comHash.length, linhas_com_hash_legado: legado.length, problemas }
}

async function main() {
  if (!existsSync(join(WORK, "salt-v2.secret"))) fail("chave v2 não encontrada")
  if (MODE === "dry-run") {
    const plan = await buildPlan()
    write0600(PLAN, plan)
    write0600(join(WORK, "dry-run-388.json"), summary(plan))
    console.log(JSON.stringify({ ...summary(plan), por_contexto: `${plan.updates.length} contextos (detalhe em dry-run-388.json)` }, null, 2))
    return
  }
  if (!existsSync(PLAN)) fail("rode --dry-run antes do --apply")
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as Plan
  const fresh = await buildPlan()
  if (JSON.stringify(canonical(summary(fresh) as unknown as Json)).replace(/"modo":"[^"]+"/, "") !==
      JSON.stringify(canonical(summary(plan) as unknown as Json)).replace(/"modo":"[^"]+"/, "")) fail("plano recalculado difere do dry-run")
  if (fresh.updates.some((u, i) => u.after_fp !== plan.updates[i]!.after_fp || u.before_fp !== plan.updates[i]!.before_fp)) fail("plano recalculado difere do dry-run nas linhas")
  await apply(plan)
  const rb = await readback(plan)
  write0600(join(WORK, "readback-388.json"), rb)
  console.log(JSON.stringify({ aplicado: true, ...summary(plan), por_contexto: undefined, readback: rb }, null, 2))
  if (rb.problemas.length) process.exitCode = 1
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
