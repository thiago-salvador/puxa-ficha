import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { gastoParlamentarExibivel } from "../src/lib/public-profile-dto"

/**
 * A cota da Câmara saiu do ar em 17/08 porque não reproduz na fonte oficial.
 *
 * O controle positivo falhou: o recibo de 16/08 registra `jhc 2019` com 355 documentos e
 * R$ 351.517,43; o `Ano-2019.csv.zip` do dia seguinte dá 140 documentos e R$ 221.848,77 para o
 * mesmo `ideCadastro`. Das 13 linhas de 2019 no banco, nenhuma reproduz por nenhuma das três
 * bases de agregação plausíveis, e o banco é sempre maior.
 *
 * Estes testes mantêm as linhas legadas bloqueadas e só reabrem uma linha quando o
 * snapshot oficial e seu controle independente estão presentes.
 */
describe("cota parlamentar: o que pode ir ao ar", () => {
  test("bloqueia todos os rótulos de origem Câmara que existem em produção", () => {
    // Os quatro rótulos medidos no banco em 17/08, com a contagem de linhas de cada um.
    const rotulosEmProducao = [
      "Camara", // 20 linhas, casadas por nome, o defeito original
      "Camara CEAP CSV", // 138 linhas, casadas por ID, e mesmo assim não reproduzem
      "Cota Parlamentar/Camara dadosabertos (onda-p-20260814)", // 6 linhas
      "Câmara (jan/2023) + Senado CEAPS (fev-dez/2023)", // 1 linha, mista: sai também
    ]
    for (const fonte of rotulosEmProducao) {
      assert.equal(gastoParlamentarExibivel(fonte), false, `deveria bloquear: ${fonte}`)
    }
  })

  test("não confia na acentuação nem na caixa do rótulo", () => {
    for (const fonte of ["câmara", "CÂMARA", "camara", "CAMARA", "Camara CEAP CSV"]) {
      assert.equal(gastoParlamentarExibivel(fonte), false, `deveria bloquear: ${fonte}`)
    }
  })

  test("mantém o Senado no ar, que é outra fonte e não foi contestada", () => {
    const senado = [
      "Senado CEAPS", // 101 linhas
      "CEAPS/Senado", // 4 linhas
      "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_2023.csv",
      "Senado CEAPS | https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_2024.csv",
    ]
    for (const fonte of senado) {
      assert.equal(gastoParlamentarExibivel(fonte), true, `deveria exibir: ${fonte}`)
    }
  })

  test("mantém consultas individuais da Transparência fora do total parlamentar", () => {
    for (const fonte of [
      "Portal da Transparência — cartões por portador",
      "Portal da Transparência — viagens por CPF",
      "Portal da Transparência — contratos por CPF",
    ]) {
      assert.equal(gastoParlamentarExibivel(fonte), false)
    }
  })

  test("libera somente linha Câmara com snapshot e controle independente", () => {
    const valid = {
      categorias: [],
      proveniencia: {
        controle_independente: true,
        fonte_url: "https://dadosabertos.camara.leg.br/api/v2/deputados/123/despesas",
        id_camara: 123,
        consulta_paginas: 2,
        consulta_snapshot_sha256: "a".repeat(64),
      },
    }
    assert.equal(gastoParlamentarExibivel("Cota Parlamentar/Camara dadosabertos", valid), true)
    assert.equal(gastoParlamentarExibivel("Cota Parlamentar/Camara dadosabertos", { ...valid, proveniencia: { ...valid.proveniencia, controle_independente: false } }), false)
    assert.equal(gastoParlamentarExibivel("Cota Parlamentar/Camara dadosabertos", { ...valid, proveniencia: { ...valid.proveniencia, fonte_url: "https://example.test/despesas" } }), false)
  })

  test("libera CSV oficial apenas com escopo anual completo, hash e totais coerentes", () => {
    const years = Array.from({ length: 19 }, (_, index) => index + 2008)
    const revisions = years.map((year) => ({
      year,
      url: `https://www.camara.leg.br/cotas/Ano-${year}.csv.zip`,
      sha256: `${year}`.padStart(64, "a"),
    }))
    const valid = {
      categorias: [{ categoria: "PASSAGENS", valor: 100 }],
      proveniencia: {
        tipo: "camara-cota-csv",
        identity_field: "ideCadastro",
        id_camara: 123,
        ano: 2024,
        source_rows: 2,
        source_revisions: revisions,
        scope_complete: true,
        years,
      },
    }
    assert.equal(gastoParlamentarExibivel("Camara", valid, 2024, 100), true)
    assert.equal(gastoParlamentarExibivel("Camara", valid, 2023, 100), false)
    assert.equal(gastoParlamentarExibivel("Camara", valid, 2024, 101), false)
    const badRevision = revisions.map((revision, index) => index === 4 ? { ...revision, sha256: "bad" } : revision)
    assert.equal(gastoParlamentarExibivel("Camara", {
      ...valid,
      proveniencia: { ...valid.proveniencia, source_revisions: badRevision },
    }, 2024, 100), false)
    assert.equal(gastoParlamentarExibivel("Camara", {
      ...valid,
      proveniencia: { ...valid.proveniencia, scope_complete: false },
    }, 2024, 100), false)

    const partialCurrentYear = {
      ...valid,
      proveniencia: {
        ...valid.proveniencia,
        scope_complete: false,
        complete_years: years.filter((year) => year !== 2026),
        partial_years: [2026],
      },
    }
    assert.equal(gastoParlamentarExibivel("Camara", partialCurrentYear, 2024, 100), true)
    assert.equal(gastoParlamentarExibivel("Camara", {
      ...partialCurrentYear,
      proveniencia: { ...partialCurrentYear.proveniencia, ano: 2026 },
    }, 2026, 100), true)
    assert.equal(gastoParlamentarExibivel("Camara", {
      ...partialCurrentYear,
      proveniencia: { ...partialCurrentYear.proveniencia, ano: 2026 },
    }, 2025, 100), false)
    const estorno = {
      ...partialCurrentYear,
      categorias: [{ categoria: "Estorno", valor: -30 }],
    }
    assert.equal(gastoParlamentarExibivel("Camara", estorno, 2024, -30), false)
    assert.equal(gastoParlamentarExibivel("Camara", {
      ...partialCurrentYear,
      proveniencia: { ...partialCurrentYear.proveniencia, complete_years: years.filter((year) => year !== 2015), partial_years: [2015] },
    }, 2024, 100), false)
    assert.equal(gastoParlamentarExibivel("Camara", {
      ...partialCurrentYear,
      proveniencia: { ...partialCurrentYear.proveniencia, scope_complete: true },
    }, 2024, 100), false)
    assert.equal(gastoParlamentarExibivel("Camara", {
      ...partialCurrentYear,
      proveniencia: { ...partialCurrentYear.proveniencia, complete_years: years.filter((year) => year !== 2024 && year !== 2026) },
    }, 2024, 100), false)
  })

  test("linha sem fonte declarada continua exibível, porque o bloqueio é nominal", () => {
    // O bloqueio é sobre a Câmara, não sobre ausência de rótulo. Linha sem fonte é outro
    // problema, de proveniência, e não deve ser silenciada por este filtro.
    assert.equal(gastoParlamentarExibivel(null), true)
    assert.equal(gastoParlamentarExibivel(undefined), true)
    assert.equal(gastoParlamentarExibivel(""), true)
  })
})
