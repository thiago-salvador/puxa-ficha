import { after, describe, it } from "node:test"
import assert from "node:assert/strict"

const PREV_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const TEST_SUPABASE_URL = PREV_SUPABASE_URL || "https://pf-test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL

after(() => {
  if (PREV_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = PREV_SUPABASE_URL
})

// Usar require em vez de top-level await:
// `tsx --test` neste repo transpila para formato CJS por padrão.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isAllowedImageSource } = require("../src/lib/remote-image-hosts")

describe("isAllowedImageSource", () => {
  it("aceita hosts conhecidos via HTTPS", () => {
    assert.strictEqual(isAllowedImageSource("https://upload.wikimedia.org/photo.jpg"), true)
    assert.strictEqual(isAllowedImageSource("https://www.camara.leg.br/foto.jpg"), true)
  })

  it("aceita Senado via HTTP (exceção documentada em next.config.ts)", () => {
    assert.strictEqual(isAllowedImageSource("http://www.senado.leg.br/foto.jpg"), true)
  })

  it("rejeita HTTP para outros hosts", () => {
    assert.strictEqual(isAllowedImageSource("http://upload.wikimedia.org/photo.jpg"), false)
  })

  it("aceita Supabase apenas em /storage/**", () => {
    const hostname = new URL(TEST_SUPABASE_URL).hostname
    assert.strictEqual(
      isAllowedImageSource(`https://${hostname}/storage/v1/object/public/photo.jpg`),
      true,
    )
    assert.strictEqual(
      isAllowedImageSource(`https://${hostname}/rest/v1/candidatos`),
      false,
    )
  })

  it("caminhos relativos passam (catch no fetch os trata como null)", () => {
    assert.strictEqual(isAllowedImageSource("/candidates/hertz-dias.jpg"), true)
  })

  it("rejeita hosts desconhecidos", () => {
    assert.strictEqual(isAllowedImageSource("https://evil.com/steal"), false)
    assert.strictEqual(isAllowedImageSource("http://169.254.169.254/latest/meta-data"), false)
  })

  it("rejeita protocolos não-HTTP", () => {
    assert.strictEqual(isAllowedImageSource("file:///etc/passwd"), false)
    assert.strictEqual(isAllowedImageSource("ftp://internal/data"), false)
  })

  it("retorna false para null/undefined/vazio", () => {
    assert.strictEqual(isAllowedImageSource(null), false)
    assert.strictEqual(isAllowedImageSource(undefined), false)
    assert.strictEqual(isAllowedImageSource(""), false)
  })
})
