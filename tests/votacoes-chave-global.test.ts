import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test, { describe } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const evidenciaSenado = JSON.parse(
  readFileSync(
    join(ROOT, "QA", "evidencias", "2026-08-11-item7-senado", "auditoria-oficial-13-linhas.json"),
    "utf8"
  )
) as {
  linhas: Array<{ id: string; decisao: string; motivo: string; paresAntes: number }>
  eventos: Array<{ linhaId: string; codigoSessaoVotacao: string; pares: number }>
  votos: Array<{
    linhaId: string
    codigoSessaoVotacao: string
    slug: string
    senadoId: string
    voto: string
    urlFonte: string
  }>
}
const evidenciaCamara = JSON.parse(
  readFileSync(
    join(ROOT, "QA", "evidencias", "2026-08-10-item7-votacoes", "auditoria-votacoes-chave.json"),
    "utf8"
  )
) as { votacoes: Array<{ casa: string; status: string }> }
const ingestCamara = readFileSync(join(ROOT, "scripts", "lib", "ingest-camara.ts"), "utf8")
const ingestSenado = readFileSync(join(ROOT, "scripts", "lib", "ingest-senado.ts"), "utf8")

describe("item 7 global, Câmara e Senado", () => {
  test("as 13 linhas do Senado têm decisão terminal e evidência nominal", () => {
    assert.equal(evidenciaSenado.linhas.length, 13)
    assert.equal(new Set(evidenciaSenado.linhas.map((linha) => linha.id)).size, 13)
    assert.equal(evidenciaSenado.linhas.reduce((soma, linha) => soma + linha.paresAntes, 0), 81)

    for (const linha of evidenciaSenado.linhas) {
      assert.ok(["mantida", "retirada"].includes(linha.decisao), linha.id)
      assert.ok(linha.motivo.trim().length > 0, `${linha.id} sem motivo auditável`)
    }
    assert.equal(evidenciaSenado.linhas.filter((linha) => linha.decisao === "mantida").length, 6)
    assert.equal(evidenciaSenado.linhas.filter((linha) => linha.decisao === "retirada").length, 7)
  })

  test("todo voto publicado do Senado usa CodigoSessaoVotacao exato e fonte nominal", () => {
    const eventos = new Map(
      evidenciaSenado.eventos.map((evento) => [evento.linhaId, evento.codigoSessaoVotacao])
    )
    assert.equal(eventos.size, 6)
    assert.equal(evidenciaSenado.votos.length, 75)

    for (const voto of evidenciaSenado.votos) {
      assert.equal(voto.codigoSessaoVotacao, eventos.get(voto.linhaId), voto.slug)
      assert.ok(["sim", "não", "abstenção", "obstrução"].includes(voto.voto), voto.slug)
      assert.equal(
        voto.urlFonte,
        `https://legis.senado.leg.br/dadosabertos/senador/${voto.senadoId}/votacoes.json`
      )
    }
  })

  test("nenhum ingest de voto usa proposição como chave de casamento ou completude", () => {
    const blocoCamara = ingestCamara.match(
      /async function loadCamaraChaveVotacaoIds[\s\S]*?\n}\n\nasync function hasFullCamaraVoteCoverage/
    )
    assert.ok(blocoCamara)
    assert.doesNotMatch(blocoCamara[0], /proposicao_id/)
    assert.match(blocoCamara[0], /fonte, votacao_id_api/)
    assert.match(blocoCamara[0], /v\.fonte === "camara"/)

    assert.match(ingestCamara, /nao busca por `proposicao_id`/)
    assert.match(ingestSenado, /matching por proposicao foi recusado/)
    assert.match(ingestSenado, /CodigoSessaoVotacao exato/)
  })

  test("a auditoria da Câmara termina cada linha em estado explícito", () => {
    const camara = evidenciaCamara.votacoes.filter(
      (linha) => linha.casa === "Câmara" || linha.casa === "Camara"
    )
    assert.equal(camara.length, 11)
    const estadosTerminais = new Set([
      "ok",
      "proposicao_sem_votacao_na_api",
      "sem_votacao_de_plenario",
      "sem_proposicao_id_nunca_casa",
    ])
    for (const linha of camara) assert.ok(estadosTerminais.has(linha.status), linha.status)
  })
})
