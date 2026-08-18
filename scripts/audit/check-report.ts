/**
 * Asserções sobre o relatório de cobertura (2026-08-02).
 *
 * Lê o HTML gerado por `scripts/audit/coverage-report.ts` (que marca cada célula
 * com `class="c-<estado>" data-slug data-col`) e falha com exit != 0 quando a
 * régua não bate. Não toca banco nem rede.
 *
 * Modo 1 — asserção pontual:
 *   tsx scripts/audit/check-report.ts --slug augusto-cury,renan-santos \
 *     --cols patrimonio,evolucao,bens,financiamento,doadores --expect c-na
 *
 * Modo 2 — gate de lacuna corrigível:
 *   tsx scripts/audit/check-report.ts --fail-on-correctable-missing --slugs a,b,c
 *
 *   Falha se algum slug tiver célula "esperado e vazio" (`c-missing`) SEM desfecho
 *   registrado. Contam como desfecho:
 *     - migration pendente anotada com `-- @write` cobrindo aquela coluna;
 *     - exceção em `data/sq-exceptions.json` (colunas de TSE: patrimônio,
 *       evolução, bens, financiamento, doadores);
 *     - exceção editorial em `scripts/audit/editorial-exceptions.json`
 *       (qualquer coluna, com motivo e data de confirmação).
 *
 * Flags comuns:
 *   --report=PATH   HTML a conferir (default: o mais recente em ~/.disposable-html)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { homedir } from "node:os"

import { lerPendingWrites, type PendingWrite } from "./lib/pending-writes"

const RAIZ = resolve(import.meta.dirname, "..", "..")

export interface CelulaLida {
  slug: string
  col: string
  estado: string
}

const TD = /<td class="c-([a-z]+)" data-slug="([^"]+)" data-col="([^"]+)"/g

export function lerCelulas(html: string): CelulaLida[] {
  const out: CelulaLida[] = []
  for (const m of html.matchAll(TD)) {
    out.push({ estado: `c-${m[1]}`, slug: m[2], col: m[3] })
  }
  return out
}

/** Colunas cuja lacuna pode ser justificada por exceção de fonte TSE. */
const COLUNAS_TSE = new Set(["patrimonio", "evolucao", "bens", "financiamento", "doadores"])

/** Coluna do relatório -> tabela que uma migration pendente escreveria. */
const COLUNA_PARA_TABELA: Record<string, string> = {
  patrimonio: "patrimonio",
  evolucao: "patrimonio",
  bens: "patrimonio",
  financiamento: "financiamento",
  doadores: "financiamento",
  posicoes: "posicoes_declaradas",
  destaques: "projetos_lei",
  dados: "candidatos",
}

interface ExcecaoEditorial {
  slug: string
  coluna: string
  motivo: string
  confirmado_em: string
  detalhe?: string
}

function lerExcecoesEditoriais(): ExcecaoEditorial[] {
  const path = join(RAIZ, "scripts", "audit", "editorial-exceptions.json")
  if (!existsSync(path)) return []
  const raw = JSON.parse(readFileSync(path, "utf8")) as { entries?: ExcecaoEditorial[] }
  return raw.entries ?? []
}

function lerSqExceptions(): { slug: string; ano: number; reason: string }[] {
  const path = join(RAIZ, "data", "sq-exceptions.json")
  if (!existsSync(path)) return []
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    entries?: { slug: string; ano: number; reason: string }[]
  }
  return raw.entries ?? []
}

function relatorioMaisRecente(): string {
  const dir = join(homedir(), ".disposable-html")
  const alvos = readdirSync(dir)
    .filter((f) => f.includes("puxa-ficha-cobertura-dados") && f.endsWith(".html"))
    .sort()
  if (!alvos.length) throw new Error(`nenhum relatório de cobertura em ${dir}`)
  return join(dir, alvos[alvos.length - 1])
}

/** Aceita as duas formas: `--nome=valor` e `--nome valor`. */
function flag(argv: string[], nome: string): string | undefined {
  const i = argv.findIndex((a) => a === `--${nome}` || a.startsWith(`--${nome}=`))
  if (i === -1) return undefined
  const hit = argv[i]
  const eq = hit.indexOf("=")
  if (eq !== -1) return hit.slice(eq + 1)
  const proximo = argv[i + 1]
  return proximo && !proximo.startsWith("--") ? proximo : ""
}

function lista(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)
}

export function temDesfecho(
  slug: string,
  col: string,
  pendentes: PendingWrite[],
  editoriais: ExcecaoEditorial[],
  sq: { slug: string; ano: number; reason: string }[]
): string | null {
  const tabela = COLUNA_PARA_TABELA[col]
  if (tabela) {
    const w = pendentes.find((p) => p.slug === slug && p.tabela === tabela)
    if (w) return `migration pendente ${w.arquivo} (${w.tabela})`
  }
  const ed = editoriais.find((e) => e.slug === slug && e.coluna === col)
  if (ed) return `exceção editorial: ${ed.motivo} (confirmado em ${ed.confirmado_em})`
  if (COLUNAS_TSE.has(col)) {
    const e = sq.find((x) => x.slug === slug)
    if (e) return `sq-exceptions.json: ${e.reason} (${e.ano})`
  }
  return null
}

function main(): void {
  const argv = process.argv.slice(2)
  const reportPath = flag(argv, "report") || relatorioMaisRecente()
  const html = readFileSync(reportPath, "utf8")
  const celulas = lerCelulas(html)
  if (!celulas.length) {
    console.error(`FAIL: nenhuma célula anotada encontrada em ${reportPath}`)
    process.exit(1)
  }
  const indice = new Map(celulas.map((c) => [`${c.slug}::${c.col}`, c.estado]))
  console.error(`[check-report] ${reportPath} (${celulas.length} células)`)

  let falhas = 0

  const expect = flag(argv, "expect")
  if (expect !== undefined) {
    const slugs = lista(flag(argv, "slug") ?? flag(argv, "slugs"))
    const cols = lista(flag(argv, "cols"))
    if (!slugs.length || !cols.length) {
      console.error("FAIL: --expect exige --slug e --cols")
      process.exit(1)
    }
    for (const slug of slugs) {
      for (const col of cols) {
        const atual = indice.get(`${slug}::${col}`)
        if (atual === undefined) {
          console.error(`FAIL ${slug}.${col}: célula ausente no relatório`)
          falhas += 1
        } else if (atual !== expect) {
          console.error(`FAIL ${slug}.${col}: esperado ${expect}, encontrado ${atual}`)
          falhas += 1
        } else {
          console.error(`PASS ${slug}.${col} = ${expect}`)
        }
      }
    }
  }

  if (flag(argv, "fail-on-correctable-missing") !== undefined) {
    const slugs = lista(flag(argv, "slugs") ?? flag(argv, "slug"))
    if (!slugs.length) {
      console.error("FAIL: --fail-on-correctable-missing exige --slugs")
      process.exit(1)
    }
    const pendentes = lerPendingWrites(
      join(RAIZ, "supabase", "migrations"),
      flag(argv, "migrations-desde") || undefined
    )
    const editoriais = lerExcecoesEditoriais()
    const sq = lerSqExceptions()

    for (const slug of slugs) {
      const faltando = celulas.filter((c) => c.slug === slug && c.estado === "c-missing")
      if (!faltando.length) {
        console.error(`PASS ${slug}: nenhuma célula esperada-e-vazia`)
        continue
      }
      for (const c of faltando) {
        const desfecho = temDesfecho(slug, c.col, pendentes, editoriais, sq)
        if (desfecho) {
          console.error(`PASS ${slug}.${c.col}: vazia, com desfecho -> ${desfecho}`)
        } else {
          console.error(`FAIL ${slug}.${c.col}: esperada e vazia, sem desfecho registrado`)
          falhas += 1
        }
      }
    }
  }

  if (expect === undefined && flag(argv, "fail-on-correctable-missing") === undefined) {
    console.error("FAIL: nada a checar (use --expect ou --fail-on-correctable-missing)")
    process.exit(1)
  }

  if (falhas > 0) {
    console.error(`\n${falhas} falha(s).`)
    process.exit(1)
  }
  console.error("\nOK: todas as asserções passaram.")
}

if (import.meta.filename === process.argv[1]) {
  main()
}
