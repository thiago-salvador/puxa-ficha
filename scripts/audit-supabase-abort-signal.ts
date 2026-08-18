/**
 * Auditoria: todo call site de `withSupabaseRetry` em src/lib/api.ts que faz query
 * PostgREST direta precisa receber o `AbortSignal` do retry e encadear
 * `.abortSignal(signal)` na query.
 *
 * Por que isto vira gate: `withSupabaseRetry` aborta o AbortController da tentativa
 * quando o timeout dispara, mas o abort so chega ao PostgREST se o caller repassar
 * o signal. Sem isso a tentativa abandonada continua ocupando um slot do semaforo de
 * `src/lib/supabase.ts` ate o fetch responder sozinho, e a ficha, que dispara 13
 * queries em paralelo, come os slots da instancia inteira.
 *
 * Uso:
 *   npx tsx scripts/audit-supabase-abort-signal.ts
 *   npx tsx scripts/audit-supabase-abort-signal.ts --json
 *
 * Exit code 1 quando existe query direta sem `.abortSignal`, quando a allowlist
 * tem entrada obsoleta, ou quando um call site allowlistado passou a ser query
 * direta (allowlist nao e cheque em branco: ela e reconferida a cada rodada).
 */
import { readFileSync } from "node:fs"
import { relative, resolve } from "node:path"

import ts from "typescript"

const TARGET_FILE = "src/lib/api.ts"
const RETRY_FN = "withSupabaseRetry"

/**
 * Call sites que legitimamente NAO sao query PostgREST direta. A chave e o texto
 * literal do primeiro argumento (o label), que sobrevive a mudanca de linha.
 *
 * Regra: so entra aqui o callback que nao tem builder do PostgREST para encadear
 * `.abortSignal()`. Se um dia o call site virar query direta, o proprio audit
 * acusa ("allowlist obsoleta") em vez de deixar passar calado.
 */
const NOT_DIRECT_QUERY_ALLOWLIST: ReadonlyArray<{ label: string; motivo: string }> = [
  {
    label: "`legislacao_mandato_executivo_full(${slug})`",
    motivo:
      "O callback nao monta query: chama fetchLegislacaoMandatoExecutivoRowsPaged " +
      "(src/lib/fetch-gastos-votos-in-batch.ts), que dispara as faixas em paralelo e devolve " +
      "as linhas ja materializadas, e envolve o resultado num .then/.catch para virar " +
      "{ data, error }. Nao existe builder no call site para receber .abortSignal(); " +
      "o helper ja recebe o signal por argumento e o repassa a cada faixa. " +
      "Desde 2026-08-03 este e o unico call site LME sem builder: o caminho de render da " +
      "ficha passou a usar uma previa que e query direta com .abortSignal(signal), e este " +
      "call site serve apenas /api/candidato-profile/[slug]/legislacao-executivo, fora do render.",
  },
]

interface CallSite {
  label: string
  line: number
  receivesSignal: boolean
  chainsAbortSignal: boolean
  buildsQuery: boolean
  allowlisted: boolean
  motivo?: string
}

interface Violation {
  kind: "sem-abort-signal" | "allowlist-obsoleta" | "allowlist-orfa"
  label: string
  line: number | null
  detalhe: string
}

function collectCallSites(sourceFile: ts.SourceFile): CallSite[] {
  const sites: CallSite[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isRetryCallee(node.expression)) {
      sites.push(describeCallSite(node, sourceFile))
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return sites
}

function isRetryCallee(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) return expression.text === RETRY_FN
  // Cobre um eventual `api.withSupabaseRetry(...)` sem precisar de novo audit.
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === RETRY_FN
  return false
}

function describeCallSite(node: ts.CallExpression, sourceFile: ts.SourceFile): CallSite {
  const [labelArg, runArg] = node.arguments
  const label = labelArg ? labelArg.getText(sourceFile) : "<sem label>"
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

  const allow = NOT_DIRECT_QUERY_ALLOWLIST.find((entry) => entry.label === label)

  const isCallback =
    runArg !== undefined && (ts.isArrowFunction(runArg) || ts.isFunctionExpression(runArg))

  return {
    label,
    line,
    receivesSignal: isCallback ? runArg.parameters.length > 0 : false,
    chainsAbortSignal: runArg ? containsAbortSignalCall(runArg) : false,
    buildsQuery: runArg ? containsSupabaseFromCall(runArg) : false,
    allowlisted: allow !== undefined,
    motivo: allow?.motivo,
  }
}

/** Procura `<algo>.abortSignal(...)` em qualquer profundidade do callback. */
function containsAbortSignalCall(node: ts.Node): boolean {
  let found = false
  const visit = (current: ts.Node): void => {
    if (found) return
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "abortSignal"
    ) {
      found = true
      return
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

/**
 * Query PostgREST direta sempre comeca num `<client>.from(...)` dentro do proprio
 * callback. E isto que distingue o call site convertivel do que so delega para um
 * helper e adapta o resultado.
 */
function containsSupabaseFromCall(node: ts.Node): boolean {
  let found = false
  const visit = (current: ts.Node): void => {
    if (found) return
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "from"
    ) {
      found = true
      return
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

function findViolations(sites: CallSite[]): Violation[] {
  const violations: Violation[] = []

  for (const site of sites) {
    if (site.allowlisted) {
      if (site.buildsQuery) {
        violations.push({
          kind: "allowlist-obsoleta",
          label: site.label,
          line: site.line,
          detalhe:
            "Call site allowlistado voltou a montar query direta (`.from(...)` no callback). " +
            "Propague o signal e remova a entrada da allowlist.",
        })
      }
      continue
    }

    if (!site.buildsQuery) {
      violations.push({
        kind: "sem-abort-signal",
        label: site.label,
        line: site.line,
        detalhe:
          "Callback nao monta query direta e nao esta na allowlist. Converta para query " +
          "direta ou adicione a allowlist com o motivo escrito.",
      })
      continue
    }

    if (!site.receivesSignal || !site.chainsAbortSignal) {
      const faltando = [
        site.receivesSignal ? null : "callback nao declara o parametro do signal",
        site.chainsAbortSignal ? null : "query nao encadeia .abortSignal(signal)",
      ].filter((item): item is string => item !== null)
      violations.push({
        kind: "sem-abort-signal",
        label: site.label,
        line: site.line,
        detalhe: `Query direta sem propagacao: ${faltando.join("; ")}.`,
      })
    }
  }

  for (const entry of NOT_DIRECT_QUERY_ALLOWLIST) {
    if (!sites.some((site) => site.label === entry.label)) {
      violations.push({
        kind: "allowlist-orfa",
        label: entry.label,
        line: null,
        detalhe: "Entrada da allowlist nao corresponde a nenhum call site. Remova a entrada.",
      })
    }
  }

  return violations
}

function render(sites: CallSite[], violations: Violation[], filePath: string): string {
  const lines: string[] = []
  lines.push(`Auditoria de abortSignal em ${filePath}`)
  lines.push(`Call sites de ${RETRY_FN}: ${sites.length}`)
  lines.push("")

  const propagados = sites.filter((s) => !s.allowlisted && s.receivesSignal && s.chainsAbortSignal)
  const pendentes = sites.filter(
    (s) => !s.allowlisted && !(s.receivesSignal && s.chainsAbortSignal)
  )
  const isentos = sites.filter((s) => s.allowlisted)

  lines.push(`OK (query direta com signal propagado): ${propagados.length}`)
  for (const site of propagados) {
    lines.push(`  L${String(site.line).padStart(4)}  ${site.label}`)
  }

  lines.push("")
  lines.push(`Allowlist (nao e query direta): ${isentos.length}`)
  for (const site of isentos) {
    lines.push(`  L${String(site.line).padStart(4)}  ${site.label}`)
    lines.push(`         motivo: ${site.motivo}`)
  }

  if (pendentes.length > 0) {
    lines.push("")
    lines.push(`PENDENTES: ${pendentes.length}`)
    for (const site of pendentes) {
      lines.push(
        `  L${String(site.line).padStart(4)}  ${site.label}  ` +
          `[signal=${site.receivesSignal} abortSignal=${site.chainsAbortSignal} from=${site.buildsQuery}]`
      )
    }
  }

  lines.push("")
  if (violations.length === 0) {
    lines.push("RESULTADO: OK, nenhuma query direta sem abortSignal.")
  } else {
    lines.push(`RESULTADO: ${violations.length} problema(s).`)
    for (const violation of violations) {
      const local = violation.line === null ? "allowlist" : `L${violation.line}`
      lines.push(`  [${violation.kind}] ${local} ${violation.label}`)
      lines.push(`      ${violation.detalhe}`)
    }
  }

  return lines.join("\n")
}

export function auditSupabaseAbortSignal(source: string, fileName = TARGET_FILE): {
  sites: CallSite[]
  violations: Violation[]
} {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const sites = collectCallSites(sourceFile)
  return { sites, violations: findViolations(sites) }
}

function main(argv: string[]): number {
  const asJson = argv.includes("--json")
  const filePath = resolve(process.cwd(), TARGET_FILE)
  const source = readFileSync(filePath, "utf8")
  const { sites, violations } = auditSupabaseAbortSignal(source)

  if (asJson) {
    console.log(JSON.stringify({ file: relative(process.cwd(), filePath), sites, violations }, null, 2))
  } else {
    console.log(render(sites, violations, relative(process.cwd(), filePath)))
  }

  return violations.length === 0 ? 0 : 1
}

if (process.argv[1] && process.argv[1].endsWith("audit-supabase-abort-signal.ts")) {
  process.exitCode = main(process.argv.slice(2))
}
