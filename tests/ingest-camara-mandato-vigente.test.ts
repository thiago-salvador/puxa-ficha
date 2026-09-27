import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { atualizacoesPerfilCamara, legislaturaCamaraVigente, mandatoCamaraVigente } from "../scripts/lib/ingest-camara"

const setembro2026 = new Date("2026-09-26T12:00:00Z")

describe("legislaturaCamaraVigente", () => {
  it("usa a legislatura que começa em 1º de fevereiro", () => {
    assert.equal(legislaturaCamaraVigente(setembro2026), 57)
    assert.equal(legislaturaCamaraVigente(new Date("2023-02-01T12:00:00Z")), 57)
    assert.equal(legislaturaCamaraVigente(new Date("2027-01-31T12:00:00Z")), 57)
    assert.equal(legislaturaCamaraVigente(new Date("2027-02-01T12:00:00Z")), 58)
    assert.equal(legislaturaCamaraVigente(new Date("1999-02-01T12:00:00Z")), 51)
  })
})

describe("mandatoCamaraVigente", () => {
  it("aceita exercício na legislatura vigente", () => {
    assert.equal(mandatoCamaraVigente({ situacao: "Exercício", idLegislatura: 57, siglaPartido: "PT" }, setembro2026), true)
  })

  it("recusa exercício de legislatura encerrada (ex-deputado com status antigo)", () => {
    // Forma real da API para o deputado 74192 em 26/09/2026: último mandato na
    // legislatura 51, situacao "Exercício", partido daquela época.
    assert.equal(mandatoCamaraVigente({ situacao: "Exercício", idLegislatura: 51, siglaPartido: "PSDB" }, setembro2026), false)
  })

  it("recusa status sem legislatura e situação fora de exercício", () => {
    assert.equal(mandatoCamaraVigente({ situacao: "Exercício" }, setembro2026), false)
    assert.equal(mandatoCamaraVigente({ situacao: "Fim de Mandato", idLegislatura: 57 }, setembro2026), false)
    assert.equal(mandatoCamaraVigente(undefined, setembro2026), false)
  })
})

describe("atualizacoesPerfilCamara (regressão de tse-2026-270002544629)", () => {
  // Forma da resposta de /api/v2/deputados/74192 em 27/09/2026: ultimoStatus
  // é o do mandato 1999-2003 (legislatura 51), com situacao "Exercício".
  const exDeputado74192 = {
    id: 74192,
    nomeCivil: "PAULO SARDINHA MOURAO",
    escolaridade: "Superior",
    municipioNascimento: "Cristalândia",
    ufNascimento: "TO",
    dataNascimento: "1956-03-09",
    ultimoStatus: {
      id: 74192,
      nome: "PAULO MOURÃO",
      siglaPartido: "PSDB",
      siglaUf: "TO",
      idLegislatura: 51,
      situacao: "Exercício",
      condicaoEleitoral: "Titular",
      urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/74192.jpg",
    },
  }

  it("mandato 1999-2003 em Exercício não toca partido nem cargo", () => {
    const updates = atualizacoesPerfilCamara(exDeputado74192, { agora: setembro2026, fotoAtual: "https://example.test/f.jpg" })
    assert.equal("partido_sigla" in updates, false)
    assert.equal("partido_atual" in updates, false)
    assert.equal("cargo_atual" in updates, false)
    assert.deepEqual(updates, {
      ultima_atualizacao: setembro2026.toISOString(),
      formacao: "Superior",
      naturalidade: "Cristalândia/TO",
      data_nascimento: "1956-03-09",
    })
  })

  it("mandato em exercício na legislatura vigente grava partido e cargo", () => {
    const vigente = { ...exDeputado74192, ultimoStatus: { ...exDeputado74192.ultimoStatus, idLegislatura: 57, siglaPartido: "PT" } }
    const updates = atualizacoesPerfilCamara(vigente, { agora: setembro2026, fotoAtual: null })
    assert.equal(updates.partido_sigla, "PT")
    assert.equal(updates.partido_atual, "PT")
    assert.equal(updates.cargo_atual, "Deputado(a) Federal")
    assert.equal(updates.foto_url, exDeputado74192.ultimoStatus.urlFoto)
  })

  it("fonte secundária não grava data sentinela nem 1º de janeiro", () => {
    for (const dataNascimento of ["1900-01-01", "1968-01-01"]) {
      const updates = atualizacoesPerfilCamara({ ...exDeputado74192, dataNascimento }, { agora: setembro2026 })
      assert.equal("data_nascimento" in updates, false)
    }
  })
})
