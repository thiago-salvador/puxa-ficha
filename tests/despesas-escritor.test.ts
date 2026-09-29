import assert from "node:assert/strict"
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { normalizarDespesas, type ResultadoNormalizacao } from "../scripts/lib/despesas-normalizar"
import { decidirAplicacao, planejarDespesas, shaDoPlanoDespesas, type CandidaturaColetada, type CandidaturaVinculada } from "../scripts/lib/despesas-plano"
import {
  CODIGO_REVALIDACAO_NAO_CONFIRMADA,
  completarCargoDaCandidaturaAtual,
  lerArgsDespesas,
  lerArquivoColeta,
  main,
  planejarEAplicar,
  revalidarFichasPublicas,
  salvarPrivado,
  SCHEMA_COLETA,
  TAG_FICHA_PUBLICA,
} from "../scripts/tse-despesas"
import { documentoPj } from "./fixtures/despesas/carregar"

function resultado(sq: string, ano: number, valor: number, totalOficial: number | null = valor): ResultadoNormalizacao {
  return normalizarDespesas(
    [{ tipo: "Publicidade por adesivos", valorCentavos: Math.round(valor * 100), documentoFornecedor: documentoPj(1), nomeFornecedor: "GRAFICA FICTICIA LTDA", descricao: null }],
    { origemTotalContratado: "oficial", total_despesas_contratadas: totalOficial, total_despesas_pagas: null, total_doacoes_a_terceiros_oficial: null, recursos_financeiros: null, recursos_estimaveis: null, divida_campanha: null, sobra_financeira: null },
    { ano_eleicao: ano, sq_candidato: sq, uf: "AP", municipio_codigo: null, cargo_candidatura: "Senador", prestacao_parcial: false, data_entrega: null, id_ultima_entrega: null, tipo_entrega: null, fonte: "teste", fonte_url: null, coletado_em: "2026-09-29T12:00:00.000Z" },
  )
}

function coleta(sq: string, ano: number, valor: number, totalOficial?: number | null): CandidaturaColetada {
  const r = resultado(sq, ano, valor, totalOficial === undefined ? valor : totalOficial)
  return { ano_eleicao: ano, sq_candidato: sq, resultado: r.divergencias.length ? "rejeitado" : "coletado", normalizado: r }
}

const contextoAp = { uf: "AP", cargo_candidatura: "SENADOR" }
const vinculadas: CandidaturaVinculada[] = [
  { candidato_id: "id-pessoa-b", slug: "pessoa-b", ano_eleicao: 2022, sq_candidato: "7000000102", ...contextoAp },
  { candidato_id: "id-pessoa-b", slug: "pessoa-b", ano_eleicao: 2022, sq_candidato: "7000000103", ...contextoAp },
  { candidato_id: "id-pessoa-a", slug: "pessoa-a", ano_eleicao: 2022, sq_candidato: "7000000101", ...contextoAp },
  { candidato_id: "id-pessoa-x", slug: "pessoa-x", ano_eleicao: 2022, sq_candidato: "7000000300", ...contextoAp },
  { candidato_id: "id-pessoa-y", slug: "pessoa-y", ano_eleicao: 2022, sq_candidato: "7000000300", ...contextoAp },
]

test("colisão de candidatura: mesma pessoa, dois SQs no mesmo ano, duas linhas com chaves distintas", () => {
  const plano = planejarDespesas({ vinculadas, coletas: [coleta("7000000102", 2022, 10), coleta("7000000103", 2022, 20)] })
  assert.equal(plano.acoes.length, 2)
  const chaves = plano.acoes.map((a) => `${a.linha.candidato_id}|${a.linha.ano_eleicao}|${a.linha.sq_candidato}`)
  assert.deepEqual(chaves, ["id-pessoa-b|2022|7000000102", "id-pessoa-b|2022|7000000103"])
  assert.deepEqual(plano.acoes.map((a) => a.linha.total_despesas_contratadas), [10, 20])
})

test("só grava candidatura cujo SQ bate com a candidatura ligada; o resto vai para revisão", () => {
  const plano = planejarDespesas({
    vinculadas,
    coletas: [
      coleta("7000000101", 2022, 5),
      coleta("7000000199", 2022, 5),
      coleta("7000000101", 2018, 5),
      coleta("7000000300", 2022, 5),
      coleta("7000000102", 2022, 5, 6),
      { ano_eleicao: 2022, sq_candidato: "7000000103", resultado: "erro", motivo: "sq_ausente_do_pacote", normalizado: null },
    ],
  })
  assert.deepEqual(plano.acoes.map((a) => [a.slug, a.linha.sq_candidato]), [["pessoa-a", "7000000101"]])
  assert.deepEqual(plano.revisao.map((r) => [r.ano_eleicao, r.sq_candidato, r.motivo]), [
    [2018, "7000000101", "sq_sem_candidatura_vinculada"],
    [2022, "7000000102", "divergencia_de_conferencia"],
    [2022, "7000000103", "coleta_sem_resultado"],
    [2022, "7000000199", "sq_sem_candidatura_vinculada"],
    [2022, "7000000300", "sq_ligado_a_mais_de_um_candidato"],
  ])
  assert.equal(plano.resumo.revisao_por_motivo.divergencia_de_conferencia, 1)
})

test("coleta duplicada da mesma candidatura não grava nenhuma das duas", () => {
  const plano = planejarDespesas({ vinculadas, coletas: [coleta("7000000101", 2022, 5), coleta("7000000101", 2022, 6)] })
  assert.equal(plano.acoes.length, 0)
  assert.deepEqual(plano.revisao.map((r) => r.motivo), ["coleta_duplicada", "coleta_duplicada"])
})

test("SHA do plano é estável e muda quando uma linha muda", () => {
  const a = planejarDespesas({ vinculadas, coletas: [coleta("7000000101", 2022, 5)] })
  const b = planejarDespesas({ vinculadas, coletas: [coleta("7000000101", 2022, 5)] })
  const c = planejarDespesas({ vinculadas, coletas: [coleta("7000000101", 2022, 6)] })
  assert.equal(shaDoPlanoDespesas(a), shaDoPlanoDespesas(b))
  assert.notEqual(shaDoPlanoDespesas(a), shaDoPlanoDespesas(c))
})

test("escritor recusa --apply sem SHA ou com SHA diferente do plano", () => {
  const sha = "a".repeat(64)
  assert.deepEqual(decidirAplicacao({ aplicar: false, expectedPlanSha: null }, sha, 3), { aplicar: false, codigo: 0, motivo: "dry-run: nada gravado" })
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: null }, sha, 3).codigo, 2)
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: "xyz" }, sha, 3).codigo, 2)
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: "b".repeat(64) }, sha, 3).codigo, 3)
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: sha.toUpperCase() }, sha, 3).aplicar, true)
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: sha }, sha, 0).aplicar, false)
})

test("CLI: --apply sem --expected-plan-sha sai com código 2 antes de ler o banco", async () => {
  const dir = mkdtempSync(join(tmpdir(), "despesas-cli-"))
  const erroOriginal = console.error
  try {
    const arquivo = join(dir, "coleta.json")
    writeFileSync(arquivo, JSON.stringify({ schema: SCHEMA_COLETA, gerado_em: "2026-09-29T12:00:00.000Z", origem: "historico", candidaturas: [] }))
    console.error = () => {}
    assert.equal(await main([`--coleta=${arquivo}`, "--apply", `--out=${dir}`]), 2)
  } finally {
    console.error = erroOriginal
    rmSync(dir, { recursive: true, force: true })
  }
})

test("plano e recibo ficam fora do repositório, modo 0600", () => {
  assert.throws(() => salvarPrivado(join(process.cwd(), "reports"), "plano.json", {}), /fora do repositório/)
  const dir = mkdtempSync(join(tmpdir(), "despesas-plano-"))
  try {
    const caminho = salvarPrivado(join(dir, "privado"), "plano.json", { ok: true })
    assert.equal(statSync(caminho).mode & 0o777, 0o600)
    assert.equal(statSync(join(dir, "privado")).mode & 0o777, 0o700)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("contexto eleitoral: coleta do AP ligada a candidatura do RJ vai para revisão, nunca para o banco", () => {
  const ligadaNoRj: CandidaturaVinculada[] = [
    { candidato_id: "id-pessoa-a", slug: "pessoa-a", ano_eleicao: 2022, sq_candidato: "7000000101", uf: "RJ", cargo_candidatura: "Senador" },
  ]
  const plano = planejarDespesas({ vinculadas: ligadaNoRj, coletas: [coleta("7000000101", 2022, 5)] })
  assert.equal(plano.acoes.length, 0)
  assert.deepEqual(plano.revisao.map((r) => [r.sq_candidato, r.motivo, r.detalhe]), [
    ["7000000101", "contexto_eleitoral_divergente", "coleta uf diferente ou ausente na candidatura ligada"],
  ])
})

test("contexto eleitoral: cargo diferente ou UF/cargo ausente no vínculo também vão para revisão", () => {
  for (const [uf, cargo, campos] of [
    ["AP", "Deputado Federal", "cargo"],
    [null, "Senador", "uf"],
    ["AP", null, "cargo"],
  ] as const) {
    const plano = planejarDespesas({
      vinculadas: [{ candidato_id: "id-pessoa-a", slug: "pessoa-a", ano_eleicao: 2022, sq_candidato: "7000000101", uf, cargo_candidatura: cargo }],
      coletas: [coleta("7000000101", 2022, 5)],
    })
    assert.equal(plano.acoes.length, 0, `${uf}/${cargo}`)
    assert.equal(plano.revisao[0]?.motivo, "contexto_eleitoral_divergente")
    assert.equal(plano.revisao[0]?.detalhe, `coleta ${campos} diferente ou ausente na candidatura ligada`)
  }
  // Mesma UF e cargo com caixa e acento diferentes: grava.
  const plano = planejarDespesas({
    vinculadas: [{ candidato_id: "id-pessoa-a", slug: "pessoa-a", ano_eleicao: 2022, sq_candidato: "7000000101", uf: "ap", cargo_candidatura: "Senador" }],
    coletas: [coleta("7000000101", 2022, 5)],
  })
  assert.equal(plano.acoes.length, 1)
})

test("arquivo de coleta com documento no cargo ou na fonte é recusado", () => {
  const dir = mkdtempSync(join(tmpdir(), "despesas-coleta-doc-"))
  try {
    for (const campo of ["cargo_candidatura", "fonte"] as const) {
      const r = resultado("7000000101", 2022, 5)
      const linha = { ...r.linha, [campo]: "SENADOR 123 456 789 01" }
      const arquivo = join(dir, `${campo}.json`)
      writeFileSync(arquivo, JSON.stringify({
        schema: SCHEMA_COLETA,
        gerado_em: "2026-09-29T12:00:00.000Z",
        origem: "historico",
        candidaturas: [{ ano_eleicao: 2022, sq_candidato: "7000000101", resultado: "coletado", normalizado: { ...r, linha } }],
      }))
      assert.throws(() => lerArquivoColeta(arquivo), /documento em campo público/, campo)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function respostaRevalidacao(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } })
}

test("revalidação: mesmo POST dos jobs de ingest, confirmada só com 200, ok e a tag da ficha", async () => {
  const chamadas: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: String(url), init })
    return respostaRevalidacao(200, { ok: true, status: 200, revalidated: [TAG_FICHA_PUBLICA], rejected: [] })
  }) as typeof fetch
  assert.deepEqual(await revalidarFichasPublicas({ segredo: "segredo-teste", fetcher }), { confirmada: true })
  assert.equal(chamadas[0]?.url, "https://puxaficha.com.br/api/revalidate")
  assert.equal(chamadas[0]?.init?.method, "POST")
  assert.equal((chamadas[0]?.init?.headers as Record<string, string>)["x-pf-revalidate-secret"], "segredo-teste")
  assert.deepEqual(JSON.parse(String(chamadas[0]?.init?.body)), { tags: [TAG_FICHA_PUBLICA] })

  for (const [status, corpo] of [
    [503, { ok: false, reason: "env_missing", revalidated: [] }],
    [200, { ok: false, revalidated: [] }],
    [200, { ok: true, revalidated: ["public-candidatos"] }],
    [200, "sem json"],
  ] as const) {
    const falho = (async () => respostaRevalidacao(status, corpo)) as unknown as typeof fetch
    const resultado = await revalidarFichasPublicas({ segredo: "s", fetcher: falho })
    assert.equal(resultado.confirmada, false, JSON.stringify(corpo))
  }
  const rede = (async () => { throw new Error("offline") }) as unknown as typeof fetch
  assert.equal((await revalidarFichasPublicas({ segredo: "s", fetcher: rede })).confirmada, false)
  assert.deepEqual(await revalidarFichasPublicas({ segredo: " ", fetcher }), { confirmada: false, motivo: "PF_REVALIDATE_SECRET ausente" })
  assert.equal(chamadas.length, 1, "sem segredo não há POST")
})

async function aplicarComMocks(revalidacao: { confirmada: true } | { confirmada: false; motivo: string }) {
  const dir = mkdtempSync(join(tmpdir(), "despesas-apply-"))
  const eventos: string[] = []
  const logOriginal = console.log
  const erroOriginal = console.error
  try {
    const coletas = [coleta("7000000101", 2022, 5)]
    const arquivo = join(dir, "coleta.json")
    writeFileSync(arquivo, JSON.stringify({ schema: SCHEMA_COLETA, gerado_em: "2026-09-29T12:00:00.000Z", origem: "historico", candidaturas: coletas }))
    const sha = shaDoPlanoDespesas(planejarDespesas({ vinculadas, coletas }))
    console.log = () => {}
    console.error = (...args: unknown[]) => { eventos.push(`erro:${args.map(String).join(" ")}`) }
    const codigo = await planejarEAplicar(
      lerArgsDespesas([`--coleta=${arquivo}`, "--apply", `--expected-plan-sha=${sha}`, `--out=${join(dir, "saida")}`]),
      {
        carregar: async () => vinculadas,
        gravar: async (plano) => { eventos.push(`gravar:${plano.acoes.length}`); return { gravadas: plano.acoes.length, falhas: [] } },
        revalidar: async () => { eventos.push("revalidar"); return revalidacao },
      },
    )
    return { codigo, eventos }
  } finally {
    console.log = logOriginal
    console.error = erroOriginal
    rmSync(dir, { recursive: true, force: true })
  }
}

test("escritor revalida a ficha pública depois de gravar", async () => {
  const { codigo, eventos } = await aplicarComMocks({ confirmada: true })
  assert.equal(codigo, 0)
  assert.deepEqual(eventos, ["gravar:1", "revalidar"])
})

test("escritor falha alto quando a revalidação não é confirmada", async () => {
  const { codigo, eventos } = await aplicarComMocks({ confirmada: false, motivo: "HTTP 503" })
  assert.equal(codigo, CODIGO_REVALIDACAO_NAO_CONFIRMADA)
  assert.deepEqual(eventos.slice(0, 2), ["gravar:1", "revalidar"])
  assert.match(eventos[2] ?? "", /erro:FALHA: .*NÃO foi revalidado.*HTTP 503/)
})

test("CLI: --apply sem PF_REVALIDATE_SECRET sai com código 2 antes de ler o banco", async () => {
  const dir = mkdtempSync(join(tmpdir(), "despesas-cli-segredo-"))
  const erroOriginal = console.error
  const segredoOriginal = process.env.PF_REVALIDATE_SECRET
  const erros: string[] = []
  try {
    delete process.env.PF_REVALIDATE_SECRET
    const arquivo = join(dir, "coleta.json")
    writeFileSync(arquivo, JSON.stringify({ schema: SCHEMA_COLETA, gerado_em: "2026-09-29T12:00:00.000Z", origem: "historico", candidaturas: [] }))
    console.error = (...args: unknown[]) => { erros.push(args.map(String).join(" ")) }
    assert.equal(await main([`--coleta=${arquivo}`, "--apply", `--expected-plan-sha=${"a".repeat(64)}`, `--out=${dir}`]), 2)
    assert.match(erros.join("\n"), /PF_REVALIDATE_SECRET/)
  } finally {
    console.error = erroOriginal
    if (segredoOriginal === undefined) delete process.env.PF_REVALIDATE_SECRET
    else process.env.PF_REVALIDATE_SECRET = segredoOriginal
    rmSync(dir, { recursive: true, force: true })
  }
})

test("2026 sem cargo no vínculo (produção): cargo vem de candidatos.cargo_disputado e a candidatura vira ação", () => {
  const semCargo: CandidaturaVinculada[] = [
    { candidato_id: "id-atual", slug: "atual", ano_eleicao: 2026, sq_candidato: "7000002026", uf: "AP", cargo_candidatura: null },
    { candidato_id: "id-antigo", slug: "antigo", ano_eleicao: 2022, sq_candidato: "7000002022", uf: "AP", cargo_candidatura: null },
    { candidato_id: "id-conflito", slug: "conflito", ano_eleicao: 2026, sq_candidato: "7000002027", uf: "AP", cargo_candidatura: "(conflito entre financiamento e verificações)" },
  ]
  const cargos = new Map([["id-atual", "Senador"], ["id-antigo", "Senador"], ["id-conflito", "Senador"]])
  const completas = completarCargoDaCandidaturaAtual(semCargo, cargos)
  assert.equal(completas[0].cargo_candidatura, "Senador", "2026 nulo recebe o cargo disputado")
  assert.equal(completas[1].cargo_candidatura, null, "ano anterior não usa o cargo disputado atual")
  assert.equal(completas[2].cargo_candidatura, "(conflito entre financiamento e verificações)", "conflito não é sobrescrito")

  const antes = planejarDespesas({ vinculadas: semCargo, coletas: [coleta("7000002026", 2026, 10)] })
  assert.equal(antes.acoes.length, 0, "sem o complemento, o cargo nulo manda para revisão")
  const depois = planejarDespesas({ vinculadas: completas, coletas: [coleta("7000002026", 2026, 10)] })
  assert.equal(depois.acoes.length, 1, "com o cargo disputado, a candidatura atual é gravável")
  assert.equal(depois.revisao.length, 0)
})
