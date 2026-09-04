/** Pipeline do pleito corrente. A coorte vem da publicação, nunca do seed. */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { supabase, supabaseProjectRefParaAuditoria } from "./supabase"
import { parseCSV } from "./parse-csv-local"
import { downloadToFile } from "./download-to-file"
import { normalizarCpfTse } from "./cpf"
import { normalizeForMatch } from "./normalize-for-match"
import { validatePreloadedSqRow } from "./tse-resolver"
import { carregarBloqueios, type IdentidadeBloqueada, criarIndiceDeBloqueio } from "./identidade-bloqueada"
import { escreverAuditado } from "./escrita-auditada"
import { COLUNAS_JULGAMENTO, mapearJulgamento } from "./tse-situacao-julgamento"
import type { CandidatoConfig } from "./types"

const ANO = 2026
const SEED = "data/candidatos.json"
const BLOQUEIOS = "data/identidades-bloqueadas.json"
const CAMPOS = "id,slug,nome_completo,nome_urna,cargo_disputado,estado,cpf,sq_candidato_2026,situacao_candidatura"
type Linha = Record<string, string>

export interface FichaJulgamento {
  id: string
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: string
  estado: string | null
  cpf: string | null
  sq_candidato_2026: string | null
  situacao_candidatura: string | null
}

interface Fonte {
  url: string
  arquivo: string
  sha256: string
  csv: { arquivo: string; sha256: string }[]
  linhas: Linha[]
}

export interface SnapshotJulgamento {
  versao: 1
  ano: 2026
  capturado_em: string
  projeto: string
  seed_sha256: string
  bloqueios_sha256: string
  coorte: FichaJulgamento[]
  seed: CandidatoConfig[]
  bloqueios: IdentidadeBloqueada[]
  consulta: Fonte
  complementar: Fonte
}

export interface EntradaJulgamento {
  slug: string
  sq: string | null
  ancora: "db-sq-validado" | "seed-sq-validado" | null
  antes: string | null
  depois: string | null
  estado: "confere" | "proposto" | "bloqueado"
  motivos: string[]
  fonte: { codigo: string; descricao: string } | null
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function hashArquivo(path: string): string {
  return sha256(readFileSync(path))
}

/** Artefatos contêm identidade: recusar caminhos dentro do checkout, inclusive symlinks. */
export function escreverPrivado(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 })
  const destino = existsSync(path) ? realpathSync(path) : resolve(realpathSync(dirname(resolve(path))), path.split(/[\\/]/).at(-1)!)
  const rel = relative(realpathSync(process.cwd()), destino)
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error("Artefato de identidade deve ficar fora do checkout")
  writeFileSync(destino, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

/** Paginação evita transformar o limite PostgREST em uma coorte incompleta. */
export async function carregarCoorteJulgamento(): Promise<FichaJulgamento[]> {
  const slugs: string[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("candidatos_publico").select("slug").order("slug").range(offset, offset + 499)
      .abortSignal(AbortSignal.timeout(30_000))
    if (error) throw new Error(`coorte publica: ${error.message}`)
    slugs.push(...(data ?? []).map((r) => String(r.slug)))
    if ((data ?? []).length < 500) break
  }
  const scope = process.env.PF_INGEST_SLUGS?.split(",").map((s) => s.trim()).filter(Boolean)
  if (scope?.some((s) => !slugs.includes(s))) throw new Error("PF_INGEST_SLUGS contem candidato fora da coorte publica")
  const selecionados = scope?.length ? slugs.filter((s) => scope.includes(s)) : slugs
  const fichas: FichaJulgamento[] = []
  for (let offset = 0; offset < selecionados.length; offset += 100) {
    const { data, error } = await supabase.from("candidatos").select(CAMPOS).in("slug", selecionados.slice(offset, offset + 100))
      .abortSignal(AbortSignal.timeout(30_000))
    if (error) throw new Error(`identidades da coorte: ${error.message}`)
    fichas.push(...(data ?? []) as FichaJulgamento[])
  }
  if (fichas.length !== selecionados.length || new Set(fichas.map((f) => f.slug)).size !== selecionados.length) {
    throw new Error("Coorte mudou durante leitura ou identidade interna ausente")
  }
  return fichas.sort((a, b) => a.slug.localeCompare(b.slug))
}

async function capturarFonte(dir: string, pacote: string, colunas: readonly string[]): Promise<Fonte> {
  const arquivo = `${pacote}_${ANO}.zip`
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/${pacote}/${arquivo}`
  const path = resolve(dir, arquivo)
  if (!await downloadToFile(url, path, { fetcher: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(300_000) }) })) throw new Error(`Fonte indisponivel: ${pacote}; nenhuma escrita autorizada`)
  const extract = resolve(dir, pacote)
  mkdirSync(extract, { mode: 0o700 })
  execFileSync("unzip", ["-q", path, "-d", extract])
  const files = readdirSync(extract).filter((f) => f.startsWith(`${pacote}_${ANO}`) && f.endsWith(".csv")).sort()
  const nacional = files.find((f) => f.endsWith("_BRASIL.csv"))
  const selecionados = nacional ? [nacional] : files
  if (!selecionados.length) throw new Error(`Pacote ${pacote} sem CSV`)
  const linhas: Linha[] = []
  const csv: Fonte["csv"] = []
  for (const file of selecionados) {
    const csvPath = resolve(extract, file)
    let count = 0
    await parseCSV(csvPath, (row) => {
      if (count++ === 0) {
        const ausentes = colunas.filter((c) => !(c in row))
        if (ausentes.length) throw new Error(`${pacote}: colunas ausentes ${ausentes.join(",")}`)
      }
      if (row.ANO_ELEICAO !== String(ANO)) throw new Error(`${pacote}: pleito divergente`)
      linhas.push(Object.fromEntries(colunas.map((c) => [c, row[c]])))
    })
    if (!count) throw new Error(`${pacote}: CSV vazio`)
    csv.push({ arquivo: `${pacote}/${file}`, sha256: hashArquivo(csvPath) })
  }
  return { url, arquivo, sha256: hashArquivo(path), csv, linhas }
}

/** Um diretório é um snapshot imutável: replay não baixa novamente. */
export async function carregarSnapshotJulgamento(dir: string): Promise<SnapshotJulgamento> {
  const path = resolve(dir, "snapshot.json")
  if (existsSync(path)) {
    const envelope = JSON.parse(readFileSync(path, "utf8")) as { sha256: string; snapshot: SnapshotJulgamento }
    const s = envelope.snapshot
    if (envelope.sha256 !== sha256(JSON.stringify(s)) || s.versao !== 1 || s.ano !== ANO) throw new Error("Snapshot invalido/checksum divergente")
    const scope = process.env.PF_INGEST_SLUGS?.split(",").map((v) => v.trim()).filter(Boolean)
    if (scope?.length && [...new Set(scope)].sort().join() !== s.coorte.map((f) => f.slug).sort().join()) throw new Error("PF_INGEST_SLUGS difere da coorte do snapshot; recapture")
    for (const fonte of [s.consulta, s.complementar]) {
      for (const f of [{ arquivo: fonte.arquivo, sha256: fonte.sha256 }, ...fonte.csv]) {
        if (hashArquivo(resolve(dir, f.arquivo)) !== f.sha256) throw new Error(`Checksum de fonte divergente: ${f.arquivo}`)
      }
    }
    return s
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  // O arquivo inicial também verifica a localização antes de baixar dados.
  escreverPrivado(resolve(dir, "captura.json"), { estado: "capturando", ano: ANO })
  const coorte = await carregarCoorteJulgamento()
  const seed = JSON.parse(readFileSync(SEED, "utf8")) as CandidatoConfig[]
  const consulta = await capturarFonte(dir, "consulta_cand", ["ANO_ELEICAO", "CD_ELEICAO", "DT_GERACAO", "HH_GERACAO", "SQ_CANDIDATO", "NM_CANDIDATO", "NM_URNA_CANDIDATO", "SG_UF", "DS_CARGO", "NR_CPF_CANDIDATO"])
  const complementar = await capturarFonte(dir, "consulta_cand_complementar", ["ANO_ELEICAO", "CD_ELEICAO", "DT_GERACAO", "HH_GERACAO", ...COLUNAS_JULGAMENTO])
  const snapshot: SnapshotJulgamento = {
    versao: 1, ano: ANO, capturado_em: new Date().toISOString(), projeto: supabaseProjectRefParaAuditoria(),
    seed_sha256: hashArquivo(SEED), bloqueios_sha256: hashArquivo(BLOQUEIOS),
    coorte, seed: seed.filter((s) => coorte.some((c) => c.slug === s.slug)), bloqueios: carregarBloqueios().todos,
    consulta, complementar,
  }
  escreverPrivado(path, { sha256: sha256(JSON.stringify(snapshot)), snapshot })
  return snapshot
}

function indexar(linhas: Linha[]): Map<string, Linha[]> {
  const map = new Map<string, Linha[]>()
  for (const row of linhas) {
    const sq = row.SQ_CANDIDATO?.trim()
    if (!sq) continue
    const existentes = map.get(sq) ?? []
    if (!existentes.some((r) => JSON.stringify(r) === JSON.stringify(row))) existentes.push(row)
    map.set(sq, existentes)
  }
  return map
}

function validarIdentidade(f: Pick<FichaJulgamento, "nome_completo" | "nome_urna" | "cargo_disputado" | "estado">, row: Linha): string[] {
  const cargo = normalizeForMatch(f.cargo_disputado ?? "")
  const uf = cargo === "PRESIDENTE" ? "BR" : (f.estado ?? "").trim().toUpperCase()
  const reasons: string[] = []
  if (!uf || row.SG_UF !== uf) reasons.push("uf")
  if (!cargo || cargo === "NENHUM" || cargo !== normalizeForMatch(row.DS_CARGO ?? "")) reasons.push("cargo")
  if (!validatePreloadedSqRow({ ...f, estado: uf }, row, uf).ok) reasons.push("nome-uf-cargo")
  return reasons
}

export function planejarJulgamento(s: SnapshotJulgamento): EntradaJulgamento[] {
  if (s.ano !== ANO) throw new Error("Pleito incorreto")
  const consulta = indexar(s.consulta.linhas)
  const complementar = indexar(s.complementar.linhas)
  const seeds = new Map(s.seed.map((c) => [c.slug, c]))
  const bloqueios = criarIndiceDeBloqueio(s.bloqueios)
  const slugs = new Set<string>()
  const sqSlugs = new Map<string, string[]>()
  for (const f of s.coorte) {
    const sq = f.sq_candidato_2026?.trim() || seeds.get(f.slug)?.ids.tse_sq_candidato["2026"]?.trim()
    if (sq) sqSlugs.set(sq, [...(sqSlugs.get(sq) ?? []), f.slug])
  }
  return s.coorte.map((f): EntradaJulgamento => {
    if (slugs.has(f.slug)) throw new Error("Slug duplicado na coorte")
    slugs.add(f.slug)
    const seed = seeds.get(f.slug)
    const dbSq = f.sq_candidato_2026?.trim()
    const seedSq = seed?.ids.tse_sq_candidato["2026"]?.trim()
    const sq = dbSq || seedSq || null
    const e: EntradaJulgamento = { slug: f.slug, sq, ancora: null, antes: f.situacao_candidatura, depois: f.situacao_candidatura, estado: "bloqueado", motivos: [], fonte: null }
    if (!sq) e.motivos.push("sq-ausente")
    else {
      if (!/^\d+$/.test(sq)) e.motivos.push("sq-invalido")
      if (dbSq && seedSq && dbSq !== seedSq) e.motivos.push("sq-conflito-db-seed")
      if ((sqSlugs.get(sq)?.length ?? 0) > 1) e.motivos.push("sq-compartilhado-na-coorte")
      if (bloqueios.bloqueio({ slug: f.slug, sq, ano: ANO })) e.motivos.push("identidade-bloqueada")
      const rows = consulta.get(sq) ?? []
      if (rows.length !== 1) e.motivos.push(rows.length ? "identidade-fonte-ambigua" : "sq-ausente-consulta")
      else {
        const row = rows[0]
        if (row.ANO_ELEICAO !== String(ANO)) e.motivos.push("pleito-divergente-consulta")
        e.motivos.push(...validarIdentidade(f, row).map((r) => `identidade-db-${r}`))
        if (seedSq === sq && seed) e.motivos.push(...validarIdentidade({ ...seed, estado: seed.estado ?? null }, row).map((r) => `identidade-seed-${r}`))
        const cpfDb = normalizarCpfTse(f.cpf)
        const cpfFonte = normalizarCpfTse(row.NR_CPF_CANDIDATO)
        if (cpfDb && cpfFonte && cpfDb !== cpfFonte) e.motivos.push("cpf-conflito-db-fonte")
        if (!e.motivos.length) e.ancora = dbSq ? "db-sq-validado" : "seed-sq-validado"
      }
      const js = complementar.get(sq) ?? []
      if (js.length !== 1) e.motivos.push(js.length ? "julgamento-fonte-ambiguo" : "julgamento-ausente")
      else {
        const j = js[0]
        if (j.ANO_ELEICAO !== String(ANO)) e.motivos.push("pleito-divergente-complementar")
        if (!j.CD_ELEICAO?.trim() || j.CD_ELEICAO !== rows[0]?.CD_ELEICAO) e.motivos.push("eleicao-divergente-entre-pacotes")
        e.fonte = { codigo: j.CD_SITUACAO_JULGAMENTO, descricao: j.DS_SITUACAO_JULGAMENTO }
        const m = mapearJulgamento({ sq, ...e.fonte })
        if (!m.ok) e.motivos.push(m.bloqueio)
        else if (!e.motivos.length) {
          e.depois = m.valor
          e.estado = e.antes === e.depois ? "confere" : "proposto"
        }
      }
    }
    return e
  })
}

export function relatorioJulgamento(s: SnapshotJulgamento) {
  const entries = planejarJulgamento(s)
  const summary = { coorte: entries.length, conferem: 0, propostos: 0, bloqueados: 0 }
  for (const e of entries) summary[e.estado === "confere" ? "conferem" : e.estado === "proposto" ? "propostos" : "bloqueados"]++
  if (summary.coorte !== summary.conferem + summary.propostos + summary.bloqueados) throw new Error("Conservacao da coorte falhou")
  return {
    snapshot_sha256: sha256(JSON.stringify(s)), coorte_sha256: sha256(JSON.stringify(s.coorte)),
    capturado_em: s.capturado_em, projeto: s.projeto, ano: s.ano,
    fontes: [s.consulta, s.complementar].map(({ url, sha256: hash, csv, linhas }) => ({ url, sha256: hash, csv, geracoes: [...new Set(linhas.map((r) => `${r.DT_GERACAO} ${r.HH_GERACAO}`))].sort() })),
    summary, entries,
  }
}

/** Escrita opt-in, CAS por identidade e situação, sem alterar cadastro ou publicação. */
export async function aplicarJulgamento(s: SnapshotJulgamento, expectedHash: string, receiptPath: string): Promise<void> {
  const report = relatorioJulgamento(s)
  if (report.snapshot_sha256 !== expectedHash) throw new Error("Hash aprovado nao corresponde ao snapshot")
  if (supabaseProjectRefParaAuditoria() !== s.projeto || hashArquivo(SEED) !== s.seed_sha256 || hashArquivo(BLOQUEIOS) !== s.bloqueios_sha256) throw new Error("Projeto/seed/bloqueios mudou; recapture e revise")
  const atuais = await carregarCoorteJulgamento()
  if (atuais.map((f) => f.slug).join() !== s.coorte.map((f) => f.slug).join()) throw new Error("Coorte publica mudou; recapture e revise")
  for (const atual of atuais) {
    const antes = s.coorte.find((f) => f.slug === atual.slug)!
    const entry = report.entries.find((e) => e.slug === atual.slug)!
    const { situacao_candidatura: a, ...identidadeAtual } = atual
    const { situacao_candidatura: b, ...identidadeAntes } = antes
    if (JSON.stringify(identidadeAtual) !== JSON.stringify(identidadeAntes) || (a !== b && a !== entry.depois)) throw new Error(`Estado concorrente: ${atual.slug}`)
  }
  const receipt = { ...report, dry_run: false, tentativas: [] as string[], escritas: [] as string[], ja_aplicados: [] as string[], readback: [] as string[], falha: null as string | null }
  escreverPrivado(receiptPath, receipt)
  try {
    for (const e of report.entries.filter((r) => r.estado === "proposto")) {
      const f = atuais.find((r) => r.slug === e.slug)!
      if (f.situacao_candidatura === e.depois) receipt.ja_aplicados.push(e.slug)
      else {
        receipt.tentativas.push(e.slug)
        escreverPrivado(receiptPath, receipt)
        const linhas = await escreverAuditado({ script: "ingest-tse-julgamento", tabela: "candidatos", motivo: `Julgamento TSE 2026 snapshot ${expectedHash}`, recorte: e.slug }, () => {
        let query = supabase.from("candidatos").update({ situacao_candidatura: e.depois }).eq("id", f.id).eq("publicavel", true).or("status.is.null,status.neq.removido")
        for (const [campo, valor] of Object.entries(f).filter(([c]) => c !== "id")) query = valor === null ? query.is(campo, null) : query.eq(campo, valor)
        return query.select("id, situacao_candidatura").abortSignal(AbortSignal.timeout(30_000))
        })
        if (linhas.length !== 1 || linhas[0].situacao_candidatura !== e.depois) throw new Error(`CAS recusou: ${e.slug}`)
        receipt.escritas.push(e.slug)
      }
      escreverPrivado(receiptPath, receipt)
      const { data, error } = await supabase.from("candidatos").select("situacao_candidatura").eq("id", f.id).abortSignal(AbortSignal.timeout(30_000)).single()
      if (error || data?.situacao_candidatura !== e.depois) throw new Error(`Readback falhou: ${e.slug}`)
      receipt.readback.push(e.slug)
      escreverPrivado(receiptPath, receipt)
    }
  } catch (err) {
    receipt.falha = err instanceof Error ? err.message : String(err)
    throw err
  } finally { escreverPrivado(receiptPath, receipt) }
}
