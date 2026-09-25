import test from "node:test"
import assert from "node:assert/strict"
import { canonicalDjenUrl, decideLink, isOfficialCourtUrl, type ProcessoLinkRow } from "../scripts/audit/processos-links-readback"

const row = (extra: Partial<ProcessoLinkRow> = {}): ProcessoLinkRow => ({ id: "1", candidato_id: "c", slug: "pessoa", nome_completo: "José da Silva", numero_processo: "5005453-05.2023.4.03.6000", url_fonte: "https://example.com/noticia", tribunal: "TRF3", tipo: "criminal", ...extra })

test("aceita somente HTTPS em domínio judicial jus.br", () => {
  assert.equal(isOfficialCourtUrl("https://pje.tjsp.jus.br/consulta"), true)
  assert.equal(isOfficialCourtUrl("https://pje.tjsp.jus.br:443/consulta"), false)
  assert.equal(isOfficialCourtUrl("https://evil-jus.br/consulta"), false)
  assert.equal(isOfficialCourtUrl("http://pje.tjsp.jus.br/consulta"), false)
  assert.equal(isOfficialCourtUrl("https://example.com/pje.tjsp.jus.br"), false)
})

test("canonicaliza CNJ válido e rejeita identificador que não é CNJ", () => {
  assert.match(canonicalDjenUrl("5005453-05.2023.4.03.6000")!, /numeroProcesso=50054530520234036000$/)
  assert.equal(canonicalDjenUrl("TC 008.761/2020-5"), null)
  assert.equal(canonicalDjenUrl("5005453-06.2023.4.03.6000"), null)
})

test("aceita somente item JSON ativo com CNJ e destinatário exatos", () => {
  const official = { status: 200, url: canonicalDjenUrl(row().numero_processo!)!, body: JSON.stringify({ count: 1, items: [{ numero_processo: "50054530520234036000", ativo: true, destinatarios: [{ nome: "JOSÉ DA SILVA", polo: "P" }], texto: "eco 50054530520234036000 José da Silva" }] }) }
  assert.equal(decideLink(row(), official).decision, "revisao_editorial")
  assert.equal(decideLink(row(), { ...official, body: JSON.stringify({ count: 1, items: [{ numero_processo: "50054530520234036000", ativo: true, destinatarios: [{ nome: "MARIA" }], texto: "eco 50054530520234036000 José da Silva" }] }) }).decision, "omitir_contagem")
  assert.equal(decideLink(row(), { ...official, body: JSON.stringify({ count: 1, items: [{ numero_processo: "50054530520234036000", ativo: false, destinatarios: [{ nome: "JOSÉ DA SILVA" }] }] }) }).decision, "omitir_contagem")
  assert.equal(decideLink(row({ numero_processo: null }), null).decision, "omitir_contagem")
})
