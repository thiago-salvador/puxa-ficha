import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

const manifestPath = "QA/evidencias/2026-08-10-financiamento-universo/manifesto-235.json"
const migrationPath =
  "supabase/migrations/20260810121000_financiamento_reconciliado_universo.sql"
const rollbackPath =
  "supabase/rollback/20260810121000_financiamento_reconciliado_universo.rollback.sql"
const readbackPath =
  "supabase/readback/20260810121000_financiamento_reconciliado_universo.readback.sql"
const publicReadbackPath = "scripts/audit/readback-financiamento-universo.ts"
const manifestGeneratorPath = "scripts/audit/gerar-manifesto-financiamento-universo.ts"
const sqlGeneratorPath = "scripts/audit/gerar-sql-financiamento-universo.ts"

type Target = {
  slug: string
  ano_eleicao: number
  resultado: "publicado" | "zero_declarado" | "ausencia_oficial" | "erro"
  sq_candidato: string | null
  uf_candidatura: string | null
  total_arrecadado?: number
  fonte_url: string
  detalhe?: string
}

test("manifesto fecha os 235 pleitos sem coleta, sem duplicar identidade", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    universo: { fichas: number; pleitos: number; antes_nao_coletado: number; fichas_afetadas: number }
    targets: Target[]
  }
  assert.deepEqual(manifest.universo, {
    fichas: 194,
    pleitos: 722,
    antes_nao_coletado: 235,
    fichas_afetadas: 107,
  })
  assert.equal(manifest.targets.length, 235)
  assert.equal(new Set(manifest.targets.map((row) => `${row.slug}:${row.ano_eleicao}`)).size, 235)
  assert.ok(manifest.targets.every((row) => row.resultado !== ("nao_coletado" as string)))
  for (const row of manifest.targets) {
    assert.ok(row.fonte_url.startsWith("https://"))
    if (row.resultado !== "erro") {
      assert.ok(row.sq_candidato, `${row.slug}/${row.ano_eleicao}: SQ`)
      assert.match(row.uf_candidatura ?? "", /^[A-Z]{2}$/)
    } else {
      assert.ok(row.detalhe, `${row.slug}/${row.ano_eleicao}: erro explícito`)
    }
  }
})

test("decompõe os 37 erros sem confundir ano 2004 com causa", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { targets: Target[] }
  const erros = manifest.targets.filter((row) => row.resultado === "erro")
  const layout2004 = erros.filter(
    (row) => row.detalhe === "Financiamento 2004: SQ_CANDIDATO ausente no layout oficial",
  )
  const identidade = erros.filter((row) =>
    row.detalhe?.startsWith("Identidade oficial nao comprovada de forma unica"),
  )

  assert.equal(erros.length, 37)
  assert.equal(layout2004.length, 19)
  assert.equal(identidade.length, 18)
  assert.equal(layout2004.length + identidade.length, erros.length)
})

test("regressões nomeadas e uma amostra adversarial usam ano, UF e SQ", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    targets: Target[]
    regressoes: Target[]
  }
  const { targets, regressoes } = manifest
  const get = (slug: string, ano: number) =>
    [...targets, ...regressoes].find((row) => row.slug === slug && row.ano_eleicao === ano)
  assert.deepEqual(
    [get("cabo-daciolo", 2006)?.total_arrecadado, get("cabo-daciolo", 2008)?.total_arrecadado],
    [1259.44, 720],
  )
  assert.equal(get("cabo-daciolo", 2008)?.uf_candidatura, "RJ")
  assert.equal(get("cabo-daciolo", 2008)?.sq_candidato, "14144")
  assert.equal(get("flavio-bolsonaro", 2002)?.total_arrecadado, 5988)
  assert.equal(get("rui-costa-pimenta", 2006)?.total_arrecadado, 11000)
  const adversarial = targets.find(
    (row) =>
      row.resultado === "publicado" &&
      !["cabo-daciolo", "flavio-bolsonaro", "rui-costa-pimenta"].includes(row.slug),
  )
  assert.ok(adversarial)
  assert.ok(adversarial.sq_candidato)
  assert.match(adversarial.uf_candidatura ?? "", /^[A-Z]{2}$/)
})

test("forward, rollback e readback fecham a mesma coorte", () => {
  const migration = readFileSync(migrationPath, "utf8")
  const rollback = readFileSync(rollbackPath, "utf8")
  const readback = readFileSync(readbackPath, "utf8")
  assert.match(migration, /esperado 235/)
  assert.match(migration, /resultado IN \('publicado', 'zero_declarado', 'ausencia_oficial', 'erro'\)/)
  assert.match(migration, /ON CONFLICT \(candidato_id, ano_eleicao\)/)
  assert.match(migration, /pf-ajustes-financiamento-20260810/)
  assert.doesNotMatch(migration, /cpf_hash|\bcpf\b/i)
  assert.match(rollback, /pf-ajustes-financiamento-20260810/)
  assert.match(rollback, /RAISE EXCEPTION/)
  assert.match(readback, /nao_coletado/)
  assert.match(readback, /235/)
  assert.match(readback, /v_payload_mismatch/)
  assert.match(readback, /f\.sq_candidato IS DISTINCT FROM a\.sq_candidato/)
  assert.match(readback, /f\.maiores_doadores IS DISTINCT FROM/)
  assert.match(readback, /v\.fonte_url IS DISTINCT FROM a\.fonte_url/)
  assert.match(readback, /l\.url IS DISTINCT FROM a\.fonte_url/)
  assert.match(readback, /candidato_id uuid/)
  assert.match(readback, /20260811102100/)
  assert.match(readback, /47a1de10-1cf7-47f8-837b-dbbf94480421/)
  assert.match(readback, /c\.nome_completo = a\.nome_completo/)
  assert.match(readback, /c\.nome_urna = a\.nome_urna/)
  assert.doesNotMatch(migration, /\bBEGIN\s*;/)
  assert.doesNotMatch(migration, /\bCOMMIT\s*;/)
  assert.doesNotMatch(rollback, /\bBEGIN\s*;/)
  assert.doesNotMatch(rollback, /\bCOMMIT\s*;/)
})

test("gerador reproduz byte a byte o readback temporal endurecido", () => {
  const generated = execFileSync(
    process.execPath,
    ["--import", "tsx", sqlGeneratorPath, "--tipo=readback"],
    { encoding: "utf8" },
  )
  assert.equal(generated, readFileSync(readbackPath, "utf8"))
})

test("readback publico falha fechado e prova API e DOM reais", () => {
  const source = readFileSync(publicReadbackPath, "utf8")
  assert.match(source, /readback publico exige --public-url/)
  assert.match(source, /financiamento_verificacoes_publico/)
  assert.doesNotMatch(source, /contratoPersistidoDisponivel|MoneyTabSection|renderToStaticMarkup/)
  assert.match(source, /\/api\/candidato-profile\//)
  assert.match(source, /sourceStatus !== "live"/)
  assert.match(source, /chromium\.launch/)
  assert.match(source, /#profile-tab-dinheiro/)
  assert.match(source, /data-pf-financiamento-eleicao-estado/)
  assert.match(source, /payload\.data\?\.financiamento/)
  assert.match(source, /total_arrecadado/)
  assert.match(source, /maiores_doadores/)
  assert.match(source, /categorias_origem/)
  assert.match(source, /buildFinancingComposition/)
  assert.match(source, /data-pf-financiamento-publicado/)
  assert.match(source, /data-pf-financiamento-total-visivel/)
  assert.match(source, /data-pf-financiamento-composicao-visivel/)
  assert.match(source, /data-pf-financiamento-doador-visivel/)
})

test("manifesto e regeneravel de snapshots versionados e valida hashes oficiais", () => {
  const source = readFileSync(manifestGeneratorPath, "utf8")
  assert.match(source, /financiamento-universo\/fontes/)
  assert.match(source, /pacotes-oficiais\.json/)
  assert.match(source, /createHash\("sha256"\)/)
  assert.match(source, /--verify-packages=/)
  assert.match(source, /sourcePackages\.length !== YEARS\.length/)
  assert.match(source, /argValue\("gaps", resolve\(EVIDENCE_DIR, "lacunas\.json"\)\)/)
})
