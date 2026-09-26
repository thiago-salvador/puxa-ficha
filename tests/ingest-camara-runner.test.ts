import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { afterEach, describe, it } from "node:test"
import { parse } from "yaml"

import { CAMARA_SONDA_URL, resultadoSemAlcance, sondarAlcanceCamara } from "../scripts/lib/camara-alcance"
import { comCausaDeRede, fetchJSON, type FetchRelogio } from "../scripts/lib/helpers"

/**
 * Bloqueio de 26/09/2026: a API da Câmara parou de aceitar conexão dos runners
 * hospedados do GitHub (0 de 96 conexões TCP, UND_ERR_CONNECT_TIMEOUT). Estes
 * testes cobrem o pré-voo que encerra a fonte em ~1 min, o código de rede que
 * passa a aparecer na mensagem, e o contrato do workflow que manda a Câmara
 * para o runner da variável PF_INGEST_CAMARA_RUNNER.
 */

const fetchOriginal = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

function relogioFalso(): FetchRelogio & { esperas: number[] } {
  let agora = 0
  const esperas: number[] = []
  return {
    esperas,
    now: () => agora,
    sleep: async (ms: number) => {
      esperas.push(ms)
      agora += ms
    },
    random: () => 0.5,
  }
}

function erroDeConexao(): Error {
  const causa = Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" })
  return new TypeError("fetch failed", { cause: causa })
}

describe("comCausaDeRede", () => {
  it("acrescenta o código do undici e mantém o prefixo `fetch failed`", () => {
    const erro = comCausaDeRede(erroDeConexao())
    assert.equal(erro.message, "fetch failed (UND_ERR_CONNECT_TIMEOUT)")
    assert.equal((erro.cause as Error).message, "fetch failed")
  })

  it("devolve o próprio erro quando não há código ou ele já está na mensagem", () => {
    const semCodigo = new TypeError("fetch failed")
    assert.equal(comCausaDeRede(semCodigo), semCodigo)
    const jaTem = Object.assign(new Error("x (ECONNRESET)"), { cause: { code: "ECONNRESET" } })
    assert.equal(comCausaDeRede(jaTem), jaTem)
  })

  it("converte valor que não é Error", () => {
    assert.equal(comCausaDeRede("quebrou").message, "quebrou")
  })

  it("chega à mensagem final de fetchJSON depois das tentativas", async () => {
    globalThis.fetch = async () => {
      throw erroDeConexao()
    }
    await assert.rejects(
      fetchJSON("https://exemplo.invalid/x", undefined, 2, 1_000, { relogio: relogioFalso(), budgetMs: 60_000 }),
      /^Error: fetch failed \(UND_ERR_CONNECT_TIMEOUT\)$/,
    )
  })
})

describe("sondarAlcanceCamara", () => {
  it("devolve ok quando a API responde 200, com uma única chamada ao endpoint mínimo", async () => {
    const chamadas: string[] = []
    globalThis.fetch = async (input) => {
      chamadas.push(String(input))
      return new Response(JSON.stringify({ dados: [] }), { status: 200 })
    }
    assert.deepEqual(await sondarAlcanceCamara({ relogio: relogioFalso() }), { ok: true })
    assert.deepEqual(chamadas, [CAMARA_SONDA_URL])
  })

  it("desiste em 3 tentativas com o código de rede no motivo", async () => {
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      throw erroDeConexao()
    }
    const relogio = relogioFalso()
    const alcance = await sondarAlcanceCamara({ relogio })
    assert.equal(chamadas, 3)
    assert.deepEqual(relogio.esperas, [2_000, 6_000])
    assert.deepEqual(alcance, { ok: false, motivo: "fetch failed (UND_ERR_CONNECT_TIMEOUT)" })
  })

  it("trata HTTP 4xx determinístico como inalcançável sem repetir", async () => {
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      return new Response("proibido", { status: 403 })
    }
    const alcance = await sondarAlcanceCamara({ relogio: relogioFalso() })
    assert.equal(chamadas, 1)
    assert.equal(alcance.ok, false)
    assert.match(!alcance.ok ? alcance.motivo : "", /^HTTP 403: /)
  })
})

describe("resultadoSemAlcance", () => {
  it("gera o mesmo formato de uma ficha que falhou, sem escrita", () => {
    const r = resultadoSemAlcance("lula", "fetch failed (UND_ERR_CONNECT_TIMEOUT)")
    assert.equal(r.source, "camara")
    assert.equal(r.candidato, "lula")
    assert.equal(r.rows_upserted, 0)
    assert.deepEqual(r.tables_updated, [])
    assert.equal(r.skipped, undefined)
    assert.equal(r.errors.length, 1)
    assert.match(r.errors[0], /inalcancavel deste runner \(fetch failed \(UND_ERR_CONNECT_TIMEOUT\)\)/)
  })
})

type Job = {
  "runs-on"?: unknown
  needs?: string[]
  if?: string
  steps?: { run?: string; name?: string }[]
}

describe("ingest.yml: job da Câmara", () => {
  const texto = readFileSync(".github/workflows/ingest.yml", "utf8")
  const workflow = parse(texto) as { on: Record<string, unknown>; jobs: Record<string, Job> }
  const camara = workflow.jobs["ingest-camara"]
  const rest = workflow.jobs["ingest-rest"]

  it("nunca roda em pull_request", () => {
    assert.deepEqual(Object.keys(workflow.on).sort(), ["schedule", "workflow_dispatch"])
  })

  it("tira o runner da variável, com o hospedado como padrão", () => {
    assert.equal(camara["runs-on"], `\${{ fromJSON(vars.PF_INGEST_CAMARA_RUNNER || '"ubuntu-latest"') }}`)
  })

  it("roda depois do REST, mesmo com ele pulado, e só quando a Câmara foi pedida", () => {
    assert.deepEqual(camara.needs, ["ingest-rest"])
    assert.match(camara.if ?? "", /!cancelled\(\)/)
    assert.match(camara.if ?? "", /github\.event_name == 'schedule'/)
    assert.match(camara.if ?? "", /contains\(github\.event\.inputs\.sources, 'camara'\)/)
  })

  it("chama só a fonte camara, com a flag incremental opcional", () => {
    const run = camara.steps?.find((s) => s.name === "Ingestão Câmara")?.run ?? ""
    assert.match(run, /npx tsx scripts\/ingest-all\.ts camara \$FLAGS/)
    assert.match(run, /FLAGS="--skip-camara-validated"/)
  })

  it("REST não executa mais a Câmara nem depende dela para disparar", () => {
    const run = rest.steps?.find((s) => s.name === "Ingestão REST")?.run ?? ""
    assert.match(run, /^\s*camara\) ;;$/m)
    assert.doesNotMatch(run, /skip-camara-validated/)
    assert.doesNotMatch(rest.if ?? "", /'camara'/)
  })

  it("revalidação espera a Câmara", () => {
    assert.ok(workflow.jobs.revalidate.needs?.includes("ingest-camara"))
  })
})

describe("runner auto-hospedado: só o ingest.yml pode usá-lo", () => {
  it("nenhum outro workflow cita a variável, o rótulo ou `self-hosted`", () => {
    const dir = ".github/workflows"
    const ofensores = readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f) && f !== "ingest.yml")
      .filter((f) => /PF_INGEST_CAMARA_RUNNER|puxa-ficha-camara|self-hosted/.test(readFileSync(`${dir}/${f}`, "utf8")))
    assert.deepEqual(ofensores, [])
  })

  it("no ingest.yml, só o job da Câmara usa a variável", () => {
    const workflow = parse(readFileSync(".github/workflows/ingest.yml", "utf8")) as { jobs: Record<string, Job> }
    const usam = Object.entries(workflow.jobs)
      .filter(([, job]) => JSON.stringify(job["runs-on"] ?? "").includes("PF_INGEST_CAMARA_RUNNER"))
      .map(([nome]) => nome)
    assert.deepEqual(usam, ["ingest-camara"])
  })
})
