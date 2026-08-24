import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { detectarAcessosRede } from "../scripts/audit/lib/pesquisas-sem-rede"

describe("auditoria server-only das pesquisas", () => {
  it("rejeita chamadas diretas dos clientes de rede suportados pelo runtime", () => {
    const casos = [
      ["fetch", "fetch('https://example.com')"],
      ["axios", "axios('https://example.com')"],
      ["axios", "axios.get('https://example.com')"],
      ["https", "https.request('https://example.com')"],
      ["undici", "undici.request('https://example.com')"],
    ] as const

    for (const [esperado, source] of casos) {
      assert.deepEqual(detectarAcessosRede(source), [esperado], source)
    }
  })

  it("rejeita imports estáticos, dinâmicos e require de clientes de rede", () => {
    for (const source of [
      'import axios from "axios"',
      'import { request } from "node:https"',
      'await import("undici")',
      'require("https")',
    ]) {
      assert.deepEqual(detectarAcessosRede(source), ["import de cliente de rede"], source)
    }
  })

  it("não confunde strings e identificadores sem chamada com acesso à rede", () => {
    assert.deepEqual(
      detectarAcessosRede('const httpsUrl = "https://example.com"; const axiosStatus = "offline"'),
      [],
    )
  })
})
