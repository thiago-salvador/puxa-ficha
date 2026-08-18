/**
 * Gate: o ledger do banco e `supabase/migrations/` continuam descrevendo a
 * mesma história? (2026-08-08)
 *
 * Este script NÃO abre conexão. Ele lê a lista de versões aplicadas de um
 * arquivo ou da stdin, e compara com os nomes de arquivo do repositório usando
 * a função pura de `lib/ledger-guard.ts`. Quem fala com o Postgres é
 * `.github/workflows/ledger-guard.yml`, via psql, do mesmo jeito que o
 * backup-db.yml. Separar assim é o que torna o invariante testável sem
 * credencial: `tests/ledger-guard.test.ts` exercita as três regras sem banco.
 *
 * Uso:
 *   psql "$SUPABASE_DB_URL" -Atq \
 *     -c 'select version from supabase_migrations.schema_migrations order by version' \
 *     > ledger.txt
 *   tsx scripts/audit/check-ledger-vs-repo.ts --remotas=ledger.txt
 *
 *   # ou por stdin
 *   psql ... | tsx scripts/audit/check-ledger-vs-repo.ts
 *
 * Sai != 0 em qualquer violação. Sai != 0 também se a lista remota vier vazia
 * ou malformada: um psql que falhou e devolveu zero linha faria TODO arquivo
 * local parecer migration futura, e o gate passaria verde justamente quando
 * está cego.
 */

import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { compararLedgerComRepo } from "./lib/ledger-guard"

const RAIZ = process.cwd()
const MIGRATIONS = join(RAIZ, "supabase", "migrations")

function lerEntrada(caminho: string | undefined): string {
  if (caminho) return readFileSync(resolve(RAIZ, caminho), "utf8")
  try {
    return readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

/** Aceita uma versão por linha. Linha fora do formato é erro, nunca descarte. */
export function parsearVersoesRemotas(bruto: string): string[] {
  const linhas = bruto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const invalidas = linhas.filter((l) => !/^\d{14}$/.test(l))
  if (invalidas.length) {
    throw new Error(
      `lista remota malformada: ${invalidas.length} linha(s) fora do formato de 14 dígitos, a primeira é ${JSON.stringify(invalidas[0])}. ` +
        "Isso normalmente é saída de psql com cabeçalho ou mensagem de erro; use -Atq.",
    )
  }
  if (!linhas.length) {
    throw new Error(
      "lista remota vazia. O ledger de produção nunca está vazio, então isto é falha de conexão ou query, não ausência de migrations. " +
        "Passar adiante faria todo arquivo local parecer pendente e o gate passaria cego.",
    )
  }
  return linhas
}

function main(): void {
  const argv = process.argv.slice(2)
  const flag = argv.find((a) => a.startsWith("--remotas="))
  const caminho = flag ? flag.slice("--remotas=".length) : undefined

  let remotas: string[]
  try {
    remotas = parsearVersoesRemotas(lerEntrada(caminho))
  } catch (e) {
    // Sem stack: a mensagem é a informação, e isto roda em log de CI.
    console.error(`FAIL ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }

  const locais = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))

  const r = compararLedgerComRepo(remotas, locais)

  console.error(
    `[ledger] ${remotas.length} versão(ões) no ledger (topo ${r.topoDoLedger}), ${locais.length} arquivo(s) no repo`,
  )
  for (const nome of r.pendentesFuturas) {
    console.error(`  pendente (R3, ok) ${nome}`)
  }
  for (const nome of r.retidasIgnoradas) {
    console.error(`  retida deliberada (R2 dispensada) ${nome}`)
  }

  if (r.violacoes.length) {
    console.error(`\n${r.violacoes.length} violação(ões):`)
    for (const v of r.violacoes) {
      console.error(`  FAIL ${v.regra} ${v.arquivo ?? v.versao}: ${v.detalhe}`)
    }
    console.error(
      "\nR1 se corrige trazendo a migration aplicada de volta para o repo com o nome da versão do ledger.",
    )
    console.error(
      "R2 se corrige aplicando a migration, renomeando-a para a versão com que foi aplicada, ou registrando a retenção na allowlist de RETIDAS_PADRAO.",
    )
    process.exit(1)
  }

  console.error("\nOK: ledger e repositório contam a mesma história.")
}

if (import.meta.filename === process.argv[1]) {
  main()
}
