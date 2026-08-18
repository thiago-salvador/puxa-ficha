import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
import test from "node:test"

const SCRIPT = join(process.cwd(), "scripts/ingest-gastos-executivo.ts")

async function carregarModulo(): Promise<typeof import("../scripts/ingest-gastos-executivo")> {
  assert.ok(existsSync(SCRIPT), "o ingest de gastos do Executivo ainda não existe")
  return import(pathToFileURL(SCRIPT).href)
}

function transacao(
  id: number,
  valorTransacao: string,
  codigoOrgao = "20101",
  nomeOrgao = "Presidência da República",
  mesExtrato = "01/2023",
) {
  return {
    id,
    mesExtrato,
    valorTransacao,
    estabelecimento: { nome: "Sigiloso" },
    portador: { nome: "Sigiloso" },
    unidadeGestora: {
      codigo: "110322",
      nome: "GABINETE DE SEGURANCA INSTITUCIONAL/PR",
      orgaoVinculado: { codigoSIAFI: codigoOrgao, nome: nomeOrgao },
    },
  }
}

test("converte valor do Portal com milhar e vírgula decimal", async () => {
  const modulo = await carregarModulo()
  assert.equal(modulo.parseValorTransacao("1.234.567,89"), 1_234_567.89)
  assert.throws(() => modulo.parseValorTransacao("não informado"), /valorTransacao/i)
})

test("pagina até a primeira página vazia e agrega soma e contagem do mês", async () => {
  const modulo = await carregarModulo()
  const paginas: number[] = []
  const chaves: string[] = []

  const resultado = await modulo.coletarMesCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2023",
    apiKey: "chave-teste",
    fetchPage: async (url: URL, apiKey: string) => {
      const pagina = Number(url.searchParams.get("pagina"))
      paginas.push(pagina)
      chaves.push(apiKey)
      assert.equal(url.searchParams.get("codigoOrgao"), "20101")
      assert.equal(url.searchParams.get("mesExtratoInicio"), "01/2023")
      assert.equal(url.searchParams.get("mesExtratoFim"), "01/2023")
      if (pagina === 1) return [transacao(1, "100,10"), transacao(2, "20,20")]
      if (pagina === 2) return [transacao(3, "3,16")]
      return []
    },
  })

  assert.deepEqual(paginas, [1, 2, 3])
  assert.deepEqual(chaves, ["chave-teste", "chave-teste", "chave-teste"])
  assert.deepEqual(resultado, {
    orgao_codigo: "20101",
    orgao_nome: "Presidência da República",
    mes_extrato: "2023-01-01",
    valor_total: 123.46,
    qtd_transacoes: 3,
  })
})

test("mês consultado sem transações permanece zero confirmado no relatório", async () => {
  const modulo = await carregarModulo()
  const resultado = await modulo.coletarMesCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "02/2023",
    apiKey: "chave-teste",
    fetchPage: async () => [],
  })

  assert.deepEqual(resultado, {
    orgao_codigo: "20101",
    orgao_nome: "Presidência da República",
    mes_extrato: "2023-02-01",
    valor_total: 0,
    qtd_transacoes: 0,
  })
})

test("prova o filtro aceito contra um parâmetro inventado que o Portal ignora", async () => {
  const modulo = await carregarModulo()
  const chamadas: URL[] = []

  await modulo.validarFiltroCodigoOrgao({
    codigoOrgao: "20101",
    mes: "01/2023",
    apiKey: "chave-teste",
    fetchPage: async (url: URL) => {
      chamadas.push(url)
      if (url.searchParams.has("codigoOrgao")) {
        return [transacao(1, "10,00")]
      }
      return [transacao(2, "20,00", "22201", "INCRA")]
    },
  })

  assert.equal(chamadas.length, 2)
  assert.equal(chamadas[0].searchParams.get("codigoOrgao"), "20101")
  assert.equal(chamadas[1].searchParams.get("codigoOrgaoInexistente"), "20101")
  assert.equal(chamadas[1].searchParams.has("codigoOrgao"), false)
})

test("repete bloqueio transitório do CloudFront com backoff limitado", async () => {
  const modulo = await carregarModulo()
  const { fetchPortalPage } = modulo

  let tentativas = 0
  const esperas: number[] = []
  const rows = await fetchPortalPage(new URL("https://example.test/cartoes"), "chave", {
    minIntervalMs: 0,
    maxAttempts: 3,
    sleep: async (ms: number) => {
      esperas.push(ms)
    },
    fetchImpl: async () => {
      tentativas += 1
      if (tentativas < 3) {
        return new Response("Request blocked by CloudFront", { status: 403 })
      }
      return new Response(JSON.stringify([transacao(1, "10,00")]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    },
  })

  assert.equal(tentativas, 3)
  assert.deepEqual(esperas, [5_000, 15_000])
  assert.equal(rows.length, 1)
})

test("vincula slug, código e nome do órgão antes de permitir apply", async () => {
  const modulo = await carregarModulo()

  assert.equal(modulo.parseArgs([]).orgaoNome, "Presidência da República")
  assert.throws(
    () => modulo.parseArgs(["--slug=bolsonaro", "--codigo-orgao=20101", "--apply"]),
    /vínculo.*slug|slug.*vínculo/i,
  )
  assert.throws(
    () => modulo.parseArgs(["--slug=lula", "--codigo-orgao=22201", "--apply"]),
    /20101|órgão.*lula/i,
  )
})

test("mantém mês inicial vazio e prova o filtro no primeiro mês com transações", async () => {
  const modulo = await carregarModulo()
  const controles: string[] = []

  const serie = await modulo.coletarSerieCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    meses: ["01/2023", "02/2023"],
    apiKey: "chave-teste",
    fetchPage: async (url: URL) => {
      const mes = url.searchParams.get("mesExtratoInicio")!
      const pagina = Number(url.searchParams.get("pagina"))
      if (url.searchParams.has("codigoOrgaoInexistente")) {
        controles.push(mes)
        return [transacao(90, "1,00", "22201", "INCRA", mes)]
      }
      if (mes === "01/2023" || pagina > 1) return []
      return [transacao(2, "25,50", "20101", "Presidência da República", mes)]
    },
  })

  assert.deepEqual(controles, ["02/2023"])
  assert.deepEqual(serie.map((row) => [row.mes_extrato, row.qtd_transacoes, row.orgao_nome]), [
    ["2023-01-01", 0, "Presidência da República"],
    ["2023-02-01", 1, "Presidência da República"],
  ])
})
