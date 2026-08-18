import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import {
  gerarMigrationSql,
  normalizarIdentificadorNumerico,
  resolverIdentidades,
  separarCoberturaPatrimonio,
  type BemPatrimonioTse,
  type CandidatoPublicavel,
  type LinhaConsultaCand,
} from "../scripts/lib/patrimonio-nacional-2026"

const publicavel = (
  slug: string,
  partial: Partial<CandidatoPublicavel> = {},
): CandidatoPublicavel => ({
  slug,
  cpf: null,
  cargo_disputado: "Governador",
  estado: "SP",
  ...partial,
})

const consulta = (
  sq: string,
  partial: Partial<LinhaConsultaCand> = {},
): LinhaConsultaCand => ({
  sq,
  cpf: "12345678901",
  cargo: "GOVERNADOR",
  uf: "SP",
  geracao: "15/08/2026 19:30:51",
  ...partial,
})

describe("P-PATRIMONIO-NACIONAL identidade", () => {
  test("normaliza zeros perdidos em SQ e CPF nos dois lados", () => {
    assert.equal(normalizarIdentificadorNumerico("000.123-00"), "12300")
    assert.equal(normalizarIdentificadorNumerico("000000"), "")
    assert.equal(normalizarIdentificadorNumerico(null), "")
  })

  test("resolve somente por SQ conhecido ou CPF exato, nunca por nome", () => {
    const candidatos = [
      publicavel("sq-seguro", { cpf: "00123456789" }),
      publicavel("cpf-seguro", { cpf: "00987654321" }),
      publicavel("cpf-divergente", { cpf: "00111111111" }),
      publicavel("cpf-ambiguo", { cpf: "00222222222" }),
      publicavel("sem-chave"),
      publicavel("uf-divergente", { cpf: "00333333333" }),
    ]
    const linhas = [
      consulta("00042", { cpf: "00123456789" }),
      consulta("00043", { cpf: "00987654321" }),
      consulta("00044", { cpf: "00999999999" }),
      consulta("00045", { cpf: "00222222222" }),
      consulta("00046", { cpf: "00222222222" }),
      consulta("00047", { cpf: "00333333333", uf: "RJ" }),
    ]
    const ancoras = new Map([
      ["sq-seguro", { sq: "42", origem: "seed_sq" as const }],
      ["cpf-divergente", { sq: "44", origem: "seed_sq" as const }],
    ])

    const resultado = resolverIdentidades(candidatos, linhas, ancoras)

    assert.deepEqual(
      resultado.resolvidos.map(({ slug, sq, rota }) => ({ slug, sq, rota })),
      [
        { slug: "sq-seguro", sq: "42", rota: "seed_sq" },
        { slug: "cpf-seguro", sq: "43", rota: "cpf_consulta" },
      ],
    )
    assert.deepEqual(
      Object.fromEntries(resultado.excluidos.map(({ slug, motivo }) => [slug, motivo])),
      {
        "cpf-divergente": "cpf_mismatch",
        "cpf-ambiguo": "ambiguous_anchor",
        "sem-chave": "no_sq_or_cpf",
        "uf-divergente": "cpf_not_found_or_scope_mismatch",
      },
    )
  })
})

describe("P-PATRIMONIO-NACIONAL carga positiva", () => {
  const resolvidos = [
    {
      slug: "novo-com-bens",
      sq: "101",
      cargo: "Governador",
      uf: "SP",
      rota: "cpf_consulta" as const,
      geracaoConsulta: "15/08/2026 19:30:51",
    },
    {
      slug: "ja-carregado",
      sq: "102",
      cargo: "Governador",
      uf: "RJ",
      rota: "seed_sq" as const,
      geracaoConsulta: "15/08/2026 19:30:51",
    },
    {
      slug: "sem-declaracao",
      sq: "103",
      cargo: "Governador",
      uf: "MG",
      rota: "seed_sq" as const,
      geracaoConsulta: "15/08/2026 19:30:51",
    },
  ]
  const bens: BemPatrimonioTse[] = [
    {
      sq: "101",
      sourceKey: "SP",
      ordem: "1",
      tipo: "Apartamento",
      descricao: "Bem 1",
      valorCentavos: 100_00,
      geracao: "15/08/2026 19:30:07",
    },
    {
      sq: "102",
      sourceKey: "RJ",
      ordem: "1",
      tipo: "Veículo",
      descricao: "Bem 2",
      valorCentavos: 200_00,
      geracao: "15/08/2026 19:30:07",
    },
  ]

  test("separa positivos, ausência transitória e precedente já carregado", () => {
    const cobertura = separarCoberturaPatrimonio(
      resolvidos,
      bens,
      new Set(["ja-carregado"]),
    )

    assert.equal(cobertura.positivos.length, 2)
    assert.deepEqual(cobertura.semDeclaracao.map((c) => c.slug), ["sem-declaracao"])
    assert.deepEqual(cobertura.paraCarregar.map((c) => c.slug), ["novo-com-bens"])
    assert.equal(cobertura.paraCarregar[0]?.totalCentavos, 100_00)
  })

  test("gera upsert idempotente só para 2026, sem fabricar ausência", () => {
    const cobertura = separarCoberturaPatrimonio(
      resolvidos,
      bens,
      new Set(["ja-carregado"]),
    )
    const sql = gerarMigrationSql(cobertura.paraCarregar, {
      snapshot: "2026-08-15 19:35 BRT",
      geracaoCsv: "15/08/2026 19:30:07",
      fonteUrl: "https://example.test/bem.zip",
      zipSha256: "a".repeat(64),
    })

    assert.match(sql, /INSERT INTO public\.patrimonio AS p/)
    assert.match(sql, /ON CONFLICT \(candidato_id, ano_eleicao\) DO UPDATE/)
    assert.match(
      sql,
      /SELECT COUNT\(\*\)\s+FROM public\.candidatos[\s\S]+?\) = 1/,
      "cada upsert depende da coorte completa para replay parcial ser no-op",
    )
    assert.match(
      sql,
      /WHERE \(p\.valor_total, p\.bens, p\.fonte\)[\s\S]+?IS DISTINCT FROM/,
      "replay byte-estável não deve reescrever payload idêntico",
    )
    assert.match(sql, /ano_eleicao = 2026/)
    assert.match(sql, /c\.publicavel = true/)
    assert.match(sql, /c\.status <> 'removido'/)
    assert.match(sql, /-- @write tabela=patrimonio slug=novo-com-bens ano=2026/)
    assert.doesNotMatch(sql, /patrimonio_ausencia_oficial/)
    assert.doesNotMatch(sql, /ja-carregado|sem-declaracao/)
  })
})

describe("P-PATRIMONIO-NACIONAL artefatos medidos", () => {
  const root = process.cwd()
  const receiptText = readFileSync(
    join(root, "scripts/audit/recibo-patrimonio-nacional-20260816.json"),
    "utf8",
  )
  const receipt = JSON.parse(receiptText)
  const allowlist = JSON.parse(
    readFileSync(
      join(root, "scripts/audit/allowlist-patrimonio-nacional-20260816.json"),
      "utf8",
    ),
  )
  const migration = readFileSync(
    join(root, "supabase/migrations/20260816055200_backfill_patrimonio_nacional_2026.sql"),
    "utf8",
  )
  const report = readFileSync(
    join(root, "QA/2026-08-16-patrimonio-nacional-2026.md"),
    "utf8",
  )

  test("congela a medição nacional e as listas nominais", () => {
    assert.deepEqual(receipt.totais, {
      fichasPublicas: 174,
      identidadesResolvidas: 132,
      identidadesExcluidas: 42,
      declaracoesPositivas: 117,
      semDeclaracao: 15,
      jaCarregadasPr203: 9,
      linhasMigration: 108,
      bensMigration: 996,
    })
    assert.equal(receipt.excluidos.length, 42)
    assert.equal(receipt.semDeclaracao.length, 15)
    assert.equal(receipt.migration.length, 108)
    assert.equal(receiptText.includes('"cpf"'), false, "o recibo versionado não vaza CPF")
  })

  test("allowlist e migration têm exatamente os mesmos 108 slugs", () => {
    const migrationSlugs = [
      ...migration.matchAll(/-- @write tabela=patrimonio slug=([^ ]+) ano=2026/g),
    ].map((match) => match[1])
    assert.deepEqual(migrationSlugs, allowlist.coorte)
    assert.equal(allowlist.entries.length, 108)
    assert.equal((migration.match(/INSERT INTO public\.patrimonio AS p/g) ?? []).length, 108)
    assert.equal((migration.match(/ON CONFLICT \(candidato_id, ano_eleicao\)/g) ?? []).length, 108)
    assert.doesNotMatch(migration, /patrimonio_ausencia_oficial/)
  })

  test("corrige o roteamento de Renan sem reutilizar o par inválido do PR #203", () => {
    const renanSantos = receipt.migration.find(
      (candidate: { slug: string }) => candidate.slug === "renan-santos",
    )
    const renanFilho = receipt.excluidos.find(
      (candidate: { slug: string }) => candidate.slug === "renan-filho",
    )
    assert.equal(renanSantos?.sq, "280002540694")
    assert.equal(renanSantos?.rota, "pr203_sq")
    assert.equal(renanFilho?.motivo, "cpf_not_found_or_scope_mismatch")
    assert.match(report, /Divergência herdada do PR #203/)
  })
})
