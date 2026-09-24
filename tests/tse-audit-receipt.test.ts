import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FONTES, montarLinhas } from "../scripts/lib/coleta-log"
import { FONTES_POR_CANDIDATO } from "../scripts/audit/lib/coleta-proveniencia"
import {
  FONTE_TSE_AUDITORIA,
  reciboAuditoriaTse,
  temCredencialDeEscrita,
} from "../scripts/lib/data-freshness/tse-audit-receipt"
import { TSE_CANDIDACY_URL } from "../scripts/lib/data-freshness/tse-source"
import { lerArtefatosAuditoriaTse } from "../scripts/audit/registrar-recibo-auditoria-tse"

const SHA = "a".repeat(64)
const liveSource = {
  status: "fresh",
  mode: "live_official",
  checked_at: "2026-09-24T11:38:02.000Z",
  source_url: TSE_CANDIDACY_URL,
  source_sha256: SHA,
  divulgacand: { status: "fresh", checked_at: "2026-09-24T11:39:10.000Z" },
}

test("leitura oficial ao vivo vira coleta encontrada global com sha e ressalva", () => {
  const recibo = reciboAuditoriaTse({ source: liveSource, officialCount: 1200, diffStatus: "ok" })
  assert.ok(recibo)
  assert.equal(recibo.fonte, FONTE_TSE_AUDITORIA)
  assert.equal(recibo.escopo, "global")
  assert.equal(recibo.alvo, "consulta_cand_2026")
  assert.equal(recibo.resultado, "encontrado")
  assert.equal(recibo.volume, 1200)
  assert.equal(recibo.url, TSE_CANDIDACY_URL)
  assert.match(recibo.detalhe ?? "", new RegExp(`sha256 ${SHA}`))
  assert.match(recibo.detalhe ?? "", /baixado em 2026-09-24T11:38:02.000Z/)
  assert.match(recibo.detalhe ?? "", /DivulgaCand consultado em 2026-09-24T11:39:10.000Z/)
  assert.match(recibo.detalhe ?? "", /Comparação com o publicado: ok/)
  assert.match(recibo.detalhe ?? "", /não prova verificação de campo nem atualização da ficha/)
})

test("divergência com o publicado fica no detalhe sem negar a leitura da fonte", () => {
  const recibo = reciboAuditoriaTse({ source: liveSource, officialCount: 1200, diffStatus: "review_required" })
  assert.equal(recibo?.resultado, "encontrado")
  assert.match(recibo?.detalhe ?? "", /Comparação com o publicado: review_required/)
})

test("falha de fonte ou leitura incompleta vira erro, nunca sucesso", () => {
  const sourceError = reciboAuditoriaTse({
    source: { status: "source_error", error: "as duas superfícies oficiais do TSE falharam" },
    officialCount: null,
    diffStatus: null,
  })
  assert.equal(sourceError?.resultado, "erro")
  assert.equal(sourceError?.volume, 0)
  assert.match(sourceError?.detalhe ?? "", /as duas superfícies oficiais do TSE falharam/)

  for (const artefatos of [
    { source: { ...liveSource, source_sha256: "nao-e-sha" }, officialCount: 1200, diffStatus: "ok" },
    { source: liveSource, officialCount: 0, diffStatus: "ok" },
    { source: { ...liveSource, checked_at: null }, officialCount: 1200, diffStatus: "ok" },
  ]) {
    assert.equal(reciboAuditoriaTse(artefatos)?.resultado, "erro")
  }
})

test("snapshot versionado local não é coleta e não gera recibo", () => {
  assert.equal(
    reciboAuditoriaTse({ source: { ...liveSource, mode: "versioned_snapshot" }, officialCount: 1200, diffStatus: "ok" }),
    null,
  )
})

test("fonte registrada como global e fora da régua por ficha", () => {
  assert.equal(FONTES[FONTE_TSE_AUDITORIA], "global")
  assert.ok(!FONTES_POR_CANDIDATO.includes(FONTE_TSE_AUDITORIA))
  const recibo = reciboAuditoriaTse({ source: liveSource, officialCount: 1200, diffStatus: "ok" })
  assert.ok(recibo)
  const [linha] = montarLinhas([recibo], new Map())
  assert.equal(linha?.escopo, "global")
  assert.equal(linha?.candidato_id, null)
  assert.equal(linha?.volume, 1200)
})

test("credencial de escrita exige URL e chave de serviço", () => {
  assert.equal(temCredencialDeEscrita({}), false)
  assert.equal(temCredencialDeEscrita({ SUPABASE_URL: "https://x.supabase.co" }), false)
  assert.equal(temCredencialDeEscrita({ SUPABASE_SERVICE_ROLE_KEY: "k" }), false)
  assert.equal(temCredencialDeEscrita({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), true)
})

test("gravador lê os artefatos da auditoria e usa a gravação estrita", () => {
  const dir = mkdtempSync(join(tmpdir(), "tse-audit-receipt-"))
  try {
    writeFileSync(join(dir, "source.json"), JSON.stringify(liveSource))
    writeFileSync(join(dir, "universe.json"), JSON.stringify({ official: [{}, {}, {}] }))
    writeFileSync(join(dir, "diff.json"), JSON.stringify({ status: "ok" }))
    const artefatos = lerArtefatosAuditoriaTse(dir)
    assert.equal(artefatos.officialCount, 3)
    assert.equal(artefatos.diffStatus, "ok")
    assert.equal(reciboAuditoriaTse(artefatos)?.volume, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.throws(() => lerArtefatosAuditoriaTse(join(tmpdir(), "nao-existe-tse-audit")), /source\.json ausente/)

  const script = readFileSync(new URL("../scripts/audit/registrar-recibo-auditoria-tse.ts", import.meta.url), "utf8")
  assert.match(script, /await registrarColetaOuFalhar\(recibo\)/)
  assert.doesNotMatch(script, /\bregistrarColeta\(/)
  const workflow = readFileSync(new URL("../.github/workflows/data-freshness-audit.yml", import.meta.url), "utf8")
  assert.match(workflow, /run: npm run audit:data-freshness:tse-receipt/)
  assert.ok(
    workflow.indexOf("audit:data-freshness:tse-receipt") < workflow.indexOf("name: Publicar resumo no run"),
    "o recibo precisa rodar antes do resumo para o aviso aparecer no run",
  )
})
