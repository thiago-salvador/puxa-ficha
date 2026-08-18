import test from "node:test"
import assert from "node:assert/strict"
import {
  formatDate,
  getInitials,
  getWikimediaThumbnailUrl,
  isPhotoPlaceholder,
  isUiAvatarsPlaceholder,
  safeHref,
  shouldBypassImageOptimization,
} from "../src/lib/utils"

test("safeHref accepts http and https URLs", () => {
  assert.equal(safeHref("https://puxaficha.com.br"), "https://puxaficha.com.br")
  assert.equal(safeHref("http://example.com"), "http://example.com")
})

test("safeHref rejects unsafe protocols", () => {
  assert.equal(safeHref("javascript:alert(1)"), null)
  assert.equal(safeHref("data:text/html;base64,AAAA"), null)
})

test("isUiAvatarsPlaceholder recognizes only the blocked placeholder host", () => {
  assert.equal(isUiAvatarsPlaceholder("https://ui-avatars.com/api/?name=TS"), true)
  assert.equal(isUiAvatarsPlaceholder("https://www.ui-avatars.com/api/?name=TS"), true)
  assert.equal(isUiAvatarsPlaceholder("https://example.com/ui-avatars.com/photo.jpg"), false)
  assert.equal(isUiAvatarsPlaceholder("/candidates/thiago.jpg"), false)
})

test("isPhotoPlaceholder recognizes generated-photo services without blocking real paths", () => {
  const placeholders = [
    "https://ui-avatars.com/api/?name=TS",
    "https://placehold.co/600x800",
    "https://via.placeholder.com/600x800",
    "https://dummyimage.com/600x800",
    "https://images.example/avatar-generated/thiago.png",
    "https://images.example/avatars/thiago-avatar-gerado.png",
  ]
  for (const url of placeholders) assert.equal(isPhotoPlaceholder(url), true, url)

  assert.equal(isPhotoPlaceholder("https://example.com/ui-avatars.com/photo.jpg"), false)
  assert.equal(isPhotoPlaceholder("https://example.com/avatars/thiago.jpg"), false)
  assert.equal(isPhotoPlaceholder("/candidates/thiago.jpg"), false)
  assert.equal(isPhotoPlaceholder(null), false)
})

test("formatDate preserves bare ISO dates without timezone drift", () => {
  assert.equal(formatDate("2016-09-14"), "14/09/2016")
})

test("formatDate normalizes timestamps to the public Brazil timezone", () => {
  assert.equal(formatDate("2026-04-09T02:00:00+00:00"), "08/04/2026")
})

test("formatDate returns a stable fallback for invalid dates", () => {
  assert.equal(formatDate("not-a-date"), "Data indisponível")
  assert.equal(formatDate("2026-13-45"), "Data indisponível")
  assert.equal(formatDate(new Date(Number.NaN)), "Data indisponível")
})

test("getInitials ignores repeated whitespace and empty names", () => {
  assert.equal(getInitials("  Maria   Silva  "), "MS")
  assert.equal(getInitials("Lula "), "LU")
  assert.equal(getInitials("   "), "")
})

test("shouldBypassImageOptimization optimizes allowlisted remote images", () => {
  assert.equal(
    shouldBypassImageOptimization("https://upload.wikimedia.org/wikipedia/commons/thumb/a/photo.jpg"),
    false,
  )
  assert.equal(
    shouldBypassImageOptimization("https://www.camara.leg.br/internet/deputado/foto.jpg"),
    false,
  )
})

test("shouldBypassImageOptimization returns true for unknown hosts", () => {
  assert.equal(
    shouldBypassImageOptimization("https://random-unknown-host.example.com/photo.jpg"),
    true,
  )
})

test("shouldBypassImageOptimization lets Next resize full Wikimedia originals", () => {
  assert.equal(
    shouldBypassImageOptimization("https://upload.wikimedia.org/wikipedia/commons/3/34/photo.png"),
    false,
  )
})

test("shouldBypassImageOptimization returns false for relative URLs", () => {
  assert.equal(shouldBypassImageOptimization("/images/hero.jpg"), false)
  assert.equal(shouldBypassImageOptimization("images/photo.png"), false)
})

test("shouldBypassImageOptimization returns false for null/undefined", () => {
  assert.equal(shouldBypassImageOptimization(null), false)
  assert.equal(shouldBypassImageOptimization(undefined), false)
})

test("getWikimediaThumbnailUrl downscales Wikimedia thumb URLs", () => {
  assert.equal(
    getWikimediaThumbnailUrl(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/photo.jpg/960px-photo.jpg",
      315,
    ),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/photo.jpg/330px-photo.jpg",
  )
})

test("getWikimediaThumbnailUrl leaves non-thumb URLs unchanged", () => {
  assert.equal(
    getWikimediaThumbnailUrl("https://upload.wikimedia.org/wikipedia/commons/9/9e/photo.jpg", 315),
    "https://upload.wikimedia.org/wikipedia/commons/9/9e/photo.jpg",
  )
})

test("isPhotoPlaceholder não estoura com percent-encoding malformado e ainda detecta gerador", () => {
  // Thread do CodeRabbit no PR #214: decodeURIComponent lança URIError em
  // "%ZZ"; o catch existente cai para o teste na string bruta.
  assert.equal(isPhotoPlaceholder("https://ui-avatars.com/api/%ZZ?name=CM"), true)
  assert.equal(isPhotoPlaceholder("/candidates/foto%ZZ.jpg"), false)
})
