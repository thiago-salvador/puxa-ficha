import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { spawnSync } from "node:child_process"
import test, { describe } from "node:test"

const ROOT = process.cwd()
const READBACK_DIR = join(ROOT, "supabase/readback")
const ROLLBACK_DIR = join(ROOT, "supabase/rollback")
const VERSIONS = [
  "20260809070000",
  "20260810085000",
  "20260810090000",
  "20260810090100",
  "20260810090200",
  "20260810093000",
  "20260810094000",
  "20260810120000",
  "20260810120500",
  "20260810120600",
  "20260810121000",
  "20260810122000",
  "20260810123000",
  "20260810124000",
  "20260811100000",
  "20260811100100",
  "20260811101000",
  "20260811101100",
  "20260811101200",
  "20260811102000",
  "20260811102100",
  "20260812123000",
  "20260812124000",
  "20260812125000",
] as const

function arquivoUnico(dir: string, prefixo: string, sufixo: string): string {
  const encontrados = readdirSync(dir).filter((nome) => nome.startsWith(`${prefixo}_`) && nome.endsWith(sufixo))
  assert.equal(encontrados.length, 1, `${prefixo}: esperado um ${sufixo}, encontrados ${encontrados}`)
  return join(dir, encontrados[0])
}

describe("readback operacional das migrations do release", () => {
  test("cada versão tem um SQL canônico, ledger exato e falha fechada", () => {
    assert.equal(new Set(VERSIONS).size, 24)
    for (const version of VERSIONS) {
      const path = arquivoUnico(READBACK_DIR, version, ".readback.sql")
      const sql = readFileSync(path, "utf8")
      assert.match(sql, new RegExp(`version\\s*=\\s*'${version}'`, "i"), basename(path))
      assert.match(sql, /RAISE EXCEPTION/i, `${version}: readback precisa abortar por divergencia`)
    }
  })

  test("wrappers judiciais reutilizam a verdade QA em vez de copiar o payload", () => {
    const judicial69 = readFileSync(arquivoUnico(READBACK_DIR, "20260810122000", ".readback.sql"), "utf8")
    const judicial66 = readFileSync(arquivoUnico(READBACK_DIR, "20260810123000", ".readback.sql"), "utf8")
    assert.match(judicial69, /\\ir .*proposta-69-21\/20260810122000_processos_curadoria_djen\.readback\.sql/)
    assert.match(judicial66, /\\ir .*proposta-66-25\/20260810123000_processos_curadoria_djen_66\.readback\.sql/)
    assert.doesNotMatch(judicial69, /7000047-10\.2021/)
    assert.doesNotMatch(judicial66, /0809670-90\.2026/)
  })

  test("093000 prova o payload integral na mesma conexão SQL", () => {
    const sql = readFileSync(arquivoUnico(READBACK_DIR, "20260810093000", ".readback.sql"), "utf8")
    assert.match(sql, /v_assinatura_payload/)
    assert.match(sql, /1ef5d709c5c70ac2ac3fd6a5270057f9/)
    assert.doesNotMatch(sql, /proxima_prova_obrigatoria/)
  })

  test("111010 usa assinatura binária independente da collation do cluster", () => {
    const sql = readFileSync(arquivoUnico(READBACK_DIR, "20260811101000", ".readback.sql"), "utf8")
    const generator = readFileSync(join(ROOT, "scripts/audit/gerar-migration-destaques-estados-residuais.ts"), "utf8")
    const harness = readFileSync(join(ROOT, "scripts/audit/provar-migration-destaques-estados-residuais-194.sh"), "utf8")
    for (const source of [sql, generator]) {
      assert.match(source, /order by l\.fonte collate "C", l\.alvo collate "C"/i)
      assert.match(source, /456ba86bfc5de2cc7a51714f4cef0f8c/)
      assert.match(source, /95cc5a76055102f6b8684ad33818d731/)
      assert.match(source, /20260811102100/)
    }
    assert.match(harness, /POSTGRES_INITDB_ARGS=.*--locale=C/)
    assert.doesNotMatch(sql, /4d9ea5e53b75c2c5adee04ab1472add8/)
  })

  test("120000 assina somente o schema criado, com ownership e acesso exatos", () => {
    const sql = readFileSync(arquivoUnico(READBACK_DIR, "20260810120000", ".readback.sql"), "utf8")
    assert.match(sql, /933e637cc9019772de2504fc9491e314/)
    assert.doesNotMatch(sql, /a\.attnum\|\|chr\(30\)/)
    assert.match(sql, /relowner FROM pg_class WHERE oid='public\.financiamento'::regclass/)
    assert.match(sql, /NOT relforcerowsecurity/)
    assert.match(sql, /aclexplode\(a\.attacl\)/)
    assert.match(sql, /count\(\*\) FROM pg_policy/)
    assert.match(sql, /version = '20260810121000'/)
    assert.match(sql, /THEN 94 ELSE 0 END/)
    assert.match(sql, /v_tabela_rows <> v_tabela_rows_esperadas/)
    assert.match(sql, /5f0c407b16814ae8204796628b83b32a/)
    assert.match(sql, /v_acl_funcoes_invalidos/)
  })

  test("121000 e judiciais recusam drift de todos os campos persistidos", () => {
    const financiamento = readFileSync(arquivoUnico(READBACK_DIR, "20260810121000", ".readback.sql"), "utf8")
    assert.match(financiamento, /l\.fonte IS DISTINCT FROM 'tse'/)
    assert.match(financiamento, /l\.escopo IS DISTINCT FROM 'candidato'/)
    assert.match(financiamento, /l\.natureza IS DISTINCT FROM 'coleta'/)
    assert.match(financiamento, /l\.detalhe IS DISTINCT FROM coalesce/)

    for (const version of ["20260810122000", "20260810123000"]) {
      const wrapper = readFileSync(arquivoUnico(READBACK_DIR, version, ".readback.sql"), "utf8")
      const include = wrapper.match(/\\ir\s+(.+)/)?.[1]
      assert.ok(include, `${version}: wrapper judicial sem include`)
      const payload = readFileSync(join(READBACK_DIR, include), "utf8")
      assert.match(payload, /WHERE \(a\.numero_cnj,[\s\S]*IS DISTINCT FROM[\s\S]*\(e\.numero_cnj,/)
    }
  })
})

describe("rollbacks executáveis e ledger", () => {
  test("os cinco rollbacks auditados removem o próprio ledger sem transação interna", () => {
    const versions = ["20260810090200", "20260810120000", "20260810121000", "20260811100000", "20260811100100"]
    for (const version of versions) {
      const sql = readFileSync(arquivoUnico(ROLLBACK_DIR, version, ".rollback.sql"), "utf8")
      assert.match(sql, new RegExp(`delete from supabase_migrations\\.schema_migrations[\\s\\S]*version\\s*=\\s*'${version}'`, "i"))
      assert.doesNotMatch(sql, /^\s*begin\s*;/im)
      assert.doesNotMatch(sql, /^\s*commit\s*;/im)
    }
  })

  test("rollback Câmara remove somente as 12 chaves inseridas pela forward", () => {
    const forward = readFileSync(arquivoUnico(join(ROOT, "supabase/migrations"), "20260810090200", ".sql"), "utf8")
    const rollback = readFileSync(arquivoUnico(ROLLBACK_DIR, "20260810090200", ".rollback.sql"), "utf8")
    const forwardIds = new Set(Array.from(forward.matchAll(/-- @write tabela=votacoes_chave ref=([0-9]+-[0-9]+)/g), (m) => m[1]))
    const rollbackIds = new Set(Array.from(rollback.matchAll(/'([0-9]+-[0-9]+)'/g), (m) => m[1]))
    assert.equal(forwardIds.size, 12)
    assert.deepEqual(rollbackIds, forwardIds)
    assert.ok(!rollbackIds.has("2143164-138"))
    assert.match(rollback, /v_votos_posteriores/)
    assert.match(rollback, /payload atual diverge da forward/i)
  })

  test("rollback estrutural 120000 recusa objetos e privilégios posteriores", () => {
    const rollback = readFileSync(arquivoUnico(ROLLBACK_DIR, "20260810120000", ".rollback.sql"), "utf8")
    assert.match(rollback, /933e637cc9019772de2504fc9491e314/)
    assert.match(rollback, /NOT relforcerowsecurity/)
    assert.match(rollback, /count\(\*\) FROM pg_policy/)
    assert.match(rollback, /aclexplode\(a\.attacl\)/)
    assert.match(rollback, /relowner FROM pg_class WHERE oid='public\.financiamento'::regclass/)
  })

  test("ordem reversa do Senado está explícita", () => {
    const rollback = readFileSync(arquivoUnico(ROLLBACK_DIR, "20260811100000", ".rollback.sql"), "utf8")
    assert.match(rollback, /execute antes o rollback 20260811100100/i)
    assert.match(rollback, /payload atual diverge da forward/i)
    assert.match(rollback, /assinatura_linhas/)
    assert.match(rollback, /assinatura_pares/)
  })
})

test("documento operacional põe deploy antes das coletas", () => {
  const doc = readFileSync(join(ROOT, "QA/2026-08-11-autorizacoes-release-pf-ajustes.md"), "utf8")
  const migrations = doc.indexOf("## 2. Aplicar as migrations")
  const deploy = doc.indexOf("## 3. Publicar o mesmo SHA")
  const coletas = doc.indexOf("## 4. Executar as duas coletas")
  const cron = doc.indexOf("## 5. Ativar o segundo ciclo")
  const readback = doc.indexOf("## 6. Readback público")
  assert.ok(migrations >= 0 && migrations < deploy && deploy < coletas && coletas < cron && cron < readback)
  assert.match(doc, /origin\/main[\s\S]*não\s+suporta o input `sancoes`/)
  assert.match(doc, /não uma restauração integral/)
  assert.match(doc, /scripts\/audit\/readback-release-pf-ajustes\.sh/)
  assert.match(doc, /PF_DATABASE_URL/)
  assert.match(doc, /imediatamente depois do commit transacional da migration e antes[\s\S]*de iniciar a próxima/)
})

test("runner aceita exatamente uma versão conhecida por execução", () => {
  const runner = join(ROOT, "scripts/audit/readback-release-pf-ajustes.sh")
  const run = (...args: string[]) => spawnSync("bash", [runner, ...args], {
    cwd: ROOT,
    env: { ...process.env, PF_DATABASE_URL: "postgresql://invalido/readback" },
    encoding: "utf8",
  })

  for (const args of [[], ["20260810085000", "20260810085000"], ["invalida"], ["20990101000000"]]) {
    const result = run(...args)
    assert.equal(result.status, 2, `runner deveria recusar argumentos: ${args.join(",")}`)
  }
})

test("CI observa e executa o gate PG17 das migrations do release", () => {
  const workflow = readFileSync(join(ROOT, ".github/workflows/replay-migrations.yml"), "utf8")
  const gate = readFileSync(join(ROOT, "scripts/audit/provar-release-pf-ajustes-pg17.sh"), "utf8")
  assert.match(workflow, /supabase\/readback\/\*\*/)
  assert.match(workflow, /scripts\/audit\/provar-\*\.sh/)
  assert.match(workflow, /bash scripts\/audit\/provar-release-pf-ajustes-pg17\.sh/)
  for (const script of [
    "provar-migration-b2.sh",
    "provar-migration-trilha-a.sh",
    "provar-despublicacao-votacoes.sh",
    "provar-migration-patrimonio-rerun.sh",
    "provar-migration-daciolo.sh",
    "provar-migration-financiamento-acl-exato.sh",
    "provar-migration-financiamento-funcoes-acl-exato.sh",
    "provar-financiamento-universo.sh",
    "provar-migration-processos-curadoria-69.sh",
    "provar-migration-processos-curadoria-66.sh",
    "provar-migration-destaques-trajetoria-tse-8.sh",
    "provar-votacoes-senado-exatas.sh",
    "provar-migration-destaques-estados-residuais-194.sh",
    "provar-migration-historico-fontes-oficiais-cadu-cappelli.sh",
    "provar-migration-processos-legados-fontes-oficiais.sh",
  ]) {
    assert.match(gate, new RegExp(`scripts/audit/${script.replaceAll(".", "\\.")}`))
  }
})
