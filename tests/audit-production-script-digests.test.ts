import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const auditDir = join(root, "scripts/audit")
const migrationsDir = join(root, "supabase/migrations")

/**
 * Os runners de produção comparam o ledger remoto com o digest da migration
 * predecessora. Quando esse digest é uma constante no script, um caractere a
 * menos só aparece na hora do apply, depois de o workflow já ter aberto a
 * conexão. Este teste faz a mesma conta localmente: formato exato e hash do
 * arquivo que a constante representa.
 */
const SCRIPT_PATTERN = /^(apply|rollback)-.+-production\.sh$/
// Valor com `$` é calculado em runtime (`sha256:$(shasum ...)`, `sha256:${hash}`) e fica fora.
const DIGEST_ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)=["']?(sha256:[^"'\s$]*)["']?\s*$/gm
const DIGEST_FORMAT = /^sha256:[0-9a-f]{64}$/
const MIGRATION_REFERENCE = /supabase\/migrations\/\$\{([A-Za-z_][A-Za-z0-9_]*)\}_([a-z0-9_]+)\.sql/g

type Script = { name: string; source: string }

function productionScripts(): Script[] {
  return readdirSync(auditDir)
    .filter((name) => SCRIPT_PATTERN.test(name))
    .sort()
    .map((name) => ({ name, source: readFileSync(join(auditDir, name), "utf8") }))
}

function sha256Of(path: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`
}

/** Primeiro `nome=AAAAMMDDHHMMSS` declarado no topo do script. */
function declaredVersion(source: string, variable: string): string | undefined {
  const match = source.match(new RegExp(`^\\s*${variable}=["']?(\\d{14})["']?\\s*$`, "m"))
  return match?.[1]
}

/** `previous_digest` pertence a `previous_version`; `digest` pertence a `version`. */
function versionVariableFor(digestVariable: string): string {
  return digestVariable.replace(/digest$/i, (suffix) => (suffix === "DIGEST" ? "VERSION" : "version"))
}

/**
 * Resolve a migration que o digest representa: primeiro pelo nome que o
 * próprio script usa para aquela versão, depois pelo único arquivo com o
 * prefixo da versão em supabase/migrations/.
 */
function resolveMigration(source: string, versionVariable: string, version: string): { path?: string; problem?: string } {
  for (const match of source.matchAll(MIGRATION_REFERENCE)) {
    if (match[1] === versionVariable) {
      const file = `${version}_${match[2]}.sql`
      const path = join(migrationsDir, file)
      return existsSync(path) ? { path } : { problem: `supabase/migrations/${file} não existe` }
    }
  }
  const candidates = readdirSync(migrationsDir).filter((file) => file.startsWith(`${version}_`) && file.endsWith(".sql"))
  if (candidates.length === 1) return { path: join(migrationsDir, candidates[0]) }
  if (candidates.length === 0) return { problem: `nenhuma migration ${version}_*.sql em supabase/migrations/` }
  return { problem: `mais de uma migration ${version}_*.sql: ${candidates.join(", ")}` }
}

test("digests fixos nos runners de produção têm formato sha256 exato e batem com a migration", () => {
  const scripts = productionScripts()
  assert.ok(scripts.length > 0, "nenhum runner de produção encontrado em scripts/audit/")

  const failures: string[] = []
  let checked = 0
  for (const { name, source } of scripts) {
    for (const [, variable, literal] of source.matchAll(DIGEST_ASSIGNMENT)) {
      checked += 1
      const versionVariable = versionVariableFor(variable)
      const version = declaredVersion(source, versionVariable)
      if (!version) {
        failures.push(`${name}: ${variable} fixo sem ${versionVariable}=AAAAMMDDHHMMSS para localizar a migration`)
        continue
      }
      const resolved = resolveMigration(source, versionVariable, version)
      if (!resolved.path) {
        failures.push(`${name}: ${variable} aponta para ${version}, mas ${resolved.problem}`)
        continue
      }
      const expected = sha256Of(resolved.path)
      const file = resolved.path.slice(root.length + 1)
      if (!DIGEST_FORMAT.test(literal)) {
        const hexLength = literal.slice("sha256:".length).length
        failures.push(`${name}: ${variable} não é sha256: + 64 hex minúsculos (tem ${hexLength}); esperado ${expected} (${file})`)
      } else if (literal !== expected) {
        failures.push(`${name}: ${variable}=${literal} diverge de ${file}; esperado ${expected}`)
      }
    }
  }

  assert.ok(checked > 0, "nenhum digest fixo encontrado; o padrão de busca pode ter ficado desatualizado")
  assert.deepEqual(failures, [], `\n${failures.join("\n")}`)
})

test("migrations referenciadas pelos runners de produção existem", () => {
  const failures: string[] = []
  for (const { name, source } of productionScripts()) {
    for (const [reference, variable, slug] of source.matchAll(MIGRATION_REFERENCE)) {
      const version = declaredVersion(source, variable)
      if (!version) continue
      const file = `${version}_${slug}.sql`
      if (!existsSync(join(migrationsDir, file))) {
        failures.push(`${name}: ${reference} resolve para supabase/migrations/${file}, que não existe`)
      }
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join("\n")}`)
})
