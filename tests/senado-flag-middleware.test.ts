import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { NextRequest } from "next/server"
import { middleware } from "../middleware"

const env = process.env as Record<string, string | undefined>
let savedFlag: string | undefined

function request(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`)
}

const SENADO_PATHS = [
  "/senado",
  "/senado/",
  "/SENADO",
  "/%73enado",
  "/uf/sp/senado",
  "/uf/sp/senado/",
  "/uf/SP/senado",
  "/uf/%73p/senado",
  "/uf/%53%50/senado",
  "/uf/sp/%73enado",
]

describe("middleware: rota do Senado atrás da flag", () => {
  beforeEach(() => {
    savedFlag = env.SENADO_ENABLED
  })

  afterEach(() => {
    if (savedFlag === undefined) delete env.SENADO_ENABLED
    else env.SENADO_ENABLED = savedFlag
  })

  for (const pathname of SENADO_PATHS) {
    it(`responde 404 em ${pathname} com a flag desligada`, async () => {
      delete env.SENADO_ENABLED
      const response = await middleware(request(pathname))
      assert.equal(response.status, 404)
      assert.equal(response.headers.get("x-middleware-next"), null)
    })

    it(`não bloqueia ${pathname} com a flag ligada`, async () => {
      env.SENADO_ENABLED = "true"
      const response = await middleware(request(pathname))
      assert.notEqual(response.status, 404)
      assert.equal(response.headers.get("x-middleware-next"), "1")
    })
  }

  it("não confunde rotas vizinhas com a rota do Senado", async () => {
    delete env.SENADO_ENABLED
    for (const pathname of ["/senadores", "/uf/sp", "/uf/sp/senado-extra", "/parlamentares"]) {
      const response = await middleware(request(pathname))
      assert.equal(response.headers.get("x-middleware-next"), "1", pathname)
    }
  })

  it("percent-encoding inválido não derruba o middleware", async () => {
    for (const flag of [undefined, "true"]) {
      if (flag === undefined) delete env.SENADO_ENABLED
      else env.SENADO_ENABLED = flag
      for (const pathname of ["/uf/%E0%A4%A/senado", "/senado%E0%A4%A", "/uf/sp/%E0%A4%A"]) {
        const response = await middleware(request(pathname))
        assert.ok(response.status < 500, `${pathname} com flag ${flag}`)
      }
      const invalidUf = await middleware(request("/uf/%E0%A4%A/senado"))
      assert.equal(invalidUf.status, 404)
    }
  })
})
