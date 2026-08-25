import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import path from "node:path"

import {
  estadoDesligado,
  runLinkCheck,
  type PontoAtencaoLinkRow,
  type UrlStatus,
} from "../scripts/link-check-pontos-atencao"
import { fonteUrlApontaParaDocumento } from "../src/lib/public-attention-point"

const ROOT = path.resolve(import.meta.dirname, "..")
const MIGRATION = path.join(
  ROOT,
  "supabase/migrations/20260825123000_fix_public_attention_sources_issue_96.sql",
)
const SNAPSHOT = path.join(ROOT, "tests/fixtures/issue-96-post-migration-snapshot.json")

const EXPECTED_IDS = new Set([
  "337bc0e5-614c-433d-8da9-584e3fee29f7",
  "3ab64a77-24bd-4662-820f-eebc031b6467",
  "3c8cf652-37a7-499a-9b5e-cc095d413295",
  "472db74b-8ed9-484a-95d1-2ea5949a6f80",
  "6452c61b-8632-44d4-be0f-c6e66f161681",
  "67f26e0e-7b2b-40a3-a0c0-b5c9509ae643",
  "6c9a396b-49be-47bf-974f-8569d4d22986",
  "8885902e-c940-44ef-ba04-515e24aaa9fe",
  "8e8db2cc-7163-45ed-af6a-0909812f22ac",
  "98d9c7c6-263f-45dd-9442-e568106bae7c",
  "a04dd437-74e9-45c8-95be-64ecc50e1cfc",
  "a48921e3-0988-4125-bb39-4ea2729a57a2",
  "a6efc579-1e51-4b2a-9f3e-38eb897183a8",
  "e572f945-3e8d-4257-9309-c8d799ccc2c0",
  "f0922bdd-44f8-496d-8aa5-b6c899f72f99",
])

const FORBIDDEN_VISIBLE_URLS = new Set([
  "https://www.es.gov.br/governo/governador",
  "https://www1.folha.uol.com.br/poder/2024/08/marcal-piramide-financeira.shtml",
  "https://g1.globo.com",
  "https://www.camara.leg.br",
  "https://www.senado.leg.br",
  "https://www.conjur.com.br",
  "https://ww4.al.rs.gov.br",
  "https://noticias.stf.jus.br/postsnoticias/decisao-do-ministro-barroso-mantem-inelegibilidade-de-pre-candidato-ao-governo-de-sergipe/",
])

function rows(): PontoAtencaoLinkRow[] {
  return JSON.parse(readFileSync(SNAPSHOT, "utf8")) as PontoAtencaoLinkRow[]
}

function urls(row: PontoAtencaoLinkRow): string[] {
  if (!Array.isArray(row.fontes)) return []
  return row.fontes.flatMap((fonte) => {
    if (typeof fonte !== "object" || fonte === null) return []
    const url = (fonte as { url?: unknown }).url
    return typeof url === "string" ? [url] : []
  })
}

describe("issue #96: recorte exato e pos-migration", () => {
  it("mantém exatamente 15 decisões, com 10 correções e 5 despublicações", () => {
    const snapshot = rows()
    assert.equal(snapshot.length, 15)
    assert.deepEqual(new Set(snapshot.map((row) => row.id)), EXPECTED_IDS)
    assert.equal(snapshot.filter((row) => row.visivel === true).length, 10)
    assert.equal(snapshot.filter((row) => row.visivel === false).length, 5)
    assert.ok(snapshot.every((row) => row.publico === true))
  })

  it("não deixa fonte genérica ou URL proibida em claim visível", () => {
    const visibleUrls = rows().filter((row) => row.visivel === true).flatMap(urls)
    assert.ok(visibleUrls.length > 0)
    assert.ok(visibleUrls.every((url) => fonteUrlApontaParaDocumento(url)), visibleUrls.join("\n"))
    assert.deepEqual(visibleUrls.filter((url) => FORBIDDEN_VISIBLE_URLS.has(url)), [])
  })

  it("passa o mesmo veredito do link-check com respostas determinísticas", async () => {
    const snapshot = rows()
    const unavailable = new Set([
      "https://portaldatransparencia.gov.br/sancoes/consulta/127127",
      "https://portaldatransparencia.gov.br/sancoes/consulta/104199",
      "https://www.tse.jus.br/comunicacao/noticias/2022/Outubro/raquel-lyra-psdb-vence-disputa-e-e-eleita-governadora-de-pernambuco",
      "https://www.tre-sp.jus.br/comunicacao/noticias/2025/Maio/juiz-eleitoral-cassa-diploma-do-vereador-rubinho-nunes",
    ])

    const result = await runLinkCheck({
      apply: false,
      onlyVisible: false,
      limit: null,
      execucaoId: "issue-96-test",
      estado: estadoDesligado(),
      intervaloConfirmacaoMs: 6 * 3600_000,
      fetchRows: async () => snapshot,
      probeUrls: async (input) =>
        input.map((url) => {
          let status: UrlStatus = unavailable.has(url) ? "indisponivel" : "viva"
          if (url === "https://www.tse.jus.br") status = "sem_caminho"
          if (url.includes("folha.uol.com.br/poder/2024/08/marcal-piramide-financeira")) status = "morta"
          return { url, status, httpStatus: status === "viva" ? 200 : null, detalhe: "fixture" }
        }),
      despublicar: async () => {
        throw new Error("o teste da issue #96 é read-only")
      },
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      agora: () => new Date("2026-08-25T12:30:00-03:00"),
    })

    assert.equal(result.claimsComFonteMorta.length, 0)
    assert.equal(result.claimsComMorteSuspeita.length, 0)
    assert.equal(result.claimsSemFonteUtilizavel.length, 0)
    assert.equal(result.erros, 0)
  })

  it("migração é fechada nos mesmos UUIDs e preserva rollback auditável", () => {
    const sql = readFileSync(MIGRATION, "utf8")
    const ids = new Set(sql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [])

    assert.deepEqual(ids, EXPECTED_IDS)
    assert.match(sql, /issue_96_link_check_2026_08_25/)
    assert.match(sql, /fontes_anteriores/)
    assert.match(sql, /visivel_anterior/)
    assert.doesNotMatch(sql, /(?:ALTER|DROP|TRUNCATE)\s+TABLE\s+public\./i)
    assert.doesNotMatch(sql, /CREATE\s+TABLE\s+public\./i)
  })
})
