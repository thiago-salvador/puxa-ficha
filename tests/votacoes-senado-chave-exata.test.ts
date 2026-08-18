import test, { describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const evidence = JSON.parse(readFileSync(join(
  ROOT,
  "QA/evidencias/2026-08-11-item7-senado/auditoria-oficial-13-linhas.json"
), "utf8"))
const migration = readFileSync(join(
  ROOT,
  "supabase/migrations/20260811100000_votacoes_senado_chave_exata.sql"
), "utf8")
const contract = readFileSync(join(
  ROOT,
  "supabase/migrations/20260811100100_votacoes_senado_contrato_exato.sql"
), "utf8")
const rollback = readFileSync(join(
  ROOT,
  "supabase/rollback/20260811100000_votacoes_senado_chave_exata.rollback.sql"
), "utf8")
const allowlist = JSON.parse(readFileSync(join(
  ROOT,
  "scripts/audit/allowlist-votacoes-senado-exatas-20260811.json"
), "utf8"))

describe("Item 7: universo integral do Senado", () => {
  test("mede as 13 linhas e os 81 pares anteriores, sem usar os exemplos como limite", () => {
    assert.deepEqual(evidence.universoAntes, { linhasSenado: 13, paresSenado: 81 })
    assert.equal(evidence.linhas.length, 13)
    assert.equal(evidence.linhas.reduce((total: number, linha: { paresAntes: number }) => total + linha.paresAntes, 0), 81)
  })

  test("fecha em seis eventos oficiais exatos e 75 votos com polaridade pública", () => {
    assert.deepEqual(evidence.universoDepois, { linhasSenado: 6, paresNominaisPublicaveis: 75 })
    assert.deepEqual(
      evidence.eventos.map((evento: { codigoSessaoVotacao: string }) => evento.codigoSessaoVotacao),
      ["6046", "6248", "6377", "6714", "6756", "6777"]
    )
    assert.equal(evidence.endpointsSenadoresExigidos, 28)
    assert.equal(evidence.votos.length, 75)
    assert.ok(evidence.votos.every((voto: { voto: string }) =>
      ["sim", "não", "abstenção", "obstrução"].includes(voto.voto)
    ))
  })

  test("as sete retiradas têm causa nominal, inclusive duplicata, segredo e ausência de evento", () => {
    const retiradas = evidence.linhas.filter((linha: { decisao: string }) => linha.decisao === "retirada")
    assert.equal(retiradas.length, 7)
    assert.ok(retiradas.every((linha: { motivo: string }) => linha.motivo.length >= 15))
    assert.match(retiradas.find((linha: { id: string }) => linha.id === "baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6").motivo, /secreto/)
    assert.match(retiradas.find((linha: { id: string }) => linha.id === "b3dce7a7-bb51-4d96-8aa2-ee0240f76cf0").motivo, /contradiz AP/)
  })
})

describe("Item 7: artefatos aplicáveis e reversíveis", () => {
  test("migration fail-close declara o universo antes e depois", () => {
    assert.match(migration, /esperado universo anterior de 13 linhas/)
    assert.match(migration, /esperado universo anterior de 81 pares/)
    assert.match(migration, /esperado universo final de 6 linhas/)
    assert.match(migration, /esperado universo final de 75 pares/)
    assert.doesNotMatch(migration, /add constraint/)
    assert.match(contract, /votacoes_chave_senado_exige_evento_exato_check/)
  })

  test("migration contém exatamente os 75 pares auditados", () => {
    const bloco = migration.match(/curadoria\(votacao_id, slug, voto\) as \(values([\s\S]*?)\)\nselect c\.id/)
    assert.ok(bloco)
    const tuplas = bloco[1].match(/^\s*\('[0-9a-f-]+'::uuid, '[^']+', '(?:sim|não|abstenção|obstrução)'\),?$/gm) ?? []
    assert.equal(tuplas.length, 75)
    for (const voto of evidence.votos as Array<{ linhaId: string; slug: string; voto: string }>) {
      assert.ok(migration.includes(`('${voto.linhaId}'::uuid, '${voto.slug}', '${voto.voto}')`))
    }
  })

  test("rollback restaura as 13 linhas e os 81 pares congelados", () => {
    assert.match(rollback, /rollback Senado recusado: payload atual diverge da forward/)
    assert.match(rollback, /db7785f89d8a3ebe8796503141fa89d0/)
    assert.match(rollback, /cbd5058dba59cb878be302826ce3ac7f/)
    assert.match(rollback, /esperado 13 linhas/)
    assert.match(rollback, /esperado 81 pares/)
    const pares = rollback.match(/^\s*\('[0-9a-f-]+'::uuid, '[^']+', '[0-9a-f-]+'::uuid,/gm) ?? []
    assert.equal(pares.length, 81)
  })

  test("allowlist coincide com os eventos e contagens do recibo", () => {
    assert.deepEqual(allowlist.medicao.antes, { linhas: 13, pares: 81 })
    assert.deepEqual(allowlist.medicao.depois, { linhas: 6, pares: 75 })
    assert.deepEqual(allowlist.medicao.eventos, ["6046", "6248", "6377", "6714", "6756", "6777"])
    assert.equal(allowlist.medicao.linhas_retiradas, 7)
    assert.equal(allowlist.referencias.length, 9)
  })
})
