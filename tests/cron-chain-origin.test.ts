import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { validarOrigemEncadeamento } from "../src/lib/cron-chain-origin"

/**
 * O fetch de encadeamento leva o CRON_SECRET num cabeçalho Authorization.
 * Cabeçalho só viaja protegido em HTTPS, e a origem vem de configuração
 * (PF_CRON_CHAIN_ORIGIN) ou do próprio request em ambiente não produtivo.
 */
describe("validarOrigemEncadeamento", () => {
  it("https passa, com ou sem porta", () => {
    assert.deepEqual(validarOrigemEncadeamento("https://puxaficha.com.br"), {
      ok: true,
      origin: "https://puxaficha.com.br",
    })
    assert.equal(validarOrigemEncadeamento("https://staging.puxaficha.com.br:8443").ok, true)
  })

  it("http fora de loopback é recusado: o segredo sairia em claro", () => {
    for (const origem of [
      "http://puxaficha.com.br",
      "http://preview-abc.vercel.app",
      "http://192.168.0.10:3000",
    ]) {
      assert.deepEqual(validarOrigemEncadeamento(origem), { ok: false, motivo: "sem_https" })
    }
  })

  it("loopback em http passa: é onde o dev roda e o tráfego não sai da máquina", () => {
    for (const origem of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
      assert.equal(validarOrigemEncadeamento(origem).ok, true, origem)
    }
  })

  it("esquema exótico não passa por ser 'não http'", () => {
    assert.deepEqual(validarOrigemEncadeamento("ftp://puxaficha.com.br"), {
      ok: false,
      motivo: "sem_https",
    })
  })

  it("string que não é URL é recusada em vez de explodir", () => {
    assert.deepEqual(validarOrigemEncadeamento("puxaficha.com.br"), {
      ok: false,
      motivo: "url_invalida",
    })
    assert.deepEqual(validarOrigemEncadeamento(""), { ok: false, motivo: "url_invalida" })
  })
})
