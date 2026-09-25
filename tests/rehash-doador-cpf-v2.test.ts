import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  exigirChaveV2,
  fingerprintDaChave,
  planejarRehashLinha,
  verificarSoHashMudou,
} from "../scripts/lib/rehash-doador-cpf-v2"

const linha = (doadores: unknown[]) => ({
  id: "f1",
  candidato_id: "c1",
  ano_eleicao: 2018,
  sq_candidato: "1",
  uf_candidatura: "SP",
  maiores_doadores: doadores,
})

describe("rehash cpf_hash v2", () => {
  it("acrescenta hash só onde a fonte dá CPF único para o nome, sem mudar valores", () => {
    const antes = [
      { nome: "José da Silva", valor: 100, tipo: "PF" },
      { nome: "EMPRESA SA", valor: 50, tipo: "PJ", cnpj: "12345678000199" },
      { nome: "Maria Souza", valor: 10, tipo: "PF" },
    ]
    const fonte = [
      { nome: "JOSE DA SILVA", valor: 999, tipo: "PF", cpf_hash: "h1", cpf_hash_versao: 2 },
      { nome: "MARIA SOUZA", valor: 10, tipo: "PF" },
    ]
    const d = planejarRehashLinha(linha(antes), fonte)
    assert.equal(d.tipo, "parcial")
    assert.ok(d.tipo === "parcial")
    assert.equal(d.hashes_novos, 1)
    assert.equal(d.sem_correspondencia, 1)
    assert.deepEqual(d.depois[0], { nome: "José da Silva", valor: 100, tipo: "PF", cpf_hash: "h1", cpf_hash_versao: 2 })
    assert.deepEqual(d.depois[1], antes[1])
    assert.deepEqual(d.depois[2], antes[2])
  })

  it("não toca linha já hasheada nem sobrescreve hash antigo", () => {
    assert.equal(planejarRehashLinha(linha([{ nome: "A", valor: 1, tipo: "PF", cpf_hash: "x", cpf_hash_versao: 2 }]), []).tipo, "inalterado")
    const d = planejarRehashLinha(linha([{ nome: "A", valor: 1, tipo: "PF", cpf_hash: "velho" }]), [
      { nome: "A", tipo: "PF", cpf_hash: "novo", cpf_hash_versao: 2 },
    ])
    assert.ok(d.tipo === "parcial" && d.hashes_novos === 0)
  })

  it("sem pacote do pleito não escreve", () => {
    assert.equal(planejarRehashLinha(linha([{ nome: "A", valor: 1, tipo: "PF" }]), null).tipo, "sem_fonte")
  })

  it("não usa hash de nome que a fonte liga também a CNPJ", () => {
    const d = planejarRehashLinha(linha([{ nome: "A", valor: 1, tipo: "PF" }]), [{ nome: "A", cpf_hash: "h", cnpj: "1" }])
    assert.ok(d.tipo === "parcial" && d.hashes_novos === 0)
  })

  it("invariante recusa qualquer mudança fora dos campos de hash", () => {
    assert.equal(verificarSoHashMudou([{ nome: "A", valor: 1 }], [{ nome: "A", valor: 1, cpf_hash: "h", cpf_hash_versao: 2 }]), null)
    assert.match(verificarSoHashMudou([{ nome: "A", valor: 1 }], [{ nome: "A", valor: 2 }]) ?? "", /valor/)
    assert.match(verificarSoHashMudou([{ nome: "A", cpf_hash: "a" }], [{ nome: "A", cpf_hash: "b" }]) ?? "", /cpf_hash/)
  })

  it("recusa chave que não é a v2", () => {
    assert.throws(() => exigirChaveV2(undefined), /ausente/)
    assert.throws(() => exigirChaveV2("outra-chave"), /não é a chave v2/)
    assert.equal(fingerprintDaChave("abc").length, 16)
  })
})
