/**
 * Provas do baseline do re-run de patrimônio 2026 (bloqueio da Raiz, 10/08).
 *
 * O que cada grupo prova:
 *   1. Manifesto truncado, duplicado, com estado inválido ou com cardinalidade
 *      diferente da congelada REPROVA. O caso nomeado no bloqueio: 1/32 falha.
 *   2. A comparação é por composição normalizada: dois bens com valores
 *      trocados mantêm total e contagem e são detectados mesmo assim.
 *   3. O baseline extraído da migration real bate com a cardinalidade e com o
 *      manifesto versionado, o que amarra constante, migration e evidência.
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

import {
  aplicarDeltaManifesto2026,
  CARDINALIDADE_2026,
  carregarBaselineAplicado,
  composicoesIguais,
  extrairBaselineDaMigration,
  normalizarComposicao,
  validarManifesto2026,
  type Bem,
  type CelulaDeltaManifesto2026,
  type CelulaManifesto2026,
} from "../scripts/lib/rerun-patrimonio-baseline"

const MANIFESTO_EVIDENCIA =
  "QA/evidencias/2026-08-09-trilha-b/manifesto-patrimonio-20260807-nao-publicados.json"
const MANIFESTO_DELTA =
  "QA/evidencias/2026-08-10-migration-patrimonio-rerun/manifesto-delta-patrimonio-2026.json"

function celulasReais(): CelulaManifesto2026[] {
  const bruto = JSON.parse(readFileSync(resolve(MANIFESTO_EVIDENCIA), "utf8")) as {
    linhas: CelulaManifesto2026[]
  }
  const delta = JSON.parse(readFileSync(resolve(MANIFESTO_DELTA), "utf8")) as {
    linhas: CelulaDeltaManifesto2026[]
  }
  return aplicarDeltaManifesto2026(
    bruto.linhas.filter((linha) => linha.ano === 2026),
    delta.linhas,
  )
}

describe("validação do manifesto 2026 (fail-closed)", () => {
  it("o manifesto real versionado passa", () => {
    assert.doesNotThrow(() => validarManifesto2026(celulasReais()))
  })

  it("manifesto truncado em 1/32 REPROVA, com a cardinalidade na mensagem", () => {
    const truncado = celulasReais().slice(0, 1)
    assert.throws(
      () => validarManifesto2026(truncado),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.match(err.message, /REPROVADO/)
        assert.match(err.message, new RegExp(`esperadas exatamente ${CARDINALIDADE_2026.total}`))
        return true
      },
    )
  })

  it("SQ duplicado reprova, mesmo com a cardinalidade certa", () => {
    const celulas = celulasReais()
    const adulterado = [...celulas]
    // Duas células passam a apontar o mesmo SQ; total continua 32.
    adulterado[1] = { ...adulterado[1], sq: adulterado[0].sq }
    assert.throws(() => validarManifesto2026(adulterado), /aparece 2 vezes/)
  })

  it("estado fora do vocabulário reprova", () => {
    const celulas = celulasReais()
    const adulterado = [...celulas]
    adulterado[0] = { ...adulterado[0], estado: "publicado" as never }
    assert.throws(() => validarManifesto2026(adulterado), /fora do vocabulário/)
  })

  it("lacuna sem agregado esperado reprova (não há contra o que comparar)", () => {
    const celulas = celulasReais()
    const idx = celulas.findIndex((c) => c.estado === "lacuna_com_dados_tse")
    const adulterado = [...celulas]
    adulterado[idx] = { ...adulterado[idx], valor_total: null, n_bens: null }
    assert.throws(() => validarManifesto2026(adulterado), /sem valor_total|sem n_bens/)
  })

  it("proporção lacunas/ausências diferente da congelada reprova", () => {
    const celulas = celulasReais()
    const idx = celulas.findIndex((c) => c.estado === "ausencia_oficial")
    const adulterado = [...celulas]
    adulterado[idx] = {
      ...adulterado[idx],
      estado: "lacuna_com_dados_tse",
      valor_total: 1,
      n_bens: 1,
    }
    assert.throws(() => validarManifesto2026(adulterado), /esperadas exatamente/)
  })

  it("delta só troca SQ com predecessor explícito e não aceita adicionar duplicata", () => {
    const base = celulasReais()
    assert.throws(
      () =>
        aplicarDeltaManifesto2026(base, [
          {
            acao: "substituir",
            slug: "dr-luisinho",
            ano: 2026,
            sq: "999999999999",
            estado: "nao_coletado",
          },
        ]),
      /tentou trocar SQ/,
    )
    const baseAntesDaTroca = base.map((celula) =>
      celula.slug === "elizeu-aguiar"
        ? { ...celula, sq: "180002533958", bens_aplicados: undefined }
        : celula,
    )
    const substituido = aplicarDeltaManifesto2026(baseAntesDaTroca, [
      {
        acao: "substituir",
        slug: "elizeu-aguiar",
        ano: 2026,
        sq_anterior: "180002533958",
        sq: "180002549920",
        estado: "lacuna_com_dados_tse",
        valor_total: 1592808,
        n_bens: 3,
        bens_aplicados: [
          { tipo: "Terreno", descricao: "UM TERRENO", valor: 40000 },
          { tipo: "Veículo", descricao: "VEÍCULO TOYOTA COROLLA", valor: 802808 },
          { tipo: "Casa", descricao: "UMA CASA RESIDENCIAL", valor: 750000 },
        ],
      },
    ])
    assert.equal(substituido.find((c) => c.slug === "elizeu-aguiar")?.sq, "180002549920")
    assert.throws(
      () =>
        aplicarDeltaManifesto2026(base, [
          {
            acao: "adicionar",
            slug: "jose-estevao",
            ano: 2026,
            sq: "50002536579",
            estado: "nao_coletado",
          },
        ]),
      /ja existe/,
    )
  })
})

describe("comparação por composição normalizada", () => {
  const bens: Bem[] = [
    { tipo: "Apartamento", descricao: "Apto em Salvador", valor: 500000 },
    { tipo: "Veículo", descricao: "Carro 2020", valor: 80000 },
  ]

  it("mesma composição em ordem diferente é igual", () => {
    assert.equal(composicoesIguais(bens, [bens[1], bens[0]]), true)
  })

  it("valores TROCADOS entre bens são detectados, apesar de total e contagem iguais", () => {
    const trocados: Bem[] = [
      { tipo: "Apartamento", descricao: "Apto em Salvador", valor: 80000 },
      { tipo: "Veículo", descricao: "Carro 2020", valor: 500000 },
    ]
    const totalA = bens.reduce((a, b) => a + b.valor, 0)
    const totalB = trocados.reduce((a, b) => a + b.valor, 0)
    assert.equal(totalA, totalB, "premissa do caso: totais idênticos")
    assert.equal(bens.length, trocados.length, "premissa do caso: contagens idênticas")
    // O agregado não vê; a composição vê.
    assert.equal(composicoesIguais(bens, trocados), false)
  })

  it("descrição alterada é detectada", () => {
    const editado: Bem[] = [bens[0], { ...bens[1], descricao: "Carro 2021" }]
    assert.equal(composicoesIguais(bens, editado), false)
  })

  it("centavos contam: 1 centavo de diferença muda a composição", () => {
    const umCentavo: Bem[] = [bens[0], { ...bens[1], valor: 80000.01 }]
    assert.equal(composicoesIguais(bens, umCentavo), false)
  })

  it("normalização é estável para comparação de conjuntos", () => {
    assert.deepEqual(normalizarComposicao(bens), normalizarComposicao([...bens].reverse()))
  })
})

describe("baseline consolidado das migrations aplicadas", () => {
  it("a migration real produz exatamente as lacunas congeladas, com bens não vazios", () => {
    const baseline = carregarBaselineAplicado(process.cwd(), celulasReais())
    assert.ok(baseline.size >= CARDINALIDADE_2026.lacunas)
    for (const [slug, aplicado] of baseline) {
      assert.ok(aplicado.bens.length > 0, `${slug} sem bens no baseline`)
      const soma = Math.round(aplicado.bens.reduce((a, b) => a + b.valor, 0) * 100) / 100
      assert.ok(
        Math.abs(soma - aplicado.valor_total) <= 0.01,
        `${slug}: soma dos bens (${soma}) difere do valor_total da migration (${aplicado.valor_total})`,
      )
    }
  })

  it("o baseline consolidado fica restrito ao manifesto e cobre todas as lacunas", () => {
    const baseline = carregarBaselineAplicado(process.cwd(), celulasReais())
    const slugsManifesto = new Set(celulasReais().map((c) => c.slug))
    const lacunasManifesto = celulasReais()
      .filter((c) => c.estado === "lacuna_com_dados_tse")
      .map((c) => c.slug)
    assert.equal([...baseline.keys()].every((slug) => slugsManifesto.has(slug)), true)
    assert.equal(lacunasManifesto.every((slug) => baseline.has(slug)), true)
  })

  it("sobrepõe Elizeu pelo SQ e composição corrigidos em 31/08", () => {
    const aplicado = carregarBaselineAplicado(process.cwd(), celulasReais()).get("elizeu-aguiar")
    assert.equal(aplicado?.valor_total, 1592808)
    assert.equal(aplicado?.bens.length, 3)
    assert.equal(aplicado?.bens.find((bem) => bem.descricao === "VEÍCULO TOYOTA COROLLA")?.valor, 802808)
  })

  it("bloco sem SELECT parseável derruba, em vez de virar baseline parcial", () => {
    const sqlQuebrado =
      "-- @write tabela=patrimonio slug=fulano campos=x\nINSERT INTO public.patrimonio (...)\n-- sem SELECT no formato"
    assert.throws(() => extrairBaselineDaMigration(sqlQuebrado), /sem SELECT no formato esperado/)
  })
})
