/** Leitura da coorte pública e profissão declarada no CSV oficial; diferenças exigem classificação. */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { supabase } from "../lib/supabase"
import { parseCSV } from "../lib/parse-csv-local"
import { validatePreloadedSqRow } from "../lib/tse-resolver"
import { normalizeForMatch } from "../lib/normalize-for-match"
import { carregarBloqueios } from "../lib/identidade-bloqueada"
import { normalizarCpfTse } from "../lib/cpf"
import { ativarDryRun } from "../lib/dry-run"

export function classificarProfissao(antes: string | null, fonte: string | null): string {
  if (antes === fonte) return "igual"
  const a = normalizeForMatch(antes ?? ""), f = normalizeForMatch(fonte ?? "")
  if (a === f) return "equivalente_textual"
  if (!a) return "ausente_db"
  const genero: Record<string, string> = { ADVOGADA: "ADVOGADO", MEDICA: "MEDICO", PSICOLOGA: "PSICOLOGO", EMPRESARIA: "EMPRESARIO" }
  if (genero[a] === f) return "equivalente_genero"
  if (a === "PROFESSOR UNIVERSITARIO" && f === "PROFESSOR DE ENSINO SUPERIOR") return "sinonimo"
  // Composição/especialização pode ser verdadeira sem ser a declaração literal.
  // Este grupo NÃO autoriza substituição automática de texto curado.
  if ((f.length >= 6 && a.includes(f)) || (a.length >= 6 && f.startsWith(`${a} `)) ||
      (a === "PSIQUIATRA, PROFESSOR E ESCRITOR" && f === "ESCRITOR E CRITICO") ||
      (a === "DEFENSOR PUBLICO" && f === "ADVOGADO") ||
      (a === "BANCARIO E DIRIGENTE SINDICAL" && f === "BANCARIO E ECONOMIARIO") ||
      (a === "SARGENTO DA POLICIA MILITAR E CIENTISTA SOCIAL" && f === "POLICIAL MILITAR") ||
      (a === "PROFESSORA" && f === "PROFESSOR DE ENSINO MEDIO")) return "composicao_ou_especializacao_revisar"
  if (f.includes("APOSENTADO") || f === "MILITAR REFORMADO") return "condicao_laboral_distinta_revisar"
  if (["GOVERNADOR", "SENADOR", "DEPUTADO", "VEREADOR", "PREFEITO"].includes(f)) return "cargo_eletivo_declarado_2026_revisar"
  if (["GOVERNADOR", "SENADOR", "DEPUTADO", "VEREADOR", "PREFEITO"].includes(a)) return "cargo_armazenado_vs_ocupacao_2026_revisar"
  if (a === "OUTROS" || f === "OUTROS") return "categoria_generica_revisar"
  return "ocupacao_distinta_revisar"
}

export async function reconciliarProfissao(dir: string): Promise<void> {
  ativarDryRun()
  const envelope = JSON.parse(readFileSync(resolve(dir, "snapshot.json"), "utf8"))
  const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex")
  if (envelope.sha256 !== sha(JSON.stringify(envelope.snapshot))) throw new Error("Snapshot alterado")
  const fonte = envelope.snapshot.consulta
  if (sha(readFileSync(resolve(dir, fonte.arquivo))) !== fonte.sha256) throw new Error("ZIP alterado")
  const rows = new Map<string, Record<string, string>[]>()
  for (const f of fonte.csv) {
    const path = resolve(dir, f.arquivo)
    if (sha(readFileSync(path)) !== f.sha256) throw new Error("CSV alterado")
    await parseCSV(path, (row) => {
      if (!["ANO_ELEICAO", "SQ_CANDIDATO", "NM_CANDIDATO", "NM_URNA_CANDIDATO", "SG_UF", "DS_CARGO", "CD_OCUPACAO", "DS_OCUPACAO"].every((c) => c in row)) throw new Error("Coluna oficial ausente")
      rows.set(row.SQ_CANDIDATO, [...(rows.get(row.SQ_CANDIDATO) ?? []), row])
    })
  }
  const { data: publicos, error: erroPublicos } = await supabase.from("candidatos_publico").select("slug").order("slug").limit(1000)
  if (erroPublicos || !publicos || publicos.length >= 1000) throw new Error("Coorte pública ausente ou exige paginação")
  const { data, error } = await supabase.from("candidatos").select("id,slug,nome_completo,nome_urna,cargo_disputado,estado,cpf,sq_candidato_2026,profissao_declarada,ultima_atualizacao,verificacao_campos").in("slug", publicos.map((r) => r.slug)).order("slug")
  if (error || data?.length !== publicos.length) throw new Error("Coorte interna divergente")
  const seed = new Set(JSON.parse(readFileSync("data/candidatos.json", "utf8")).map((r: { slug: string }) => r.slug))
  const bloqueios = carregarBloqueios()
  const entries = data.map((c) => {
    const candidatos = rows.get(c.sq_candidato_2026) ?? []
    const row = candidatos[0]
    const motivos: string[] = []
    if (!c.sq_candidato_2026) motivos.push("sq-ausente")
    if (candidatos.length !== 1) motivos.push(candidatos.length ? "sq-ambiguo" : "sq-nao-localizado")
    if (row) {
      const uf = c.cargo_disputado === "Presidente" ? "BR" : c.estado
      if (row.ANO_ELEICAO !== "2026") motivos.push("ano-divergente")
      if (row.SG_UF !== uf) motivos.push("uf-divergente")
      if (normalizeForMatch(row.DS_CARGO) !== normalizeForMatch(c.cargo_disputado)) motivos.push("cargo-divergente")
      if (!validatePreloadedSqRow(c, row, uf).ok) motivos.push("identidade-divergente")
      const cpfDb = normalizarCpfTse(c.cpf), cpfFonte = normalizarCpfTse(row.NR_CPF_CANDIDATO)
      if (cpfDb && cpfFonte && cpfDb !== cpfFonte) motivos.push("cpf-divergente")
      if (bloqueios.bloqueio({ slug: c.slug, sq: row.SQ_CANDIDATO, ano: 2026 })) motivos.push("identidade-bloqueada")
    }
    const before = c.profissao_declarada
    const after = row?.DS_OCUPACAO ?? null
    const classificacao = motivos.length ? "bloqueado" : classificarProfissao(before, after)
    return { id: c.id, slug: c.slug, fora_seed: !seed.has(c.slug), sq: c.sq_candidato_2026, nome_oficial: row?.NM_CANDIDATO, uf_oficial: row?.SG_UF, cargo_oficial: row?.DS_CARGO, codigo_ocupacao: row?.CD_OCUPACAO, antes: before, fonte: after, classificacao, motivos, ultima_atualizacao: c.ultima_atualizacao, verificacao_campos: c.verificacao_campos }
  })
  const report = { gerado_em: new Date().toISOString(), coorte: entries.length, snapshot_sha256: envelope.sha256, fonte: { url: fonte.url, sha256: fonte.sha256, csv: fonte.csv }, classes: entries.reduce<Record<string, number>>((acc, e) => { acc[e.classificacao] = (acc[e.classificacao] ?? 0) + 1; return acc }, {}), entries }
  const path = resolve(dir, "profissoes.json")
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  console.log(JSON.stringify({ coorte: report.coorte, classes: report.classes, fora_seed: entries.filter((e) => e.fora_seed).length, relatorio: path }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dir = process.argv.find((a) => a.startsWith("--snapshot-dir="))?.slice(15)
  if (!dir) throw new Error("--snapshot-dir obrigatório, fora do checkout, com snapshot e CSVs oficiais")
  reconciliarProfissao(dir).catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 2 })
}
