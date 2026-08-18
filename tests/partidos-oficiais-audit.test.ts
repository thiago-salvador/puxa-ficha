import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

import {
  classifyCodeOccurrence,
  officialSiglaFor,
} from "../scripts/audit/partidos-oficiais"

const official = new Map([
  ["DEMOCRATA", { sigla: "DEMOCRATA", nome: "DEMOCRATA", legenda: 35, deferimento: "29.9.2015" }],
  ["UNIAO", { sigla: "UNIÃO", nome: "UNIÃO BRASIL", legenda: 44, deferimento: "8.2.2022" }],
])

describe("auditoria de partidos oficiais", () => {
  it("resolve legado e acento pela referencia ancorada", () => {
    assert.equal(officialSiglaFor("D35", official), "DEMOCRATA")
    assert.equal(officialSiglaFor("DEMOCRATA", official), "DEMOCRATA")
    assert.equal(officialSiglaFor("UNIAO", official), "UNIÃO")
    assert.equal(officialSiglaFor("SEMPARTIDO", official), null)
  })

  it("separa alias, fixture, dado legado e hardcode atual", () => {
    assert.equal(
      classifyCodeOccurrence("D35", { arquivo: "src/lib/party-utils.ts", linha: 1, texto: 'aliases: ["D35"]' }),
      "alias_legado_compativel",
    )
    assert.equal(
      classifyCodeOccurrence("D35", { arquivo: "tests/example.test.ts", linha: 1, texto: '"D35"' }),
      "fixture_ou_teste_regressao",
    )
    assert.equal(
      classifyCodeOccurrence("D35", { arquivo: "supabase/migrations/x.sql", linha: 1, texto: "'D35'" }),
      "dado_persistido_legado",
    )
    assert.equal(
      classifyCodeOccurrence("UNIAO", { arquivo: "src/data/example.ts", linha: 1, texto: '"UNIAO"' }),
      "sigla_nao_oficial_hardcoded",
    )
    assert.equal(
      classifyCodeOccurrence("Podemos", { arquivo: "src/data/example.ts", linha: 1, texto: '"Podemos"' }),
      null,
      "nome por extenso nao deve ser confundido com sigla hardcoded",
    )
    assert.equal(
      classifyCodeOccurrence("DEM", { arquivo: "src/data/historico.ts", linha: 1, texto: '"DEM"' }),
      "historica_valida",
    )
    assert.equal(
      classifyCodeOccurrence("DEM", { arquivo: "src/data/atual.ts", linha: 1, texto: '"DEM"' }),
      "historica_contexto_nao_comprovado",
    )
  })

  it("mantem o cliente em modo somente leitura e nao contem verbos de escrita", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/audit/partidos-oficiais.ts"), "utf8")
    assert.match(source, /ativarDryRun\(\)/)
    assert.match(source, /exigirDryRun\(/)
    assert.doesNotMatch(source, /\.\s*(?:insert|update|upsert|delete|rpc)\s*\(/)
  })
})
