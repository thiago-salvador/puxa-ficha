import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const SNAPSHOT = join(ROOT, "data", "chapas-2026-tse-20260815.json")
const INITIAL_SNAPSHOT = join(ROOT, "data", "chapas-2026-tse-20260812.json")
const SCHEMA_MIGRATION = join(
  ROOT,
  "supabase",
  "migrations",
  "20260813040000_chapas_2026_schema.sql",
)
const DATA_MIGRATION = join(
  ROOT,
  "supabase",
  "migrations",
  "20260816011000_chapas_2026_tse_pos_registro.sql",
)
const INITIAL_DATA_MIGRATION = join(
  ROOT,
  "supabase",
  "migrations",
  "20260813040100_chapas_2026_tse_snapshot.sql",
)
const SCHEMA_ROLLBACK = join(
  ROOT,
  "supabase",
  "rollback",
  "20260813040000_chapas_2026_schema.rollback.sql",
)
const DATA_ROLLBACK = join(
  ROOT,
  "supabase",
  "rollback",
  "20260816011000_chapas_2026_tse_pos_registro.rollback.sql",
)
const INITIAL_DATA_ROLLBACK = join(
  ROOT,
  "supabase",
  "rollback",
  "20260813040100_chapas_2026_tse_snapshot.rollback.sql",
)
const SCHEMA_READBACK = join(
  ROOT,
  "supabase",
  "readback",
  "20260813040000_chapas_2026_schema.readback.sql",
)
const DATA_READBACK = join(
  ROOT,
  "supabase",
  "readback",
  "20260816011000_chapas_2026_tse_pos_registro.readback.sql",
)
const INITIAL_DATA_READBACK = join(
  ROOT,
  "supabase",
  "readback",
  "20260813040100_chapas_2026_tse_snapshot.readback.sql",
)

interface ChapaSnapshot {
  metadata: {
    source_sha256: string
    source_last_modified: string
    source_catalog_url: string
    extracted_at: string
    total_chapas: number
    total_presidenciais: number
    total_estaduais: number
    titulares_novos: number
    titulares_confirmados: number
    titulares_revisao_identidade: number
    titulares_duplicidade_oficial: number
  }
  chapas: Array<{
    chave: string
    eleicao_codigo: string
    uf: string | null
    cargo_titular: "Presidente" | "Governador"
    sq_coligacao: string | null
    identidade_status: "confirmada" | "duplicidade_oficial"
    titular: {
      sq_candidato: string | null
      nome_completo: string
      nome_urna: string
      partido_sigla: string
      genero?: string
      formacao?: string
      estado_civil?: string
      cor_raca?: string
      profissao_declarada?: string
      perfil_slug: string | null
      perfil_slug_proposto?: string
      vinculo_perfil_status:
        | "confirmado"
        | "revisao_identidade"
        | "duplicidade_oficial"
        | "novo_perfil_oficial"
    }
    vice: {
      sq_candidato: string | null
      nome_completo: string
      nome_urna: string
      partido_sigla: string
    }
    alternativas_oficiais?: Array<{
      sq_coligacao: string
      titular_sq_candidato: string
      vice_sq_candidato: string
    }>
  }>
}

function snapshot(): ChapaSnapshot {
  assert.equal(existsSync(SNAPSHOT), true, "snapshot versionado ausente")
  return JSON.parse(readFileSync(SNAPSHOT, "utf8")) as ChapaSnapshot
}

function initialSnapshot(): ChapaSnapshot {
  return JSON.parse(readFileSync(INITIAL_SNAPSHOT, "utf8")) as ChapaSnapshot
}

function statements(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
}

describe("snapshot oficial das chapas de 2026", () => {
  test("preserva a fonte pós-registro de 15/08 e fecha 196 chapas lógicas", () => {
    const data = snapshot()
    assert.equal(
      data.metadata.source_sha256,
      "c3d13ae50f95024f43046acb4458a4420a620e86526fed665f9e60c8dc6068df",
    )
    assert.equal(data.metadata.source_last_modified, "Sat, 15 Aug 2026 19:35:53 GMT")
    assert.match(data.metadata.source_catalog_url, /^https:\/\/dadosabertos\.tse\.jus\.br\//)
    assert.match(data.metadata.extracted_at, /^2026-08-16T/)
    assert.equal(data.metadata.total_chapas, 196)
    assert.equal(data.metadata.total_presidenciais, 12)
    assert.equal(data.metadata.total_estaduais, 184)
    assert.equal(data.chapas.length, 196)
    assert.equal(new Set(data.chapas.map((row) => row.chave)).size, 196)
    assert.equal(data.metadata.titulares_novos, 12)
    assert.equal(data.metadata.titulares_confirmados, 146)
    assert.equal(data.metadata.titulares_revisao_identidade, 37)
    assert.equal(data.metadata.titulares_duplicidade_oficial, 1)

    const vinculados = data.chapas.filter((row) =>
      ["confirmado", "novo_perfil_oficial"].includes(row.titular.vinculo_perfil_status),
    )
    const inseguros = data.chapas.filter((row) =>
      ["revisao_identidade", "duplicidade_oficial"].includes(row.titular.vinculo_perfil_status),
    )
    assert.equal(vinculados.length, 158)
    assert.equal(new Set(vinculados.map((row) => row.titular.perfil_slug)).size, 158)
    assert.equal(inseguros.length, 38)
    assert.ok(inseguros.every((row) => row.titular.perfil_slug === null))
    assert.ok(inseguros.every((row) => Boolean(row.titular.perfil_slug_proposto)))
  })

  test("quarentena só a duplicidade real e preserva o vice vigente de Vivian", () => {
    const data = snapshot()
    const ambiguous = data.chapas.filter((row) => row.identidade_status === "duplicidade_oficial")
    assert.equal(ambiguous.length, 1)
    const row = ambiguous.find((item) => item.titular.nome_urna === "ELIZEU AGUIAR")
    assert.ok(row)
    assert.equal(row.uf, "PI")
    assert.equal(row.titular.nome_urna, "ELIZEU AGUIAR")
    assert.equal(row.vice.nome_urna, "ISMAR MARQUES")
    assert.equal(row.sq_coligacao, null)
    assert.equal(row.titular.sq_candidato, null)
    assert.equal(row.vice.sq_candidato, null)
    assert.equal(row.alternativas_oficiais?.length, 2)
    assert.equal(new Set(row.alternativas_oficiais?.map((item) => item.sq_coligacao)).size, 2)
    const vivian = data.chapas.find((item) => item.titular.nome_urna === "VIVIAN MENDES")
    assert.ok(vivian)
    assert.equal(vivian.identidade_status, "confirmada")
    assert.equal(vivian.titular.perfil_slug, "vivian-mendes")
    assert.equal(vivian.vice.sq_candidato, "250002552372")
    assert.equal(vivian.vice.nome_urna, "CRIS DAMASIO")
    assert.equal(vivian.alternativas_oficiais, undefined)
  })

  test("toda chapa sem ambiguidade tem titular, vice e chaves oficiais", () => {
    const confirmed = snapshot().chapas.filter((row) => row.identidade_status === "confirmada")
    assert.equal(confirmed.length, 195)
    for (const row of confirmed) {
      assert.match(row.sq_coligacao ?? "", /^\d+$/)
      assert.match(row.titular.sq_candidato ?? "", /^\d+$/)
      assert.match(row.vice.sq_candidato ?? "", /^\d+$/)
      assert.ok(row.titular.nome_completo)
      assert.ok(row.vice.nome_completo)
    }
  })
})

describe("contrato SQL das chapas de 2026", () => {
  test("migration, rollback e readback existem", () => {
    for (const path of [
      SCHEMA_MIGRATION,
      DATA_MIGRATION,
      SCHEMA_ROLLBACK,
      DATA_ROLLBACK,
      SCHEMA_READBACK,
      DATA_READBACK,
    ]) {
      assert.equal(existsSync(path), true, `${path} ausente`)
    }
  })

  test("a migration separa candidatura da pessoa e não expõe a tabela-base", () => {
    const sql = readFileSync(SCHEMA_MIGRATION, "utf8")
    assert.match(sql, /CREATE TABLE public\.chapas_2026/)
    assert.match(sql, /titular_candidato_id uuid REFERENCES public\.candidatos\(id\)/)
    assert.match(sql, /vice_candidato_id uuid REFERENCES public\.candidatos\(id\)/)
    assert.match(sql, /identidade_status text NOT NULL/)
    assert.match(sql, /vinculo_titular_status text NOT NULL/)
    assert.match(sql, /tse_situacao_codigo text NOT NULL/)
    assert.match(sql, /ALTER TABLE public\.chapas_2026 ENABLE ROW LEVEL SECURITY/)
    assert.match(sql, /REVOKE ALL ON TABLE public\.chapas_2026 FROM anon, authenticated/)
    assert.match(sql, /CREATE VIEW public\.chapas_2026_publico/)
    assert.match(sql, /WITH \(security_invoker = true\)/)
    assert.match(sql, /GRANT SELECT ON public\.chapas_2026_publico TO anon, authenticated/)
  })

  test("o payload tem 196 linhas e uma quarentena sem chave escolhida", () => {
    const sql = readFileSync(DATA_MIGRATION, "utf8")
    assert.match(sql, /esperava 196 chapas, encontrou %/)
    assert.match(sql, /confirmadas %, duplicadas %, vinculadas %, revisões %/)
    assert.match(sql, /ELIZEU AGUIAR/)
    assert.match(sql, /ISMAR MARQUES/)
    assert.match(sql, /VIVIAN MENDES/)
    assert.match(sql, /CRIS DAMASIO/)
  })

  test("nenhuma situação #NE é promovida a deferida ou aguardando julgamento", () => {
    const sql = readFileSync(DATA_MIGRATION, "utf8")
    assert.match(sql, /tse_situacao_codigo/)
    assert.match(sql, /'#NE'/)
    assert.doesNotMatch(statements(DATA_MIGRATION), /'deferido'|'aguardando julgamento'/i)
  })

  test("corrige as seis pessoas já existentes que mudaram de papel", () => {
    const sql = readFileSync(INITIAL_DATA_MIGRATION, "utf8")
    for (const slug of [
      "eduardo-girao",
      "luiz-carlos-teodoro",
      "rafael-greca",
      "francisco-dias",
      "geraldo-alckmin",
      "raquel-bricio",
    ]) {
      assert.match(sql, new RegExp(slug))
    }
    assert.match(sql, /'Vice-Presidente'/)
    assert.match(sql, /'Vice-Governador'/)
  })

  test("as 12 fichas novas preservam os cinco campos pessoais disponíveis no TSE", () => {
    const novos = initialSnapshot().chapas
      .map((row) => row.titular)
      .filter((titular) => titular.vinculo_perfil_status === "novo_perfil_oficial")
    assert.equal(novos.length, 12)
    for (const titular of novos) {
      for (const campo of [
        "genero",
        "formacao",
        "estado_civil",
        "cor_raca",
        "profissao_declarada",
      ] as const) {
        assert.ok(titular[campo]?.trim(), `${titular.perfil_slug}.${campo}`)
        assert.doesNotMatch(titular[campo] ?? "", /^#(?:NULO|NE)#?$/)
      }
    }

    const migration = readFileSync(INITIAL_DATA_MIGRATION, "utf8")
    assert.match(
      migration,
      /formacao,profissao_declarada,genero,estado_civil,cor_raca/,
    )
    assert.doesNotMatch(
      migration.match(/INSERT INTO public\.candidatos[\s\S]*?(?=UPDATE public\.candidatos)/)?.[0] ?? "",
      /naturalidade/,
      "UF de nascimento sozinha não prova naturalidade municipal",
    )
    assert.match(readFileSync(INITIAL_DATA_READBACK, "utf8"), /12 fichas têm payload integral/)
  })

  test("replay vazio é no-op e coorte parcial aborta antes de qualquer escrita", () => {
    const sql = readFileSync(INITIAL_DATA_MIGRATION, "utf8")
    assert.match(sql, /IF coorte_presente = 0 THEN[\s\S]*?RETURN;/)
    assert.match(sql, /IF NOT ledger_presente THEN[\s\S]*?replay linear sem ledger/)
    assert.match(sql, /esperava 6 papéis antigos exatos/)
    assert.doesNotMatch(sql, /SELECT id INTO ancora_replay/)
  })

  test("rollback e readback são fail-closed e tratam o ledger", () => {
    const rollback = readFileSync(INITIAL_DATA_ROLLBACK, "utf8")
    const readback = readFileSync(INITIAL_DATA_READBACK, "utf8")
    assert.match(rollback, /^BEGIN;/m)
    assert.match(rollback, /somente % das 12 fichas seguem idênticas à forward/)
    assert.match(rollback, /somente % dos 6 papéis seguem idênticos à forward/)
    assert.match(rollback, /payload de chapas diverge/)
    assert.match(rollback, /pg_constraint/)
    assert.match(rollback, /c\.biografia IS NULL/)
    assert.match(rollback, /c\.foto_url IS NULL/)
    assert.match(rollback, /c\.redes_sociais='\{\}'::jsonb/)
    assert.match(rollback, /c\.site_campanha IS NULL/)
    assert.match(readback, /c\.biografia IS NULL/)
    assert.match(rollback, /forward foi no-op de dados/)
    assert.match(rollback, /COMMIT;/)
    assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations/)
    assert.match(readback, /RAISE EXCEPTION/i)
    assert.match(readback, /payload de chapas diverge/)
    assert.match(readback, /SELECT \* FROM actual EXCEPT SELECT \* FROM expected/)
    assert.match(readback, /SELECT \* FROM expected EXCEPT SELECT \* FROM actual/)
    assert.match(readFileSync(SCHEMA_ROLLBACK, "utf8"), /chapas_2026 ainda contém dados/)
    assert.match(readFileSync(SCHEMA_READBACK, "utf8"), /RLS\/FORCE RLS ausente/)
  })
})

describe("superfície pública das chapas de 2026", () => {
  test("o tipo público representa Vice-Presidente e uma chapa vinculada", () => {
    const types = readFileSync(join(ROOT, "src", "lib", "types.ts"), "utf8")
    assert.match(types, /\| 'Vice-Presidente'/)
    assert.match(types, /export interface Chapa2026/)
    assert.match(types, /chapa_2026\?: Chapa2026 \| null/)
  })

  test("o loader lê a view pública sem derrubar a ficha se ela ainda não existir", () => {
    const api = readFileSync(join(ROOT, "src", "lib", "api.ts"), "utf8")
    assert.match(api, /from\("chapas_2026_publico"\)/)
    assert.doesNotMatch(api, /from\("chapas_2026_publico"\)\s*\.select\("\*"\)/)
    assert.match(api, /fetchChapa2026/)
    assert.match(api, /chapa_2026:/)
    assert.match(api, /chapas-tse-20260815/)
    assert.match(api, /PGRST205/)
    assert.match(api, /if \(error\) throw new Error\(`chapas_2026_publico:/)
  })

  test("todos os caches que dependem do universo recebem o mesmo bust", () => {
    const api = readFileSync(join(ROOT, "src", "lib", "api.ts"), "utf8")
    for (const head of [
      "public-candidatos-resource",
      "public-candidato-nav-resource",
      "global-search-index",
      "public-candidato-slugs-static",
      "public-candidato-metadata-resource",
      "public-candidatos-resumo-resource",
      "public-candidatos-comparaveis-resource",
      "ranking-data-resource-public-copy-20260521",
      "quiz-alignment-dataset-resource",
    ]) {
      const cacheKey = api.match(new RegExp(`\\[\\s*"${head}"[^\\]]*\\]`))
      assert.ok(cacheKey, `cache ${head} não encontrado`)
      assert.match(cacheKey[0], /"chapas-tse-20260815"/, `cache ${head} sem bust da chapa`)
    }
  })

  test("a API expõe a composição e o HTML SSR destaca somente o vice", () => {
    const dto = readFileSync(join(ROOT, "src", "lib", "public-profile-dto.ts"), "utf8")
    const view = readFileSync(
      join(ROOT, "src", "app", "(site)", "candidato", "[slug]", "CandidatoFichaView.tsx"),
      "utf8",
    )
    assert.match(dto, /chapa_2026: ficha\.chapa_2026 \?\? null/)
    assert.match(view, /data-pf-chapa-2026/)
    assert.match(view, /data-pf-chapa-vice/)
    assert.match(view, /data-pf-chapa-parceiro/)
    assert.match(view, /chapaViceEhAtual/)
    assert.match(view, /Vice:\{" "\}/)
    assert.match(view, /data-pf-chapa-identidade/)
    assert.doesNotMatch(view, /data-pf-chapa-titular/)
    assert.doesNotMatch(view, /Chapa registrada no snapshot do TSE/)
    assert.doesNotMatch(view, /data-pf-chapa-snapshot/)
  })
})
