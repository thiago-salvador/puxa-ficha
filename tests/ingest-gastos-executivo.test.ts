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
  extras: {
    ugCodigo?: string
    ugNome?: string
    portador?: string | null
    estabelecimento?: string | null
  } = {},
) {
  return {
    id,
    mesExtrato,
    valorTransacao,
    estabelecimento: extras.estabelecimento === undefined
      ? { nome: "Sigiloso" }
      : extras.estabelecimento === null
        ? null
        : { nome: extras.estabelecimento },
    portador: extras.portador === undefined
      ? { nome: "Sigiloso" }
      : extras.portador === null
        ? null
        : { nome: extras.portador },
    unidadeGestora: {
      codigo: extras.ugCodigo ?? "110322",
      nome: extras.ugNome ?? "GABINETE DE SEGURANCA INSTITUCIONAL/PR",
      orgaoVinculado: { codigoSIAFI: codigoOrgao, nome: nomeOrgao },
    },
  }
}

const GSI = {
  ug_codigo: "110322",
  ug_nome: "GABINETE DE SEGURANCA INSTITUCIONAL/PR",
} as const

function countsSigilo(sigiloso: number, nominado: number, ausente: number) {
  return {
    qtd_portador_sigiloso: sigiloso,
    qtd_portador_nominado: nominado,
    qtd_portador_ausente: ausente,
    qtd_estabelecimento_sigiloso: sigiloso,
    qtd_estabelecimento_nominado: nominado,
    qtd_estabelecimento_ausente: ausente,
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
  assert.equal(resultado.orgao_codigo, "20101")
  assert.equal(resultado.orgao_nome, "Presidência da República")
  assert.equal(resultado.mes_extrato, "2023-01-01")
  assert.equal(resultado.valor_total, 123.46)
  assert.equal(resultado.qtd_transacoes, 3)
  assert.equal(resultado.unidades.length, 1)
  assert.equal(resultado.unidades[0].ug_codigo, GSI.ug_codigo)
  assert.equal(resultado.unidades[0].ug_nome, GSI.ug_nome)
  assert.equal(resultado.unidades[0].valor_total, 123.46)
  assert.equal(resultado.unidades[0].qtd_transacoes, 3)
  const somaUgs = resultado.unidades.reduce((sum, ug) => sum + ug.valor_total, 0)
  assert.equal(somaUgs, resultado.valor_total)
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
    unidades: [],
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
  assert.deepEqual(serie[0].unidades, [])
  assert.equal(serie[1].unidades.length, 1)
  assert.equal(serie[1].unidades[0].ug_codigo, GSI.ug_codigo)
})

test("agrega o mês por unidade gestora e a soma das UGs fecha o total do órgão", async () => {
  const modulo = await carregarModulo()
  const resultado = await modulo.coletarMesCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2023",
    apiKey: "chave-teste",
    fetchPage: async (url: URL) => {
      const pagina = Number(url.searchParams.get("pagina"))
      if (pagina === 1) {
        return [
          transacao(1, "100,10"),
          transacao(2, "20,20", "20101", "Presidência da República", "01/2023", {
            ugCodigo: "110001",
            ugNome: "SECRETARIA-GERAL/PR",
          }),
        ]
      }
      if (pagina === 2) {
        return [
          transacao(3, "3,16"),
          transacao(4, "10,00", "20101", "Presidência da República", "01/2023", {
            ugCodigo: "110001",
            ugNome: "SECRETARIA-GERAL/PR",
          }),
        ]
      }
      return []
    },
  })

  assert.equal(resultado.valor_total, 133.46)
  assert.equal(resultado.qtd_transacoes, 4)
  assert.deepEqual(
    resultado.unidades.map((ug) => [ug.ug_codigo, ug.valor_total, ug.qtd_transacoes]).sort(),
    [
      ["110001", 30.2, 2],
      ["110322", 103.26, 2],
    ].sort(),
  )
  const somaUgs = resultado.unidades.reduce((sum, ug) => sum + ug.valor_total, 0)
  assert.equal(Number(somaUgs.toFixed(2)), resultado.valor_total)
})

test("conta portador e estabelecimento em sigiloso, nominado e ausente, e nunca publica o token Sigiloso", async () => {
  const modulo = await carregarModulo()
  assert.equal(modulo.classificarCampoSigilo("Sigiloso", modulo.FEDERAL_CPGF_PORTADOR_RULE), "sigiloso")
  assert.equal(modulo.classificarCampoSigilo("MARIA SILVA", modulo.FEDERAL_CPGF_PORTADOR_RULE), "nominado")
  assert.equal(modulo.classificarCampoSigilo(null, modulo.FEDERAL_CPGF_PORTADOR_RULE), "ausente")
  assert.equal(modulo.classificarCampoSigilo("  ", modulo.FEDERAL_CPGF_PORTADOR_RULE), "ausente")
  assert.equal(modulo.nomePublicavelPortador("Sigiloso", modulo.FEDERAL_CPGF_PORTADOR_RULE), null)
  assert.equal(modulo.nomePublicavelPortador("MARIA SILVA", modulo.FEDERAL_CPGF_PORTADOR_RULE), "MARIA SILVA")
  assert.equal(
    modulo.nomePublicavelPortador("MARIA SILVA", {
      classifiedTokens: ["Sigiloso"],
      publishHolderNames: false,
    }),
    null,
    "portal estadual só publica nome quando a fonte nomeia e a regra autoriza",
  )

  const resultado = await modulo.coletarMesCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2023",
    apiKey: "chave-teste",
    fetchPage: async (url: URL) => {
      const pagina = Number(url.searchParams.get("pagina"))
      if (pagina !== 1) return []
      return [
        transacao(1, "10,00"),
        transacao(2, "20,00", "20101", "Presidência da República", "01/2023", {
          portador: "JOAO PORTADOR",
          estabelecimento: "POSTO CENTRAL",
        }),
        transacao(3, "30,00", "20101", "Presidência da República", "01/2023", {
          portador: null,
          estabelecimento: null,
        }),
        transacao(4, "40,00", "20101", "Presidência da República", "01/2023", {
          ugCodigo: "110001",
          ugNome: "SECRETARIA-GERAL/PR",
          portador: "Sigiloso",
          estabelecimento: "Sigiloso",
        }),
      ]
    },
  })

  const gsi = resultado.unidades.find((ug) => ug.ug_codigo === "110322")
  const sg = resultado.unidades.find((ug) => ug.ug_codigo === "110001")
  assert.ok(gsi)
  assert.ok(sg)
  assert.deepEqual(
    {
      qtd_portador_sigiloso: gsi.qtd_portador_sigiloso,
      qtd_portador_nominado: gsi.qtd_portador_nominado,
      qtd_portador_ausente: gsi.qtd_portador_ausente,
      qtd_estabelecimento_sigiloso: gsi.qtd_estabelecimento_sigiloso,
      qtd_estabelecimento_nominado: gsi.qtd_estabelecimento_nominado,
      qtd_estabelecimento_ausente: gsi.qtd_estabelecimento_ausente,
    },
    {
      qtd_portador_sigiloso: 1,
      qtd_portador_nominado: 1,
      qtd_portador_ausente: 1,
      qtd_estabelecimento_sigiloso: 1,
      qtd_estabelecimento_nominado: 1,
      qtd_estabelecimento_ausente: 1,
    },
  )
  assert.deepEqual(
    {
      qtd_portador_sigiloso: sg.qtd_portador_sigiloso,
      qtd_portador_nominado: sg.qtd_portador_nominado,
      qtd_portador_ausente: sg.qtd_portador_ausente,
      qtd_estabelecimento_sigiloso: sg.qtd_estabelecimento_sigiloso,
      qtd_estabelecimento_nominado: sg.qtd_estabelecimento_nominado,
      qtd_estabelecimento_ausente: sg.qtd_estabelecimento_ausente,
    },
    countsSigilo(1, 0, 0),
  )
  assert.equal(
    JSON.stringify(resultado).includes("Sigiloso"),
    false,
    "o token de classificação da fonte não pode virar nome persistido",
  )
})

test("data-fim limita a janela a um único mês para dry-run", async () => {
  const modulo = await carregarModulo()
  const args = modulo.parseArgs([
    "--slug=lula",
    "--codigo-orgao=20101",
    "--data-inicio=01/2026",
    "--data-fim=01/2026",
  ])
  assert.equal(args.dataInicio, "01/2026")
  assert.equal(args.dataFim, "01/2026")
  assert.deepEqual(
    modulo.listarMeses(args.dataInicio, new Date("2026-08-20T12:00:00-03:00"), args.dataFim),
    ["01/2026"],
  )
  assert.throws(
    () => modulo.parseArgs(["--data-inicio=02/2026", "--data-fim=01/2026"]),
    /data-fim.*antes|data-inicio.*depois/i,
  )
})

const CSV_CPGF_JAN_2026 = [
  "CÓDIGO ÓRGÃO;NOME ÓRGÃO;CÓDIGO UNIDADE GESTORA;NOME UNIDADE GESTORA;ANO EXTRATO;MÊS EXTRATO;NOME PORTADOR;NOME FAVORECIDO;VALOR TRANSAÇÃO",
  "20101;Presidência da República;110322;GABINETE DE SEGURANCA INSTITUCIONAL/PR;2026;1;Sigiloso;Sigiloso;20000,00",
  "20101;Presidência da República;110322;GABINETE DE SEGURANCA INSTITUCIONAL/PR;2026;1;Sigiloso;Sigiloso;2,00",
  "20101;Presidência da República;110001;SECRETARIA DE ADMINISTRACAO/PR;2026;1;MARIA SILVA;POSTO CENTRAL;10,00",
  "22201;INCRA;999;OUTRA UG;2026;1;JOAO;POSTO;99,00",
].join("\n")

test("agrega o download oficial do CPGF por UG, filtra o órgão e não persiste linha bruta", async () => {
  const modulo = await carregarModulo()
  assert.equal(
    modulo.urlDownloadCpgf("01/2026"),
    "https://portaldatransparencia.gov.br/download-de-dados/cpgf/202601",
  )
  const csv = modulo.agregarMesCsvCpgf({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2026",
    csv: CSV_CPGF_JAN_2026,
  })
  assert.equal(csv.qtd_transacoes, 3)
  assert.equal(csv.valor_total, 20_012)
  assert.equal(csv.unidades.length, 2)
  const gsi = csv.unidades.find((ug) => ug.ug_codigo === "110322")
  const adm = csv.unidades.find((ug) => ug.ug_codigo === "110001")
  assert.ok(gsi)
  assert.ok(adm)
  assert.equal(gsi.valor_total, 20_002)
  assert.equal(gsi.qtd_transacoes, 2)
  assert.equal(gsi.qtd_portador_sigiloso, 2)
  assert.equal(adm.valor_total, 10)
  assert.equal(adm.qtd_portador_nominado, 1)
  assert.equal(JSON.stringify(csv).includes("Sigiloso"), false)
  assert.equal(JSON.stringify(csv).includes("MARIA SILVA"), false)
})

test("quando a API trunca o milhar e a contagem por UG bate, o valor persistido é o do CSV", async () => {
  const modulo = await carregarModulo()
  const api = await modulo.coletarMesCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2026",
    apiKey: "chave-teste",
    fetchPage: async (url: URL) => {
      if (Number(url.searchParams.get("pagina")) !== 1) return []
      return [
        transacao(1, "2,00", "20101", "Presidência da República", "01/2026"),
        transacao(2, "2,00", "20101", "Presidência da República", "01/2026"),
        transacao(3, "10,00", "20101", "Presidência da República", "01/2026", {
          ugCodigo: "110001",
          ugNome: "SECRETARIA DE ADMINISTRACAO/PR",
          portador: "MARIA SILVA",
          estabelecimento: "POSTO CENTRAL",
        }),
      ]
    },
  })
  assert.equal(api.valor_total, 14)

  const csv = modulo.agregarMesCsvCpgf({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2026",
    csv: CSV_CPGF_JAN_2026,
  })
  const rec = modulo.reconciliarMesCartoesCsv({
    api,
    csv,
    fonteCsv: modulo.urlDownloadCpgf("01/2026"),
  })

  assert.equal(rec.persistivel, true)
  assert.equal(rec.motivo, "valor_csv")
  assert.equal(rec.valorCorrigidoPeloCsv, true)
  assert.equal(rec.deltaReais, 19_998)
  assert.ok(rec.mes)
  assert.equal(rec.mes.valor_total, 20_012)
  assert.notEqual(rec.mes.valor_total, api.valor_total)
  assert.equal(rec.fonte, modulo.urlDownloadCpgf("01/2026"))
  const gsi = rec.mes.unidades.find((ug) => ug.ug_codigo === "110322")
  assert.ok(gsi)
  assert.equal(gsi.valor_total, 20_002)
  assert.doesNotMatch(JSON.stringify(rec.mes), /2,00/)
})

test("não inventa 20.000 a partir de 2,00: sem CSV o mês não é persistível", async () => {
  const modulo = await carregarModulo()
  const api = await modulo.coletarMesCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2026",
    apiKey: "chave-teste",
    fetchPage: async (url: URL) => {
      if (Number(url.searchParams.get("pagina")) !== 1) return []
      return [transacao(1, "2,00", "20101", "Presidência da República", "01/2026")]
    },
  })
  const rec = modulo.reconciliarMesCartoesCsv({
    api,
    csv: modulo.agregarMesCsvCpgf({
      codigoOrgao: "20101",
      orgaoNome: "Presidência da República",
      mes: "01/2026",
      csv: "",
    }),
    fonteCsv: modulo.urlDownloadCpgf("01/2026"),
  })
  assert.equal(rec.persistivel, false)
  assert.equal(rec.motivo, "csv_ausente")
  assert.equal(rec.mes, null)
})

test("apply aborta se o CSV existe e a contagem por UG diverge da API", async () => {
  const modulo = await carregarModulo()
  const api = await modulo.coletarMesCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2026",
    apiKey: "chave-teste",
    fetchPage: async (url: URL) => {
      if (Number(url.searchParams.get("pagina")) !== 1) return []
      return [transacao(1, "10,00", "20101", "Presidência da República", "01/2026")]
    },
  })
  const csv = modulo.agregarMesCsvCpgf({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "01/2026",
    csv: CSV_CPGF_JAN_2026,
  })
  const rec = modulo.reconciliarMesCartoesCsv({
    api,
    csv,
    fonteCsv: modulo.urlDownloadCpgf("01/2026"),
  })
  assert.equal(rec.persistivel, false)
  assert.equal(rec.motivo, "grao_diverge")
  assert.throws(
    () => modulo.assertSerieAplicavel([rec]),
    /grão|grao|contagem|unidade gestora/i,
  )
})

test("mês com CSV ainda não publicado não entra no apply e não dispara o gate de grão", async () => {
  const modulo = await carregarModulo()
  const api = await modulo.coletarMesCartoes({
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
    mes: "08/2026",
    apiKey: "chave-teste",
    fetchPage: async (url: URL) => {
      if (Number(url.searchParams.get("pagina")) !== 1) return []
      return [transacao(1, "10,00", "20101", "Presidência da República", "08/2026")]
    },
  })
  const rec = modulo.reconciliarMesCartoesCsv({
    api,
    csv: modulo.agregarMesCsvCpgf({
      codigoOrgao: "20101",
      orgaoNome: "Presidência da República",
      mes: "08/2026",
      csv: "",
    }),
    fonteCsv: modulo.urlDownloadCpgf("08/2026"),
  })
  assert.equal(rec.motivo, "csv_ausente")
  assert.deepEqual(modulo.mesesPersistiveis([rec]), [])
  assert.doesNotThrow(() => modulo.assertSerieAplicavel([rec]))
})

