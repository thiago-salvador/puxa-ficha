import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { lerArgumentos } from "../scripts/baixar-pacote-tse"
import { alvosPendentes, decidir, parseAnosRehash, type RunResumo, type Sonda } from "../scripts/tse-cdn-watcher"

const agora = Date.parse("2026-09-26T20:00:00Z")

function sondaAberta(urls: string[], status = 206): Sonda {
  return Object.fromEntries(urls.map((url) => [url, status]))
}

test("vigia só monta disparos em dry-run", () => {
  const alvos = alvosPendentes([2012, 2016])
  assert.deepEqual(alvos.map((alvo) => alvo.workflow), [
    "roster-deputados.yml",
    "tse-2026-financas.yml",
    "rehash-doador-cpf-v2.yml",
  ])
  for (const alvo of alvos) {
    assert.ok(alvo.urls.length > 0)
    assert.ok(alvo.urls.every((url) => url.startsWith("https://cdn.tse.jus.br/")))
    for (const chave of ["apply", "aplicar"]) {
      if (chave in alvo.inputs) assert.equal(alvo.inputs[chave], "false")
    }
  }
  assert.equal(alvos[2].inputs.anos, "2012,2016")
  assert.deepEqual(alvosPendentes([]).map((alvo) => alvo.workflow), ["roster-deputados.yml", "tse-2026-financas.yml"])
})

test("vigia recusa ano de rehash fora do catálogo ou repetido", () => {
  assert.deepEqual(parseAnosRehash(""), [])
  assert.deepEqual(parseAnosRehash(" 2012, 2016 "), [2012, 2016])
  assert.throws(() => parseAnosRehash("2012,2012"), /inválido/)
  assert.throws(() => parseAnosRehash("2026"), /inválido/)
})

test("vigia não dispara enquanto algum pacote do job responde 403", () => {
  const [roster] = alvosPendentes([])
  const sonda: Sonda = { ...sondaAberta(roster.urls), [roster.urls[1]]: 403 }
  const decisao = decidir(roster, sonda, [], agora)
  assert.equal(decisao.disparar, false)
  assert.match(decisao.motivo, /consulta_cand_complementar_2026\.zip=403/)
})

test("vigia dispara com CDN aberto e sem sucesso recente", () => {
  const [, financas] = alvosPendentes([])
  const runs: RunResumo[] = [
    { status: "completed", conclusion: "cancelled", createdAt: "2026-09-26T14:42:39Z" },
    { status: "completed", conclusion: "success", createdAt: "2026-09-24T10:40:00Z" },
  ]
  assert.deepEqual(decidir(financas, sondaAberta(financas.urls, 200), runs, agora).disparar, true)
})

test("vigia não duplica execução em curso nem sucesso das últimas 20 h", () => {
  const [roster] = alvosPendentes([])
  const sonda = sondaAberta(roster.urls)
  assert.equal(
    decidir(roster, sonda, [{ status: "queued", conclusion: null, createdAt: "2026-09-26T19:50:00Z" }], agora).disparar,
    false,
  )
  assert.equal(
    decidir(roster, sonda, [{ status: "completed", conclusion: "success", createdAt: "2026-09-26T08:41:00Z" }], agora)
      .disparar,
    false,
  )
})

test("download de pacote aceita só o CDN do TSE", () => {
  assert.deepEqual(
    lerArgumentos(["--url=https://cdn.tse.jus.br/estatistica/sead/odsele/a.zip", "--out=.tse/a.zip"]),
    { url: "https://cdn.tse.jus.br/estatistica/sead/odsele/a.zip", out: ".tse/a.zip" },
  )
  assert.throws(() => lerArgumentos(["--url=https://example.com/a.zip", "--out=a.zip"]), /fora do CDN/)
  assert.throws(() => lerArgumentos(["--out=a.zip"]), /uso/)
})

test("workflows do TSE: dry-run fora do grupo de escrita e retentativa configurada", () => {
  const ler = (nome: string) => readFileSync(new URL(`../.github/workflows/${nome}`, import.meta.url), "utf8")
  const vigia = ler("tse-cdn-watcher.yml")
  assert.match(vigia, /cron: "\d+ \*\/2 \* \* \*"/)
  assert.match(vigia, /actions: write/)
  assert.doesNotMatch(vigia, /SUPABASE/)

  for (const nome of ["roster-deputados.yml", "tse-2026-financas.yml", "rehash-doador-cpf-v2.yml"]) {
    const workflow = ler(nome)
    assert.match(workflow, /PF_TSE_DOWNLOAD_RETRY_WINDOW_MS: "\d+"/, nome)
    assert.match(workflow, /PF_TSE_DOWNLOAD_TIMEOUT_MS: "\d+"/, nome)
    assert.match(workflow, /-dry-run'/, `${nome}: dry-run precisa de grupo próprio`)
  }
  assert.match(ler("roster-deputados.yml"), /scripts\/baixar-pacote-tse\.ts/)
  assert.match(ler("checagens-coleta.yml"), /'ingest-pipeline' \|\| 'checagens-coleta-dry-run'/)
})
