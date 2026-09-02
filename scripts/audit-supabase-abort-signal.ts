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
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

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

/**
 * Segunda varredura, fora de `src/lib/api.ts`: toda cadeia PostgREST direta
 * (`<client>.from("tabela").<verbo>(...)...` ou `<client>.rpc("fn", ...)`) nas
 * rotas e libs precisa encadear `.abortSignal(...)`, normalmente com
 * `supabaseQueryTimeoutSignal()` de `src/lib/supabase-retry.ts`.
 *
 * Aqui nao ha `withSupabaseRetry` para dar o signal: rotas de alertas,
 * analytics, quiz, retencao e crons chamam o PostgREST direto, e uma conexao
 * pendurada segurava o slot do semaforo ate o `maxDuration` da funcao. O
 * codigo foi convertido em 2026-09-02; este gate impede que uma query nova
 * volte a nascer sem prazo.
 */
const DIRECT_QUERY_DIRS = ["src/lib", "src/app"]
const DIRECT_QUERY_VERBS = new Set(["select", "insert", "update", "upsert", "delete"])
/** Objetos cujo `.from(` nao e PostgREST. */
const NOT_A_CLIENT = /^(Buffer|Array|Uint8Array|Promise|Set|Map|Object|String|Number|Date|Response)$/

export interface DirectQueryChain {
  file: string
  line: number
  head: string
  chainsAbortSignal: boolean
}

/**
 * Cadeias que recebem o prazo por outro caminho. Mesma regra da allowlist de
 * cima: motivo escrito, e entrada sem cadeia correspondente e violacao.
 */
const DIRECT_QUERY_ALLOWLIST: ReadonlyArray<{ file: string; head: string; motivo: string }> = [
  {
    file: "src/lib/doador-reverse.ts",
    head: "caller.rpc(search_financiamento_by_doador_normalized)",
    motivo:
      "`caller` e um DoadorReverseRpcCaller injetavel (testes passam um objeto com rpc " +
      "que devolve Promise). O prazo entra no caller real, `realRpcCaller()`, que encadeia " +
      ".abortSignal(supabaseQueryTimeoutSignal()) no cliente do Supabase antes de devolver.",
  },
]

function chainRoot(node: ts.Node): ts.Node {
  let current: ts.Node = node
  for (;;) {
    const parent = current.parent
    if (!parent) return current
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current) {
      current = parent
      continue
    }
    if (ts.isCallExpression(parent) && parent.expression === current) {
      current = parent
      continue
    }
    return current
  }
}

function insideRetryCallback(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (ts.isCallExpression(current) && isRetryCallee(current.expression)) return true
    current = current.parent
  }
  return false
}

export function auditDirectQueryChains(source: string, fileName: string): DirectQueryChain[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const chains: DirectQueryChain[] = []
  const seen = new Set<number>()

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text
      const objectText = node.expression.expression.getText(sourceFile)
      const firstArg = node.arguments[0]
      const literalArg = firstArg !== undefined && ts.isStringLiteral(firstArg)
      const isFrom = name === "from" && node.arguments.length === 1 && literalArg
      const isRpc = name === "rpc" && literalArg
      if ((isFrom || isRpc) && !NOT_A_CLIENT.test(objectText) && !insideRetryCallback(node)) {
        const root = chainRoot(node)
        if (!seen.has(root.pos)) {
          seen.add(root.pos)
          const rootText = root.getText(sourceFile)
          // `from(...)` sem verbo (builder guardado numa variavel) nao e cadeia
          // completa aqui; o verbo aparece em outro lugar e sera visto la.
          const hasVerb = isRpc || [...DIRECT_QUERY_VERBS].some((verb) => rootText.includes(`.${verb}(`))
          if (hasVerb) {
            chains.push({
              file: fileName,
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              head: `${objectText}.${name}(${firstArg.text})`,
              chainsAbortSignal: rootText.includes(".abortSignal("),
            })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return chains
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listSourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function auditDirectQueriesInRepo(): DirectQueryChain[] {
  const target = resolve(process.cwd(), TARGET_FILE)
  const chains: DirectQueryChain[] = []
  for (const dir of DIRECT_QUERY_DIRS) {
    for (const file of listSourceFiles(resolve(process.cwd(), dir))) {
      if (file === target) continue
      const source = readFileSync(file, "utf8")
      if (!source.includes(".from(") && !source.includes(".rpc(")) continue
      chains.push(...auditDirectQueryChains(source, relative(process.cwd(), file)))
    }
  }
  return chains
}

function isDirectAllowlisted(chain: DirectQueryChain): boolean {
  return DIRECT_QUERY_ALLOWLIST.some((entry) => entry.file === chain.file && entry.head === chain.head)
}

/** Cadeias sem prazo que nao estao na allowlist, mais entradas orfas da allowlist. */
export function findDirectViolations(chains: DirectQueryChain[]): string[] {
  const violations = chains
    .filter((chain) => !chain.chainsAbortSignal && !isDirectAllowlisted(chain))
    .map((chain) => `${chain.file}:${chain.line}  ${chain.head}`)
  for (const entry of DIRECT_QUERY_ALLOWLIST) {
    if (!chains.some((chain) => chain.file === entry.file && chain.head === entry.head)) {
      violations.push(`allowlist orfa: ${entry.file}  ${entry.head} (remova a entrada)`)
    }
  }
  return violations
}

function renderDirect(chains: DirectQueryChain[], violations: string[]): string {
  const allowlisted = chains.filter((chain) => !chain.chainsAbortSignal && isDirectAllowlisted(chain))
  const lines: string[] = []
  lines.push("")
  lines.push(`Queries PostgREST diretas fora de ${TARGET_FILE}: ${chains.length}`)
  lines.push(`Com .abortSignal(): ${chains.filter((chain) => chain.chainsAbortSignal).length}`)
  lines.push(`Allowlist (prazo por outro caminho): ${allowlisted.length}`)
  for (const chain of allowlisted) {
    const entry = DIRECT_QUERY_ALLOWLIST.find((item) => item.file === chain.file && item.head === chain.head)
    lines.push(`  ${chain.file}:${chain.line}  ${chain.head}`)
    lines.push(`         motivo: ${entry?.motivo}`)
  }
  if (violations.length > 0) {
    lines.push(`SEM .abortSignal(): ${violations.length}`)
    for (const violation of violations) lines.push(`  ${violation}`)
    lines.push(
      "  Encadeie .abortSignal(supabaseQueryTimeoutSignal()) depois do verbo (select/insert/update/upsert/delete) ou do rpc."
    )
  }
  return lines.join("\n")
}

function main(argv: string[]): number {
  const asJson = argv.includes("--json")
  const filePath = resolve(process.cwd(), TARGET_FILE)
  const source = readFileSync(filePath, "utf8")
  const { sites, violations } = auditSupabaseAbortSignal(source)
  const direct = auditDirectQueriesInRepo()
  const directViolations = findDirectViolations(direct)

  if (asJson) {
    console.log(
      JSON.stringify(
        { file: relative(process.cwd(), filePath), sites, violations, direct, directViolations },
        null,
        2
      )
    )
  } else {
    console.log(render(sites, violations, relative(process.cwd(), filePath)))
    console.log(renderDirect(direct, directViolations))
  }

  return violations.length === 0 && directViolations.length === 0 ? 0 : 1
}

if (process.argv[1] && process.argv[1].endsWith("audit-supabase-abort-signal.ts")) {
  process.exitCode = main(process.argv.slice(2))
}
