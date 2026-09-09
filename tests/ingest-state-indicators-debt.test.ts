import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { ingestSiconfi, interpretarSiconfi, anosSiconfi, type SiconfiItem } from "../scripts/lib/ingest-siconfi"
import { ingestIdeb, interpretarPlanilhaIdeb, descobrirFonteIdeb, IDEB_RESULTADOS_URL } from "../scripts/lib/ingest-ideb"
import { ingestAtlasViolencia, normalizarAtlasValor } from "../scripts/lib/ingest-atlas-violencia"

const noSleep = async () => {}
function conta(cod: string, coluna: string, valor = 42.19, extra: Partial<SiconfiItem> = {}): SiconfiItem {
  return { exercicio: 2024, periodo: 3, cod_ibge: 35, uf: "SP", esfera: "E", co_poder: "E",
    anexo: "RGF-Anexo 01", cod_conta: cod, conta: cod, coluna, valor, ...extra }
}
const pessoal = () => [
  conta("DespesaComPessoalTotal", "Valor", 105811548439.06),
  conta("DespesaComPessoalTotal", "% sobre a RCL Ajustada"),
  conta("LimiteMaximoDespesaComPessoalTotal", "% sobre a RCL Ajustada", 49),
]
function rreo(anexo: string): SiconfiItem[] {
  const extra = { periodo: 6, anexo }
  return anexo === "RREO-Anexo 01" ? [
    conta("TotalReceitas", "PREVISÃO INICIAL", 999, extra),
    conta("TotalReceitas", "Até o Bimestre (c)", 100, extra),
    conta("TotalDespesas", "DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)", 90, extra),
  ] : [conta("ResultadoPrimarioComRPPSAcimaDaLinha", "VALOR", -5, extra)]
}
const fiscalFetch = async (url: string) => {
  const anexo = new URL(url).searchParams.get("no_anexo")!
  return { items: anexo.startsWith("RGF") ? pessoal() : rreo(anexo), hasMore: false, offset: 0, limit: 5000 }
}

test("SICONFI inclui o último ano encerrado e admite recuperação explícita de 2025", async () => {
  assert.deepEqual(anosSiconfi(new Date("2026-09-09T00:00:00Z")), [2022, 2023, 2024, 2025])
  assert.deepEqual(anosSiconfi(new Date("2027-01-01T00:00:00Z")), [2022, 2023, 2024, 2025, 2026])
  const [result] = await ingestSiconfi({ estados: ["SP"], anos: [2025], deps: {
    fetchJson: async (url) => {
      assert.equal(new URL(url).searchParams.get("an_exercicio"), "2025")
      const response = await fiscalFetch(url)
      return { ...response, items: response.items.map((row) => ({ ...row, exercicio: 2025 })) }
    }, write: async (row) => { assert.equal(row.ano, 2025) }, sleep: noSleep,
  } })
  assert.equal(result.coleta_resultado, "encontrado"); assert.equal(result.rows_upserted, 4)
  await assert.rejects(ingestSiconfi({ anos: [new Date().getUTCFullYear()] }), /último ano encerrado/)
})

test("SICONFI execução padrão consulta o último exercício encerrado, preservando 2022", async () => {
  const requested = new Set<number>()
  await ingestSiconfi({ estados: ["SP"], deps: {
    fetchJson: async (url) => {
      requested.add(Number(new URL(url).searchParams.get("an_exercicio")))
      return { items: [], hasMore: false, offset: 0, limit: 5000 }
    }, write: async () => { assert.fail("fonte vazia não deve escrever") }, sleep: noSleep,
  } })
  assert.equal(Math.min(...requested), 2022)
  assert.equal(Math.max(...requested), new Date().getUTCFullYear() - 1)
})

test("SICONFI seleciona a coluna percentual e o limite declarado pelo ente", () => {
  const rows = interpretarSiconfi(pessoal(), "SP", 2024, "RGF-Anexo 01")
  assert.equal(rows[0].valor, 42.19)
  assert.equal(rows[0].unidade, "percentual")
  const items = pessoal(); items[2].valor = 60
  assert.equal(interpretarSiconfi(items, "SP", 2024, "RGF-Anexo 01")[0].metadata.limite_constitucional, 60)
})

test("SICONFI distingue realizado de previsão e preserva primário negativo", () => {
  assert.deepEqual(interpretarSiconfi(rreo("RREO-Anexo 01"), "SP", 2024, "RREO-Anexo 01").map((r) => r.valor), [100, 90])
  assert.equal(interpretarSiconfi(rreo("RREO-Anexo 06"), "SP", 2024, "RREO-Anexo 06")[0].valor, -5)
})

test("SICONFI usa o código da edição 2022 sem rotular sua metodologia como edição 2024", () => {
  const rows = [conta("RREO6ResultadoPrimarioEstadosMunicipios", "VALOR", 12,
    { exercicio: 2022, periodo: 6, anexo: "RREO-Anexo 06" })]
  const [row] = interpretarSiconfi(rows, "SP", 2022, "RREO-Anexo 06")
  assert.equal(row.valor, 12)
  assert.equal(row.metadata.metodologia, "acima_da_linha_edicao_2022")
})

test("SICONFI recusa conta ausente, duplicada, valor não numérico e UF divergente", () => {
  assert.throws(() => interpretarSiconfi([pessoal()[0]], "SP", 2024, "RGF-Anexo 01"), /única/)
  assert.throws(() => interpretarSiconfi([...pessoal(), pessoal()[1]], "SP", 2024, "RGF-Anexo 01"), /única/)
  assert.throws(() => interpretarSiconfi(pessoal().map((r) => ({ ...r, uf: "RJ" })), "SP", 2024, "RGF-Anexo 01"), /diverge/)
  const bad = pessoal(); bad[1].valor = "42.19" as unknown as number
  assert.throws(() => interpretarSiconfi(bad, "SP", 2024, "RGF-Anexo 01"), /valor inválido/)
})

test("SICONFI declara encontrado apenas após quatro escritas confirmadas", async () => {
  const writes: unknown[] = []
  const [r] = await ingestSiconfi({ estados: ["SP"], anos: [2024], deps: {
    fetchJson: fiscalFetch, write: async (row) => { writes.push(row) }, sleep: noSleep,
  } })
  assert.equal(writes.length, 4); assert.equal(r.rows_upserted, 4)
  assert.equal(r.coleta_resultado, "encontrado")
})

test("SICONFI percorre a paginação antes de interpretar e escrever", async () => {
  let calls = 0
  const [r] = await ingestSiconfi({ estados: ["SP"], anos: [2024], deps: {
    fetchJson: async (url) => {
      calls++
      const u = new URL(url)
      if (!u.pathname.endsWith("/rgf")) return fiscalFetch(url)
      const offset = Number(u.searchParams.get("offset"))
      return { items: pessoal().slice(offset, offset + 1), hasMore: offset < 2, offset, limit: 1 }
    }, write: async () => {}, sleep: noSleep,
  } })
  assert.equal(calls, 5); assert.equal(r.rows_upserted, 4)
})

test("SICONFI com apenas parte dos anexos disponíveis mantém coleta indeterminada", async () => {
  const [r] = await ingestSiconfi({ estados: ["SP"], anos: [2024], deps: {
    fetchJson: async (url) => new URL(url).pathname.endsWith("/rgf") ? fiscalFetch(url)
      : { items: [], hasMore: false, offset: 0, limit: 5000 },
    write: async () => {}, sleep: noSleep,
  } })
  assert.equal(r.rows_upserted, 1); assert.equal(r.coleta_resultado, "indeterminado")
})

test("SICONFI não conta escrita recusada e não confunde falha de rede com vazio", async () => {
  for (const deps of [
    { fetchJson: fiscalFetch, write: async () => { throw new Error("write denied") } },
    { fetchJson: async () => { throw new Error("HTTP 503") }, write: async () => {} },
  ]) {
    const [r] = await ingestSiconfi({ estados: ["SP"], anos: [2024], deps: { ...deps, sleep: noSleep } })
    assert.equal(r.rows_upserted, 0); assert.equal(r.coleta_resultado, "erro"); assert.deepEqual(r.tables_updated, [])
  }
  const [r] = await ingestSiconfi({ estados: ["SP"], anos: [2024], deps: {
    fetchJson: async () => ({ items: [], hasMore: false, offset: 0, limit: 5000 }), write: async () => { assert.fail("não escrever") }, sleep: noSleep,
  } })
  assert.equal(r.coleta_resultado, "vazio_confirmado")
  await assert.rejects(ingestSiconfi({ anos: [] }), /exercícios suportados/)
})

const NOMES = ["Rondônia", "Acre", "Amazonas", "Roraima", "Pará", "Amapá", "Tocantins", "Maranhão", "Piauí", "Ceará", "R. G. do Norte", "Paraíba", "Pernambuco", "Alagoas", "Sergipe", "Bahia", "Minas Gerais", "Espírito Santo", "Rio de Janeiro", "São Paulo", "Paraná", "Santa Catarina", "R. G. do Sul", "M. G. do Sul", "Mato Grosso", "Goiás", "Distrito Federal"]
async function planilha(edit?: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet("UF e Regiões (EM)")
  sheet.getCell("A4").value = "Ensino Médio Regular"
  sheet.getCell("A9").value = "Região/\nUnidade da Federação"; sheet.getCell("B9").value = "Rede"
  sheet.getRow(10).values = [null, null, "VL_OBSERVADO_2019", "VL_OBSERVADO_2021", "VL_OBSERVADO_2023", "VL_OBSERVADO_2025", "VL_PROJECAO_2019", "VL_PROJECAO_2021"]
  NOMES.forEach((nome, i) => { sheet.getRow(i + 11).values = [nome, "Estadual", 4, 4.1, 4.2, 4.3, 4.5, 4.7] })
  edit?.(sheet)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

test("IDEB lê 27 UFs da rede estadual e anos pelos cabeçalhos sem inventar meta 2023", async () => {
  const rows = await interpretarPlanilhaIdeb(await planilha((sheet) => { sheet.mergeCells("A50:B50") }))
  assert.equal(rows.length, 108); assert.equal(new Set(rows.map((r) => r.estado)).size, 27)
  assert.ok(rows.filter((r) => r.ano === 2023).every((r) => r.meta === null))
  assert.equal(rows.find((r) => r.estado === "RN")?.valor, 4)
  assert.equal(Math.max(...rows.map((r) => r.ano)), 2025)
  assert.ok(rows.filter((r) => r.ano === 2025).every((r) => r.meta === null))
})

test("IDEB descobre a edição mais recente em data-url e baixa só link estadual observado", async () => {
  const visited: string[] = []
  const url = "https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip"
  const fonte = await descobrirFonteIdeb(async (page) => {
    visited.push(page)
    return page === IDEB_RESULTADOS_URL + "/"
      ? '<div data-url="' + IDEB_RESULTADOS_URL + '/2005-2023"></div><div data-url="' + IDEB_RESULTADOS_URL + '/2005-2025"></div>'
      : '<a href="' + url + '">UFs</a><a href="https://example.com/arquivo.zip">Outro</a>'
  })
  assert.deepEqual(fonte, { fonteUrl: url, anoEdicao: 2025 })
  assert.equal(visited[1], IDEB_RESULTADOS_URL + "/2005-2025")
})

test("IDEB em 2028 seleciona edição 2027 relativa sem recuar para 2025 absoluta", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2028-01-15T00:00:00Z") })
  for (const relative of ["2005-2027", new URL(IDEB_RESULTADOS_URL).pathname + "/2005-2027"]) {
    const visited: string[] = []
    const fonte = await descobrirFonteIdeb(async (page) => {
      visited.push(page)
      return page === IDEB_RESULTADOS_URL + "/"
        ? '<a href="' + IDEB_RESULTADOS_URL + '/2005-2025">Anterior</a><div data-url="' + relative + '"></div>'
        : '<a href="//download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2027.zip">Atual</a>'
    })
    assert.equal(fonte.anoEdicao, 2027)
    assert.equal(visited[1], IDEB_RESULTADOS_URL + "/2005-2027")
    assert.equal(visited.length, 2)
  }
  await assert.rejects(descobrirFonteIdeb(async (page) => {
    if (page === IDEB_RESULTADOS_URL + "/") return '<a href="' + IDEB_RESULTADOS_URL + '/2005-2025"></a><a href="2005-2027"></a>'
    assert.equal(page, IDEB_RESULTADOS_URL + "/2005-2027")
    throw new Error("edição 2027 indisponível")
  }), /2027 indisponível/)
})

test("IDEB resolve ZIP relativo na origem oficial efetiva e recusa origem errada", async () => {
  const fonte = await descobrirFonteIdeb(async (page) => page === IDEB_RESULTADOS_URL + "/"
    ? '<div data-url="2005-2025"></div>'
    : { url: "https://download.inep.gov.br/ideb/resultados/2005-2025",
      html: '<a href="/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip">UFs</a>' })
  assert.equal(fonte.fonteUrl, "https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip")
  await assert.rejects(descobrirFonteIdeb(async (page) => page === IDEB_RESULTADOS_URL + "/"
    ? '<div data-url="2005-2025"></div>'
    : '<a href="/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip">Origem gov.br, não download.inep.gov.br</a>'), /arquivo estadual/)
})

test("IDEB verifica response.url e recusa redirecionamento HTML externo ou fora do caminho", async (t) => {
  let destination = "https://example.com/resultados/"
  t.mock.method(globalThis, "fetch", async () => {
    const response = new Response('<div data-url="' + IDEB_RESULTADOS_URL + '/2005-2025"></div>')
    Object.defineProperty(response, "url", { value: destination })
    return response
  })
  for (const url of ["https://example.com/resultados/", "https://www.gov.br/conta/login", "https://www.gov.br.evil.test/inep", "https://download.inep.gov.br/outro/"]) {
    destination = url
    await assert.rejects(descobrirFonteIdeb(), /destino HTML fora/)
  }
})

test("IDEB rejeita edição antiga, arquivo de outro ano, edição futura e formato desconhecido", async () => {
  for (const [edicao, arquivo] of [[2023, 2023], [2025, 2023], [2099, 2099]]) {
    await assert.rejects(descobrirFonteIdeb(async (page) => page === IDEB_RESULTADOS_URL + "/"
      ? '<div data-url="' + IDEB_RESULTADOS_URL + '/2005-' + edicao + '"></div>'
      : '<a href="https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_' + arquivo + '.zip">UFs</a>'), /IDEB:/)
  }
  await assert.rejects(descobrirFonteIdeb(async () => "<p>Layout desconhecido</p>"), /edição verificável/)
  await assert.rejects(interpretarPlanilhaIdeb(await planilha(), 2023), /edição antiga/)
  await assert.rejects(interpretarPlanilhaIdeb(await planilha((sheet) => { sheet.getCell("F10").value = "VL_OBSERVADO_2023" })), /cabeçalho duplicado/)
  await assert.rejects(interpretarPlanilhaIdeb(await planilha((sheet) => { sheet.getCell("F10").value = null })), /ano observado ausente: 2025/)
})

test("IDEB recusa cobertura incompleta, UF duplicada, valores ilegíveis e cabeçalho ausente", async () => {
  for (const change of [
    (s: ExcelJS.Worksheet) => { s.getCell("B11").value = "Privada" },
    (s: ExcelJS.Worksheet) => { s.getCell("A12").value = "Rondônia" },
    (s: ExcelJS.Worksheet) => { s.getCell("C11").value = "4x" },
    (s: ExcelJS.Worksheet) => { s.getCell("C10").value = "VL_OBSERVADO_2018" },
  ]) await assert.rejects(interpretarPlanilhaIdeb(await planilha(change)), /IDEB:/)
})

test("IDEB mantém supressão como ausência, zero observado como zero e erro de escrita como erro", async () => {
  const bytes = await planilha((s) => { s.getCell("C11").value = "**"; s.getCell("D11").value = 0 })
  const rows = await interpretarPlanilhaIdeb(bytes)
  assert.equal(rows[0].valor, null); assert.equal(rows[1].valor, 0)
  const partial = await ingestIdeb({ download: async () => ({ bytes, sha256: "fixture", fonteUrl: "https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip", anoEdicao: 2025 }), write: async () => {} })
  assert.equal(partial[0].rows_upserted, 26)
  assert.equal(partial[0].coleta_resultado, "indeterminado")
  const results = await ingestIdeb({ download: async () => ({ bytes, sha256: "fixture", fonteUrl: "https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip", anoEdicao: 2025 }), write: async () => { throw new Error("write denied") } })
  assert.ok(results.every((r) => r.coleta_resultado === "erro" && r.rows_upserted === 0))
})

test("IDEB indisponibilidade de download não vira lista vazia", async () => {
  const results = await ingestIdeb({ download: async () => { throw new Error("TLS certificate") }, write: async () => { assert.fail("não escrever") } })
  assert.ok(results.every((r) => r.coleta_resultado === "erro" && r.errors[0] === "TLS certificate"))
})

test("IDEB todas as células suprimidas mantém indeterminado, nunca ausência confirmada", async () => {
  const bytes = await planilha((sheet) => {
    for (let row = 11; row <= 37; row++) {
      for (const col of [3, 4, 5, 6]) sheet.getRow(row).getCell(col).value = "**"
    }
  })
  const results = await ingestIdeb({ download: async () => ({ bytes, sha256: "fixture", fonteUrl: "https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip", anoEdicao: 2025 }),
    write: async () => { assert.fail("dado suprimido não deve ser escrito") } })
  assert.ok(results.every((r) => r.coleta_resultado === "indeterminado" && r.rows_upserted === 0 && r.warnings?.length === 27))
})

test("IDEB publica todos os 108 valores com proveniência e conta somente escritas confirmadas", async () => {
  const bytes = await planilha()
  let writes = 0
  const results = await ingestIdeb({ download: async () => ({ bytes, sha256: "fixture", fonteUrl: "https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip", anoEdicao: 2025 }), write: async (row) => {
    assert.equal(row.metadata.rede, "Estadual")
    assert.equal(row.metadata.arquivo_sha256, "fixture")
    assert.equal(row.unidade, "indice")
    if (row.ano === 2023) assert.equal(row.metadata.meta, null)
    writes++
  } })
  assert.equal(writes, 108)
  assert.ok(results.every((r) => r.coleta_resultado === "encontrado" && r.rows_upserted === 27))
})

const catalogo = { data: [{ id: 52, Titulo: "Taxa de Homicídios Mulheres" }], meta: { pagination: { page: 1, pageCount: 1, total: 1 } } }
const atlasItem = (id = 20) => ({ valor: 12.5, periodo: "2024-01-15T00:00:00.000Z", serie_id: id, tipo_regiao: 3, regiao_id: 35 })
test("Atlas rejeita valor parcialmente numérico, negativo, ano futuro e abrangência errada", () => {
  for (const extra of [{ valor: "12,5" }, { valor: "12x" }, { valor: "" }, { valor: -1 }, { periodo: "2099-01-15T00:00:00.000Z" }, { tipo_regiao: 8 }]) {
    assert.equal(normalizarAtlasValor({ ...atlasItem(), ...extra }), null)
  }
  assert.equal(normalizarAtlasValor({ ...atlasItem(), valor: 0 })?.valor, 0)
  for (const valor of [null, false, true, [], {}, [1]]) {
    assert.equal(normalizarAtlasValor({ ...atlasItem(), valor } as unknown as Parameters<typeof normalizarAtlasValor>[0]), null)
  }
})

test("Atlas não fabrica zero nem escreve quando taxa chega null, booleana ou array", async () => {
  for (const valor of [null, false, true, [], {}, [1]]) {
    let writes = 0
    const results = await ingestAtlasViolencia({ fetchJson: async (url) => url.includes("cms/api") ? catalogo
      : [{ ...atlasItem(Number(url.split("/").at(-2))), valor }],
      write: async () => { writes++ }, sleep: noSleep })
    assert.equal(writes, 0)
    assert.ok(results.slice(0, 3).every((r) => r.coleta_resultado === "erro" && r.rows_upserted === 0))
  }
})

test("Atlas consulta séries 25/35 antes de declarar vazio e mantém feminicídios indeterminado", async () => {
  const urls: string[] = []
  const results = await ingestAtlasViolencia({ fetchJson: async (url) => { urls.push(url); return url.includes("cms/api") ? catalogo : [] }, write: async () => { assert.fail("não escrever") }, sleep: noSleep })
  assert.ok(urls.some((u) => u.endsWith("/25/3"))); assert.ok(urls.some((u) => u.endsWith("/35/3")))
  assert.ok(results.slice(0, 3).every((r) => r.coleta_resultado === "vazio_confirmado"))
  assert.equal(results[3].coleta_resultado, "indeterminado")
  assert.match(results[3].coleta_detalhe!, /não substituem/)
})

test("Atlas recusa série divergente e escrita negada, preservando zero escritas", async () => {
  for (const denied of [false, true]) {
    const results = await ingestAtlasViolencia({ fetchJson: async (url) => url.includes("cms/api") ? catalogo : [atlasItem(denied ? Number(url.split("/").at(-2)) : 999)],
      write: async () => { throw new Error("write denied") }, sleep: noSleep })
    assert.ok(results.slice(0, 3).every((r) => r.coleta_resultado === "erro" && r.rows_upserted === 0))
  }
})

test("Atlas não afirma ausência no catálogo parcial ou indisponível", async () => {
  const results = await ingestAtlasViolencia({ fetchJson: async (url) => url.includes("cms/api") ? { ...catalogo, meta: { pagination: { page: 1, pageCount: 1, total: 2 } } } : [], sleep: noSleep })
  assert.equal(results[3].coleta_resultado, "erro")
})

test("Atlas com UF faltante no ano mantém indeterminado; 27 UFs confirma encontrado", async () => {
  const ids = [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35, 41, 42, 43, 50, 51, 52, 53]
  for (const total of [26, 27]) {
    const results = await ingestAtlasViolencia({ fetchJson: async (url) => url.includes("cms/api") ? catalogo
      : ids.slice(0, total).map((regiao_id) => ({ ...atlasItem(Number(url.split("/").at(-2))), regiao_id })),
      write: async () => {}, sleep: noSleep })
    assert.ok(results.slice(0, 3).every((r) => r.coleta_resultado === (total === 27 ? "encontrado" : "indeterminado")))
  }
})
