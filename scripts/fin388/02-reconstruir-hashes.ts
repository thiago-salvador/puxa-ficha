/**
 * Issue #388, passo 2: reconstroi os doadores com `cpf_hash` a partir dos
 * pacotes oficiais de receitas ja em cache, sem download novo.
 *
 * Paridade por construcao: usa os modulos do proprio projeto
 * (`normalizeFinanciamentoReceitaRow`, `financiamentoReceitaDedupKey`,
 * `normalizeMaioresDoadoresForStorage`), e injeta o CPF cru no lugar do
 * `cpf_hash` para que o corte dos 10 maiores e a exclusividade CNPJ/CPF
 * sejam exatamente os mesmos do ingest.
 *
 * O salt antigo esta perdido, entao o valor do hash legado nao e verificavel
 * por igualdade. O que se prova aqui e a identidade do doador e a posicao de
 * cada hash: mesma lista, mesmos nomes, mesmos valores e hash presente
 * exatamente onde a fonte oficial da um CPF unico.
 *
 * Nenhum CPF e impresso. O mapa de CPFs vai para arquivo 0600.
 */
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execFileSync } from "node:child_process"

import { parseCSV } from "../lib/parse-csv-local"
import { normalizeFinanciamentoReceitaRow } from "../lib/financiamento-receita-legacy-row"
import { financiamentoReceitaDedupKey } from "../lib/financiamento-receita-dedup"
import { selectCanonicalFinanciamentoSourceFiles } from "../lib/ingest-tse"
import { normalizeMaioresDoadoresForStorage } from "../../src/lib/financiamento-public"
import { stripAccents } from "../../src/lib/strip-accents"

/** Mesma normalizacao usada em `aggregateMaioresDoadores` (privada la). */
function normalizePublicName(value: string): string {
  return stripAccents(value).replace(/\s+/g, " ").toUpperCase().trim()
}
import { digitsOnly, pickRawDonorDocumentFromTseRow } from "../../src/lib/financiamento-doador-identifiers"

type BridgeContext = { candidato_id: string; slug: string; ano: number; sq: string; official_uf: string }
type StoredDonor = { nome?: unknown; valor?: unknown; tipo?: unknown; cnpj?: unknown; cpf_hash?: unknown }
type Target = {
  financiamento_id: string
  candidato_id: string
  ano: number
  maiores_doadores: StoredDonor[]
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length)
}
// --work=<dir privado> e, opcional, --repo=<checkout com data/tse>.
const REPO = resolve(argValue("repo") ?? process.cwd())
const WORK = resolve(argValue("work") ?? "")
const YEARS = [2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024]

async function fetchTargets(): Promise<Map<string, Target>> {
  const base = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  if (!base || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes")
  const out = new Map<string, Target>()
  let offset = 0
  for (;;) {
    const url = `${base}/rest/v1/financiamento?select=id,candidato_id,ano_eleicao,maiores_doadores&limit=1000&offset=${offset}`
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`Supabase ${res.status}`)
    const batch = (await res.json()) as Array<Record<string, unknown>>
    if (batch.length === 0) break
    for (const row of batch) {
      const donors = Array.isArray(row.maiores_doadores) ? (row.maiores_doadores as StoredDonor[]) : []
      const hashed = donors.filter((d) => typeof d?.cpf_hash === "string" && String(d.cpf_hash).trim())
      if (hashed.length === 0) continue
      out.set(String(row.id), {
        financiamento_id: String(row.id),
        candidato_id: String(row.candidato_id),
        ano: Number(row.ano_eleicao),
        maiores_doadores: donors,
      })
    }
    if (batch.length < 1000) break
    offset += batch.length
  }
  if (out.size !== 108) throw new Error(`esperados 108 contextos com hash, obtidos ${out.size}`)
  return out
}

function extractYear(ano: number, dir: string): string[] {
  const tseDir = join(REPO, "data", "tse")
  const zips = readdirSync(tseDir)
    .filter((n) => n.startsWith(`receitas_${ano}_`) && n.endsWith(".zip"))
    .map((n) => join(tseDir, n))
  if (zips.length !== 1) throw new Error(`pacote de receitas ${ano}: ${zips.length} candidatos no cache`)
  const target = join(dir, String(ano))
  mkdirSync(target, { recursive: true })
  // Só os membros de receitas de candidatos. Doador originário fica fora,
  // como no ingest.
  const listing = execFileSync("unzip", ["-Z1", zips[0]!]).toString().split("\n")
  const members = listing.filter((n) =>
    /receitas?_?candidatos.*\.(txt|csv)$/i.test(n) &&
    !/doador_originario/i.test(n))
  if (members.length === 0) throw new Error(`pacote de receitas ${ano}: nenhum membro de receitas de candidatos`)
  execFileSync("unzip", ["-o", "-q", zips[0]!, ...members, "-d", target])
  const paths = members.map((m) => join(target, m))
  return selectCanonicalFinanciamentoSourceFiles(paths, ano)
}

/** Mesma leitura de `parseBRL` em `scripts/lib/ingest-tse.ts` (privada la). */
function parseBRL(value: string): number {
  if (!value || value === "#NULO#" || value === "#NE#" || value === "-1") return 0
  const parsed = parseFloat(value.replace(/\./g, "").replace(",", "."))
  return Number.isNaN(parsed) ? 0 : parsed
}

function fileUf(path: string): string {
  const byName = /_([A-Z]{2})\.(?:txt|csv)$/i.exec(path)
  if (byName) return byName[1]!.toUpperCase()
  const byDir = /\/candidato\/([A-Z]{2})\//i.exec(path)
  if (byDir) return byDir[1]!.toUpperCase()
  return ""
}

async function main(): Promise<number> {
  const bridge = JSON.parse(readFileSync(join(WORK, "bridge-final.private.json"), "utf8")) as {
    resolved: BridgeContext[]
    attribution_removed: BridgeContext[]
  }
  const targets = await fetchTargets()

  const byCandAno = new Map<string, Target[]>()
  for (const t of targets.values()) {
    const k = `${t.candidato_id}|${t.ano}`
    byCandAno.set(k, [...(byCandAno.get(k) ?? []), t])
  }

  type Active = Target & { sq: string; uf: string; slug: string }
  const active: Active[] = []
  const removed: Array<Target & { slug: string }> = []
  for (const c of bridge.resolved) {
    for (const t of byCandAno.get(`${c.candidato_id}|${c.ano}`) ?? []) {
      active.push({ ...t, sq: String(c.sq).trim(), uf: String(c.official_uf).trim().toUpperCase(), slug: c.slug })
    }
  }
  for (const c of bridge.attribution_removed) {
    for (const t of byCandAno.get(`${c.candidato_id}|${c.ano}`) ?? []) removed.push({ ...t, slug: c.slug })
  }
  if (active.length + removed.length !== 108) {
    throw new Error(`particao invalida: ${active.length} ativos + ${removed.length} removidos`)
  }

  const scratch = mkdtempSync(join(tmpdir(), "fin388-src-"))
  const sources: Array<Record<string, unknown>> = []
  // sq -> doadores brutos reconstruidos, no formato que o ingest monta.
  const rebuilt = new Map<string, Array<{ nome: string; valor: number; tipo: string; cnpj?: string; cpf_hash?: string }>>()
  let rowsScanned = 0
  let rowsForTarget = 0
  let dedupSkipped = 0

  try {
    for (const ano of YEARS) {
      const yearActive = active.filter((a) => a.ano === ano)
      if (yearActive.length === 0) continue
      const wanted = new Map(yearActive.map((a) => [a.sq, a]))
      const files = extractYear(ano, scratch)
      const seen = new Set<string>()
      for (const file of files) {
        const ufFromPath = fileUf(file)
        await parseCSV(file, (raw) => {
          rowsScanned += 1
          const row = normalizeFinanciamentoReceitaRow(raw)
          const sq = row.SQ_CANDIDATO?.trim()
          if (!sq || !wanted.has(sq)) return
          const alvo = wanted.get(sq)!
          if (!row.SG_UF_CANDIDATURA?.trim() && ufFromPath) row.SG_UF_CANDIDATURA = ufFromPath
          const uf = row.SG_UF_CANDIDATURA?.trim().toUpperCase() || alvo.uf
          rowsForTarget += 1
          const dedupKey = financiamentoReceitaDedupKey(row, { ano, uf, sqCandidato: sq })
          if (dedupKey) {
            if (seen.has(dedupKey)) { dedupSkipped += 1; return }
            seen.add(dedupKey)
          }
          const nome = (row.NM_DOADOR || row.NM_DOADOR_RFB || "").trim()
          const valor = parseBRL(row.VR_RECEITA || "0")
          if (!nome || !Number.isFinite(valor)) return
          // O CPF cru entra no lugar do hash: a agregacao decide igual, e a
          // troca pelo hash novo acontece depois, ja com a chave versionada.
          const docDigits = digitsOnly(pickRawDonorDocumentFromTseRow(row))
          const entry: { nome: string; valor: number; tipo: string; cnpj?: string; cpf_hash?: string } = {
            nome, valor, tipo: "PF",
          }
          if (docDigits.length === 14) entry.cnpj = docDigits
          else if (docDigits.length === 11) entry.cpf_hash = docDigits
          rebuilt.set(sq, [...(rebuilt.get(sq) ?? []), entry])
        })
      }
      sources.push({ ano, arquivos: files.length })
      process.stderr.write(`varrido ano=${ano} arquivos=${files.length} contextos=${yearActive.length}\n`)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  // Cache do agregado bruto (contem CPF): permite reconferir a comparacao sem
  // revarrer os pacotes. Fica 0600 e e apagado no fim do reparo.
  const cachePath = join(WORK, "rebuilt-donors.private.json")
  writeFileSync(cachePath, `${JSON.stringify(Object.fromEntries(rebuilt))}\n`)
  chmodSync(cachePath, 0o600)

  const contexts: Array<Record<string, unknown>> = []
  const recovered: Record<string, Record<string, string>> = {}
  const failures: Array<Record<string, unknown>> = []

  for (const a of active) {
    const reconstructed = normalizeMaioresDoadoresForStorage(rebuilt.get(a.sq) ?? [])
    const stored = a.maiores_doadores
    const problems: string[] = []

    // A ordenacao por valor nao desempata, entao doadores de valor igual podem
    // trocar de posicao entre execucoes. A comparacao e por nome normalizado.
    const keyOf = (nome: string) => normalizePublicName(nome)
    const recByName = new Map(reconstructed.map((r) => [keyOf(r.nome), r]))
    const stoByName = new Map<string, { nome: string; valor: number; cpf_hash?: string }>()
    for (const s of stored) {
      const nome = typeof s.nome === "string" ? s.nome.trim() : ""
      if (!nome) continue
      const k = keyOf(nome)
      if (!k) continue
      stoByName.set(k, {
        nome,
        valor: Number(s.valor),
        cpf_hash: typeof s.cpf_hash === "string" && s.cpf_hash.trim() ? s.cpf_hash.trim() : undefined,
      })
    }

    for (const k of stoByName.keys()) if (!recByName.has(k)) problems.push(`ausente_na_fonte:${k.slice(0, 24)}`)
    for (const k of recByName.keys()) if (!stoByName.has(k)) problems.push(`sobra_na_fonte:${k.slice(0, 24)}`)

    let hashesOk = 0
    let storedHashes = 0
    for (const [k, s] of stoByName) {
      const r = recByName.get(k)
      if (!r) continue
      if (Math.abs(r.valor - s.valor) > 0.005) problems.push(`valor:${k.slice(0, 24)}`)
      if (s.cpf_hash) {
        storedHashes += 1
        if (r.cpf_hash) {
          hashesOk += 1
          const idx = stored.findIndex((d) => typeof d.nome === "string" && keyOf(d.nome.trim()) === k)
          recovered[a.financiamento_id] = { ...(recovered[a.financiamento_id] ?? {}), [String(idx)]: r.cpf_hash }
        } else {
          problems.push(`hash_sem_cpf:${k.slice(0, 24)}`)
        }
      } else if (r.cpf_hash) {
        problems.push(`cpf_sem_hash:${k.slice(0, 24)}`)
      }
    }

    const ok = problems.length === 0
    const item = {
      financiamento_id: a.financiamento_id, slug: a.slug, ano: a.ano, uf: a.uf, sq: a.sq,
      doadores_armazenados: stored.length, doadores_reconstruidos: reconstructed.length,
      hashes_armazenados: storedHashes, hashes_com_cpf_recuperado: hashesOk,
      status: ok ? "reproduzivel" : "nao_reproduzivel",
      problemas: problems.slice(0, 10),
    }
    contexts.push(item)
    if (!ok) failures.push(item)
  }

  const hashesAtivos = active.reduce(
    (acc, a) => acc + a.maiores_doadores.filter((d) => typeof d.cpf_hash === "string" && String(d.cpf_hash).trim()).length, 0)
  const hashesProvados = contexts.reduce((acc, c) => acc + Number(c.hashes_com_cpf_recuperado), 0)

  const report = {
    issue: 388, step: "02-reconstruir-hashes", generated_at: new Date().toISOString().slice(0, 10),
    paridade: "modulos do proprio projeto: normalizeFinanciamentoReceitaRow, financiamentoReceitaDedupKey, normalizeMaioresDoadoresForStorage",
    limite_conhecido: "o salt antigo esta perdido; o valor do hash legado nao e verificavel por igualdade",
    prova: "mesma lista de doadores, mesmos nomes e valores, e hash presente exatamente onde a fonte oficial da um CPF unico",
    stats: { rows_scanned: rowsScanned, rows_for_target: rowsForTarget, dedup_skipped: dedupSkipped },
    sources,
    scope: {
      contextos_ativos: active.length, contextos_removidos: removed.length,
      hashes_ativos: hashesAtivos, hashes_provados: hashesProvados,
      hashes_removidos: removed.reduce(
        (acc, r) => acc + r.maiores_doadores.filter((d) => typeof d.cpf_hash === "string" && String(d.cpf_hash).trim()).length, 0),
    },
    contexts,
    attribution_removed: removed.map((r) => ({ financiamento_id: r.financiamento_id, slug: r.slug, ano: r.ano })),
    writes: { supabase: 0, production: 0, secrets: 0 },
    raw_sensitive_data_emitted: false,
  }
  const outPath = join(WORK, "reconstrucao.json")
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
  chmodSync(outPath, 0o600)

  if (failures.length > 0) {
    process.stdout.write(`\nABORT: ${failures.length} de ${active.length} contextos nao reproduziveis, ` +
      `${hashesAtivos - hashesProvados} de ${hashesAtivos} hashes sem prova:\n`)
    for (const f of failures) {
      process.stdout.write(`  - ${f.slug} ${f.ano} ${f.uf} SQ ${f.sq}: ` +
        `${f.hashes_com_cpf_recuperado}/${f.hashes_armazenados} hashes, problemas: ${(f.problemas as string[]).join(", ") || "n/d"}\n`)
    }
    return 1
  }

  const priv = join(WORK, "recovered-cpfs.private.json")
  writeFileSync(priv, `${JSON.stringify(recovered)}\n`)
  chmodSync(priv, 0o600)
  process.stdout.write(`\nOK: ${active.length} contextos reproduzidos, ${hashesProvados}/${hashesAtivos} hashes com identidade recuperada\n`)
  process.stdout.write(`relatorio: ${outPath}\n`)
  return 0
}

main().then((code) => process.exit(code)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})
