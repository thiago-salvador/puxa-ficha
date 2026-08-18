import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const SNAPSHOT = join(ROOT, "data", "chapas-2026-tse-20260815.json")
const OLD_SNAPSHOT = join(ROOT, "data", "chapas-2026-tse-20260812.json")
const GENERATOR = join(ROOT, "scripts", "gerar-chapas-2026-pos-registro.ts")
const MIGRATION = join(
  ROOT,
  "supabase",
  "migrations",
  "20260816011000_chapas_2026_tse_pos_registro.sql",
)
const ROLLBACK = join(
  ROOT,
  "supabase",
  "rollback",
  "20260816011000_chapas_2026_tse_pos_registro.rollback.sql",
)
const READBACK = join(
  ROOT,
  "supabase",
  "readback",
  "20260816011000_chapas_2026_tse_pos_registro.readback.sql",
)
const PLAN = join(ROOT, "docs", "plans", "2026-08-16-ac-pos-registro.md")

interface PessoaChapa {
  sq_candidato: string | null
  nome_completo: string
  nome_urna: string
  partido_sigla: string
  perfil_slug: string | null
  perfil_slug_proposto?: string
  vinculo_perfil_status: string
}

interface Chapa {
  chave: string
  uf: string | null
  cargo_titular: "Presidente" | "Governador"
  sq_coligacao: string | null
  identidade_status: "confirmada" | "duplicidade_oficial"
  tse_situacao_codigo: string
  titular: PessoaChapa
  vice: PessoaChapa
  alternativas_oficiais?: Array<{
    sq_coligacao: string
    titular_sq_candidato: string
    vice_sq_candidato: string
  }>
}

interface Snapshot {
  metadata: {
    source_sha256: string
    source_last_modified: string
    source_generated_at: string
    extracted_at: string
    total_chapas: number
    total_presidenciais: number
    total_estaduais: number
    titulares_confirmados: number
    titulares_novos: number
    titulares_revisao_identidade: number
    titulares_duplicidade_oficial: number
    situacao_publica: string
    privacy_note: string
    desaparecidas_desde_20260812: string[]
  }
  chapas: Chapa[]
}

function load(path: string): Snapshot {
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot
}

describe("snapshot pós-registro das chapas de 2026", () => {
  test("entrega artefatos reproduzíveis e fecha o universo oficial", () => {
    for (const path of [SNAPSHOT, GENERATOR, MIGRATION, ROLLBACK, READBACK]) {
      assert.equal(existsSync(path), true, `${path} ausente`)
    }
    const data = load(SNAPSHOT)
    assert.equal(
      data.metadata.source_sha256,
      "c3d13ae50f95024f43046acb4458a4420a620e86526fed665f9e60c8dc6068df",
    )
    assert.equal(data.metadata.source_last_modified, "Sat, 15 Aug 2026 19:35:53 GMT")
    assert.equal(data.metadata.source_generated_at, "15/08/2026 16:30:10")
    assert.match(data.metadata.extracted_at, /^2026-08-16T/)
    assert.equal(data.metadata.total_chapas, 196)
    assert.equal(data.metadata.total_presidenciais, 12)
    assert.equal(data.metadata.total_estaduais, 184)
    assert.equal(data.metadata.titulares_duplicidade_oficial, 1)
    assert.equal(data.chapas.length, 196)
    assert.equal(new Set(data.chapas.map((row) => row.chave)).size, 196)
    assert.equal(data.metadata.situacao_publica, "registrada_aguardando_julgamento")
    assert.deepEqual(data.metadata.desaparecidas_desde_20260812, [])
  })

  test("preserva os 134 registros anteriores sem promover identidade incerta", () => {
    const atual = load(SNAPSHOT)
    const anterior = load(OLD_SNAPSHOT)
    const sqsAtuais = new Set(
      atual.chapas.flatMap((row) => [row.titular.sq_candidato, row.vice.sq_candidato]),
    )
    const chavesAtuais = new Set(atual.chapas.map((row) => row.chave))
    const ausentes = anterior.chapas.filter(
      (row) =>
        !chavesAtuais.has(row.chave) &&
        !row.alternativas_oficiais?.some((item) => sqsAtuais.has(item.titular_sq_candidato)),
    )
    assert.deepEqual(ausentes.map((row) => row.chave), [])
    assert.equal(
      atual.chapas.some(
        (row) =>
          row.titular.perfil_slug === "leonardo-avalanche" ||
          row.titular.perfil_slug_proposto === "leonardo-avalanche" ||
          /LEONARDO AVALANCHE/i.test(row.titular.nome_urna),
      ),
      false,
    )
    assert.ok(
      atual.chapas
        .filter((row) => row.titular.vinculo_perfil_status === "revisao_identidade")
        .every((row) => row.titular.perfil_slug === null),
    )
  })

  test("resolve o vice vigente de Vivian e quarentena só a duplicidade real de Elizeu", () => {
    const data = load(SNAPSHOT)
    assert.ok(data.chapas.every((row) => row.tse_situacao_codigo === "#NE"))
    const ambiguas = data.chapas.filter((row) => row.identidade_status === "duplicidade_oficial")
    assert.equal(ambiguas.length, 1)
    assert.deepEqual(ambiguas.map((row) => row.titular.nome_urna), ["ELIZEU AGUIAR"])
    assert.ok(
      ambiguas.every(
        (row) =>
          row.sq_coligacao === null &&
          row.titular.sq_candidato === null &&
          row.vice.sq_candidato === null &&
          row.alternativas_oficiais?.length === 2,
      ),
    )

    const vivian = data.chapas.find((row) => row.titular.nome_urna === "VIVIAN MENDES")
    assert.ok(vivian)
    assert.equal(vivian.identidade_status, "confirmada")
    assert.equal(vivian.sq_coligacao, "250001800766")
    assert.equal(vivian.titular.sq_candidato, "250002544912")
    assert.equal(vivian.titular.perfil_slug, "vivian-mendes")
    assert.equal(vivian.titular.vinculo_perfil_status, "confirmado")
    assert.equal(vivian.vice.sq_candidato, "250002552372")
    assert.equal(vivian.vice.nome_urna, "CRIS DAMASIO")
    assert.equal(vivian.alternativas_oficiais, undefined)
  })

  test("plano usa somente caminhos relativos ao repositório", () => {
    const plan = readFileSync(PLAN, "utf8")
    assert.doesNotMatch(plan, /\/Users\//)
    assert.match(plan, /puxafichatemporario\/logs\/execucao\.jsonl/)
  })

  test("não versiona campos pessoais sensíveis do CSV", () => {
    const parsed = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as unknown
    const keys: string[] = []
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(visit)
      if (!value || typeof value !== "object") return
      for (const [key, child] of Object.entries(value)) {
        keys.push(key)
        visit(child)
      }
    }
    visit(parsed)
    assert.doesNotMatch(keys.join("\n"), /cpf|titulo_eleitoral|e-?mail/i)
    assert.match(load(SNAPSHOT).metadata.privacy_note, /não são versionados/i)
  })

  test("migration, rollback e readback fecham hash, contagem e ausência de Leonardo", () => {
    const migration = readFileSync(MIGRATION, "utf8")
    const rollback = readFileSync(ROLLBACK, "utf8")
    const readback = readFileSync(READBACK, "utf8")
    assert.match(migration, /esperava 196 chapas, encontrou %/)
    assert.match(migration, /c3d13ae50f95024f43046acb4458a4420a620e86526fed665f9e60c8dc6068df/)
    assert.match(migration, /current_setting\('pf\.chapas_pos_registro_apply',true\)/)
    assert.doesNotMatch(migration, /^BEGIN;|^COMMIT;/m)
    assert.match(rollback, /686fe1717dd0b860d714f878bf3d75a388478ebab2a56a2f963e6bba50ff0ce7/)
    assert.match(readback, /registrada, aguardando julgamento/)
    assert.match(readback, /duplicadas <> 1/)
    assert.match(readback, /leonardo-avalanche/)
  })
})
