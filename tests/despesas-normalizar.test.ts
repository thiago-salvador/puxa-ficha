import assert from "node:assert/strict"
import { test } from "node:test"

import {
  CATEGORIA_NAO_INFORMADA,
  normalizarDespesas,
  nomeSegueConvencaoCnpjCampanha,
  textoTemDocumento,
  type ContextoCandidatura,
  type DespesaItemEntrada,
  type TotaisEntrada,
} from "../scripts/lib/despesas-normalizar"
import { ELEICAO_SINTETICA } from "../scripts/lib/despesas-sanitizar-fixture"
import { normalizarColeta2026, validarEntrega } from "../scripts/tse-local/divulga-despesas"
import { carregarFixture2026, documentoPf, documentoPj } from "./fixtures/despesas/carregar"

const centavos = (valor: number) => Math.round(valor * 100)

function coletarFixture(nome: string, cargoCodigo = 3) {
  const fixture = carregarFixture2026(nome)
  const conta = fixture.consulta
  const entrega = validarEntrega(conta)
  assert.ok(entrega, `${nome}: entrega da fixture deve ser válida`)
  return {
    fixture,
    coleta: normalizarColeta2026({
      identity: {
        uf: String(conta.sgUe),
        sqCandidato: String(conta.idCandidato),
        cargoCodigo,
        partidoNumero: conta.nrPartido as number,
        numeroCandidato: conta.nrCandidato as number,
      },
      electionId: ELEICAO_SINTETICA,
      account: conta,
      entrega: entrega!,
      lista: fixture.itens,
      coletadoEm: "2026-09-29T12:00:00.000Z",
    }),
  }
}

const contexto: ContextoCandidatura = {
  ano_eleicao: 2026,
  sq_candidato: "9000000009",
  uf: "SP",
  municipio_codigo: null,
  cargo_candidatura: "Governador",
  prestacao_parcial: true,
  data_entrega: null,
  id_ultima_entrega: "7000000",
  tipo_entrega: "Relatório Financeiro",
  fonte: "teste",
  fonte_url: null,
  coletado_em: "2026-09-29T12:00:00.000Z",
}

function totaisOficiais(total: number | null, extra: Partial<TotaisEntrada> = {}): TotaisEntrada {
  return {
    origemTotalContratado: "oficial",
    total_despesas_contratadas: total,
    total_despesas_pagas: null,
    total_doacoes_a_terceiros_oficial: null,
    recursos_financeiros: null,
    recursos_estimaveis: null,
    divida_campanha: null,
    sobra_financeira: null,
    ...extra,
  }
}

function item(valor: number, extra: Partial<DespesaItemEntrada> = {}): DespesaItemEntrada {
  return {
    tipo: "Publicidade por materiais impressos",
    valorCentavos: centavos(valor),
    documentoFornecedor: documentoPj(1),
    nomeFornecedor: "GRAFICA FICTICIA LTDA",
    descricao: null,
    ...extra,
  }
}

test("conservação em centavos: itens reais fecham com o total contratado e com a concentração oficial", () => {
  const { fixture, coleta } = coletarFixture("2026-governador-a")
  const n = coleta.normalizado!
  assert.equal(coleta.resultado, "coletado")
  assert.deepEqual(n.divergencias, [])
  const despesas = fixture.consulta.despesas as Record<string, number>
  const somaItens = fixture.itens.reduce((s, i) => s + centavos(i.valor as number), 0)
  assert.equal(somaItens, centavos(despesas.totalDespesasContratadas))
  assert.equal(centavos(n.linha.total_despesas_contratadas!), somaItens)
  assert.equal(n.linha.concentracao_despesas.reduce((s, c) => s + centavos(c.valor), 0), somaItens)
  assert.equal(n.linha.concentracao_despesas.reduce((s, c) => s + c.quantidade, 0), fixture.itens.length)
  assert.equal(n.linha.total_despesas_pagas, despesas.totalDespesasPagas)
  assert.equal(n.linha.estado_coleta, "declarado")
  assert.equal(n.linha.id_ultima_entrega, "7000000")
  assert.equal(n.linha.tipo_entrega, "Relatório Financeiro")
  assert.equal(n.linha.data_entrega, "2026-09-26T16:51:00-03:00")
  assert.equal(n.linha.prestacao_parcial, true)
  assert.equal(n.linha.divida_campanha, null)
  assert.equal(n.linha.sobra_financeira, null)
})

test("fornecedores: top 10 só PJ por documento completo e uma linha PF agregada, sem documento", () => {
  const { fixture, coleta } = coletarFixture("2026-governador-a")
  const linha = coleta.normalizado!.linha
  const pj = linha.maiores_fornecedores.filter((f) => f.tipo === "PJ")
  const pf = linha.maiores_fornecedores.filter((f) => f.tipo === "PF_agregado")
  assert.equal(pj.length, 10)
  assert.equal(pf.length, 1)
  const itensPf = fixture.itens.filter((i) => typeof i.cpfCnpjFornecedor === "string" && (i.cpfCnpjFornecedor as string).length === 11)
  assert.equal(pf[0]!.quantidade, itensPf.length)
  assert.equal(pf[0]!.tipo === "PF_agregado" && pf[0]!.quantidade_prestadores, new Set(itensPf.map((i) => i.cpfCnpjFornecedor)).size)
  assert.equal(centavos(pf[0]!.valor), itensPf.reduce((s, i) => s + centavos(i.valor as number), 0))
  for (let i = 1; i < pj.length; i += 1) assert.ok(pj[i - 1]!.valor >= pj[i]!.valor)
  assert.equal(textoTemDocumento(linha.maiores_fornecedores), false)
  assert.ok(!JSON.stringify(linha.maiores_fornecedores).includes("PESSOA FICTICIA"))
})

test("ranking por documento completo: filiais da mesma raiz de CNPJ não se fundem", () => {
  const raiz = "1".repeat(8)
  const r = normalizarDespesas([
    item(100, { documentoFornecedor: `${raiz}000101`, nomeFornecedor: "REDE FICTICIA MATRIZ" }),
    item(60, { documentoFornecedor: `${raiz}000202`, nomeFornecedor: "REDE FICTICIA FILIAL" }),
  ], totaisOficiais(160), contexto)
  assert.deepEqual(r.linha.maiores_fornecedores.map((f) => f.tipo === "PJ" && [f.nome, f.valor]), [["REDE FICTICIA MATRIZ", 100], ["REDE FICTICIA FILIAL", 60]])
})

test("nome de MEI perde o CPF embutido em fornecedores e em doações", () => {
  const cpf = documentoPf(9)
  const r = normalizarDespesas([
    item(500, { documentoFornecedor: documentoPj(2), nomeFornecedor: `FULANO FICTICIO ${cpf}` }),
    item(40, { documentoFornecedor: documentoPj(3), nomeFornecedor: `BELTRANO FICTICIO ${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` }),
    item(70, { tipo: "Doações financeiras a outros candidatos/partidos", documentoFornecedor: documentoPj(4), nomeFornecedor: `ELEICAO 2026 CICLANO FICTICIO DEPUTADO FEDERAL ${cpf}` }),
  ], totaisOficiais(610), contexto)
  const nomes = r.linha.maiores_fornecedores.flatMap((f) => (f.tipo === "PJ" ? [f.nome] : []))
  assert.deepEqual(nomes, ["FULANO FICTICIO", "ELEICAO 2026 CICLANO FICTICIO DEPUTADO FEDERAL", "BELTRANO FICTICIO"])
  assert.equal(r.linha.doacoes_a_terceiros[0]!.destinatario_nome, "ELEICAO 2026 CICLANO FICTICIO DEPUTADO FEDERAL")
  assert.equal(textoTemDocumento([r.linha.maiores_fornecedores, r.linha.doacoes_a_terceiros]), false)
})

test("doações 2026: destinatário é o nomeFornecedor, fazem parte do total e da concentração e não são somadas de novo", () => {
  const { fixture, coleta } = coletarFixture("2026-presidente-doacoes", 1)
  const n = coleta.normalizado!
  assert.equal(coleta.resultado, "coletado")
  assert.deepEqual(n.divergencias, [])
  const despesas = fixture.consulta.despesas as Record<string, number>
  const itensDoacao = fixture.itens.filter((i) => String(i.tipoDespesa).startsWith("Doações financeiras"))
  assert.equal(n.linha.doacoes_a_terceiros.length, itensDoacao.length)
  assert.equal(centavos(n.linha.total_doacoes_a_terceiros!), centavos(despesas.doacoesOutrosCandidatosPartigos))
  assert.equal(centavos(n.linha.total_despesas_contratadas!), centavos(despesas.totalDespesasContratadas))
  const categoria = n.linha.concentracao_despesas.find((c) => c.tipo === "Doações financeiras a outros candidatos/partidos")
  assert.equal(categoria && centavos(categoria.valor), centavos(n.linha.total_doacoes_a_terceiros!))
  const nomesFornecedor = new Set(itensDoacao.map((i) => i.nomeFornecedor))
  for (const d of n.linha.doacoes_a_terceiros) {
    assert.equal(d.destinatario_tipo, "partido")
    assert.ok(nomesFornecedor.has(d.destinatario_nome), "destinatário vem do fornecedor")
    assert.ok(!String(d.destinatario_nome).includes("CANDIDATO FICTICIO"), "beneficiadoContratante nunca é destinatário")
    assert.equal(d.candidato_slug, null)
  }
})

test("doação a pessoa física ou sem pista de destinatário vira 'outro' sem nome", () => {
  const r = normalizarDespesas([
    item(30, { tipo: "Doações financeiras a outros candidatos/partidos", documentoFornecedor: documentoPf(5), nomeFornecedor: "PESSOA FICTICIA" }),
    item(20, {
      tipo: "Doações financeiras a outros candidatos/partidos",
      documentoFornecedor: documentoPj(6),
      nomeFornecedor: "DIRETORIO MUNICIPAL PARTIDO FICTICIO",
      destinatario: { sq: null, nome: "DIRETORIO MUNICIPAL PARTIDO FICTICIO", uf: null, cargo: null, partido: null, esferaPartidaria: null, contexto: "Direção Municipal / DOADOR FICTICIO - Governador" },
    }),
  ], totaisOficiais(50, { total_doacoes_a_terceiros_oficial: 50 }), contexto)
  assert.deepEqual(r.divergencias, [])
  const outro = r.linha.doacoes_a_terceiros.find((d) => d.destinatario_tipo === "outro")!
  assert.equal(outro.destinatario_nome, null)
  const partido = r.linha.doacoes_a_terceiros.find((d) => d.destinatario_tipo === "partido")!
  assert.equal(partido.destinatario_nome, "DIRETORIO MUNICIPAL PARTIDO FICTICIO")
  assert.equal(r.linha.total_doacoes_a_terceiros, 50)
  assert.equal(r.linha.total_despesas_contratadas, 50)
})

test("2026 com entrega e total ainda null: declarado com totais null, nunca 'sem prestação' nem zero", () => {
  // A fixture tem idUltimaEntrega e uma entrega parcial no histórico, mas a
  // consulta ainda não traz total nem itens.
  const { coleta } = coletarFixture("2026-governador-sem-prestacao")
  const linha = coleta.normalizado!.linha
  assert.equal(coleta.resultado, "coletado")
  assert.equal(linha.estado_coleta, "declarado")
  assert.equal(linha.id_ultima_entrega, "7000000")
  for (const campo of ["total_despesas_contratadas", "total_despesas_pagas", "total_doacoes_a_terceiros", "recursos_financeiros", "recursos_estimaveis", "divida_campanha", "sobra_financeira"] as const) {
    assert.equal(linha[campo], null, campo)
  }
  assert.deepEqual([linha.concentracao_despesas, linha.maiores_fornecedores, linha.doacoes_a_terceiros], [[], [], []])
})

test("sem nenhuma entrega (sem id de entrega e sem item): sem_prestacao com totais null", () => {
  for (const origem of ["oficial", "soma_itens"] as const) {
    const r = normalizarDespesas([], totaisOficiais(null, { origemTotalContratado: origem }), { ...contexto, id_ultima_entrega: null })
    assert.equal(r.linha.estado_coleta, "sem_prestacao", origem)
    assert.equal(r.linha.total_despesas_contratadas, null)
    assert.equal(r.linha.total_doacoes_a_terceiros, null)
  }
})

test("entrega registrada sem item e sem total: declarado, nunca sem_prestacao", () => {
  const r = normalizarDespesas([], totaisOficiais(null), contexto)
  assert.deepEqual(r.divergencias, [])
  assert.equal(r.linha.estado_coleta, "declarado")
  assert.equal(r.linha.total_despesas_contratadas, null)
  assert.equal(r.linha.total_doacoes_a_terceiros, null, "doações também não são zero")
})

test("2026 sem prestação de verdade: consulta toda null continua null, nunca zero", () => {
  const fixture = carregarFixture2026("2026-governador-sem-prestacao")
  const r = normalizarDespesas([], totaisOficiais(null), { ...contexto, id_ultima_entrega: null })
  const linha = r.linha
  assert.equal(fixture.itens.length, 0)
  assert.equal(linha.estado_coleta, "sem_prestacao")
  for (const campo of ["total_despesas_contratadas", "total_despesas_pagas", "total_doacoes_a_terceiros", "recursos_financeiros", "recursos_estimaveis", "divida_campanha", "sobra_financeira"] as const) {
    assert.equal(linha[campo], null, campo)
  }
  assert.deepEqual([linha.concentracao_despesas, linha.maiores_fornecedores, linha.doacoes_a_terceiros], [[], [], []])
})

test("despesa mínima real: dois itens fecham com o total", () => {
  const { fixture, coleta } = coletarFixture("2026-governador-minima")
  assert.equal(coleta.resultado, "coletado")
  assert.equal(coleta.normalizado!.linha.total_despesas_contratadas, (fixture.consulta.despesas as Record<string, number>).totalDespesasContratadas)
  assert.equal(coleta.normalizado!.linha.concentracao_despesas.length, 2)
})

test("zero declarado: total 0 com lista vazia é declarado, não sem prestação", () => {
  const r = normalizarDespesas([], totaisOficiais(0, { total_doacoes_a_terceiros_oficial: 0 }), contexto)
  assert.equal(r.linha.estado_coleta, "declarado")
  assert.equal(r.linha.total_despesas_contratadas, 0)
  assert.equal(r.linha.total_doacoes_a_terceiros, 0)
})

test("divergência em centavos vira falha tipada e preserva os agregados", () => {
  const { fixture } = coletarFixture("2026-governador-minima")
  const adulterada = structuredClone(fixture.itens)
  adulterada[0]!.valor = (adulterada[0]!.valor as number) + 0.01
  const conta = fixture.consulta
  const coleta = normalizarColeta2026({
    identity: { uf: String(conta.sgUe), sqCandidato: String(conta.idCandidato), cargoCodigo: 3, partidoNumero: conta.nrPartido as number, numeroCandidato: conta.nrCandidato as number },
    electionId: ELEICAO_SINTETICA,
    account: conta,
    entrega: validarEntrega(conta)!,
    lista: adulterada,
    coletadoEm: "2026-09-29T12:00:00.000Z",
  })
  assert.equal(coleta.resultado, "rejeitado")
  const n = coleta.normalizado!
  assert.equal(n.linha.estado_coleta, "falha_coleta")
  const soma = n.divergencias.find((d) => d.tipo === "soma_itens_diferente_do_total")
  assert.ok(soma && soma.tipo === "soma_itens_diferente_do_total" && soma.diferenca_centavos === 1)
  assert.ok(n.divergencias.some((d) => d.tipo === "concentracao_oficial_diferente"))
  assert.equal(n.linha.concentracao_despesas.length, 2, "agregados continuam disponíveis para revisão")
})

test("itens com total oficial null não viram zero nem declaração", () => {
  const r = normalizarDespesas([item(10)], totaisOficiais(null), contexto)
  assert.equal(r.linha.estado_coleta, "falha_coleta")
  assert.equal(r.linha.total_despesas_contratadas, null)
  assert.deepEqual(r.divergencias, [{ tipo: "itens_sem_total_oficial", quantidade_itens: 1 }])
})

test("categorias vazias e sentinelas viram 'Não informada' e nunca identidade", () => {
  const r = normalizarDespesas([
    item(1, { tipo: "#NULO", descricao: "Carro de som no bairro" }),
    item(2, { tipo: "-1", descricao: null }),
    item(3, { tipo: "-3", descricao: "#NULO" }),
    item(4, { tipo: "", descricao: "Aluguel de palco" }),
    item(5, { tipo: null, descricao: null }),
    item(6),
  ], totaisOficiais(21), contexto)
  assert.deepEqual(r.divergencias, [])
  const nao = r.linha.concentracao_despesas.find((c) => c.tipo === CATEGORIA_NAO_INFORMADA)!
  assert.deepEqual([nao.quantidade, nao.valor], [5, 15])
  assert.deepEqual(r.pendencias_jev.categorias_nao_informadas.map((p) => [p.descricao, p.tipo_original]), [
    ["Carro de som no bairro", "sentinela"],
    ["Aluguel de palco", "vazio"],
  ])
  assert.ok(!r.linha.concentracao_despesas.some((c) => ["#NULO", "-1", "-3", ""].includes(c.tipo)))
})

test("valores com erro de float saem arredondados em centavos: nenhum JSON com 11+ dígitos", () => {
  const r = normalizarDespesas([
    item(0.1, { tipo: "A" }),
    item(0.2, { tipo: "A" }),
    item(1234.56, { tipo: "B", documentoFornecedor: documentoPj(7) }),
    item(0.01, { tipo: "B", documentoFornecedor: documentoPj(7) }),
    item(0.07, { tipo: "C", documentoFornecedor: documentoPf(1) }),
    item(0.1, { tipo: "Doações financeiras a outros candidatos/partidos", documentoFornecedor: documentoPj(8), nomeFornecedor: "DIRETORIO FICTICIO" }),
    item(0.2, { tipo: "Doações financeiras a outros candidatos/partidos", documentoFornecedor: documentoPj(8), nomeFornecedor: "DIRETORIO FICTICIO" }),
  ], totaisOficiais(0.1 + 0.2 + 1234.56 + 0.01 + 0.07 + 0.1 + 0.2, {
    total_despesas_pagas: 0.1 + 0.2,
    total_doacoes_a_terceiros_oficial: 0.1 + 0.2,
    recursos_financeiros: 1234.5600000000001,
    recursos_estimaveis: 0.30000000000000004,
    divida_campanha: 1.1 + 2.2,
    sobra_financeira: 0.7 + 0.1,
  }), { ...contexto, sq_candidato: "9000000010" })
  assert.deepEqual(r.divergencias, [])
  const json = JSON.stringify(r.linha)
  assert.doesNotMatch(json, /\d{11,}/)
  assert.equal(r.linha.total_despesas_contratadas, 1235.24)
  assert.equal(r.linha.total_despesas_pagas, 0.3)
  assert.equal(r.linha.total_doacoes_a_terceiros, 0.3)
  assert.equal(r.linha.recursos_financeiros, 1234.56)
  assert.equal(r.linha.recursos_estimaveis, 0.3)
  assert.equal(r.linha.divida_campanha, 3.3)
  assert.equal(r.linha.sobra_financeira, 0.8)
  assert.deepEqual(r.linha.concentracao_despesas.find((c) => c.tipo === "A")!.valor, 0.3)
})

test("doação sem SQ: 'candidato' só com o nome do CNPJ de campanha e o mesmo ano da eleição", () => {
  const doacao = "Doações financeiras a outros candidatos/partidos"
  const r = normalizarDespesas([
    item(10, { tipo: doacao, documentoFornecedor: documentoPj(11), nomeFornecedor: "ELEICAO 2026 CICLANO FICTICIO GOVERNADOR" }),
    item(20, { tipo: doacao, documentoFornecedor: documentoPj(12), nomeFornecedor: "ELEICAO 2022 CICLANO FICTICIO GOVERNADOR" }),
    item(30, { tipo: doacao, documentoFornecedor: documentoPj(13), nomeFornecedor: "ELEICAO 2026 CICLANO FICTICIO" }),
    item(40, { tipo: doacao, documentoFornecedor: documentoPj(14), nomeFornecedor: "COMITE ELEICAO 2026 FICTICIO" }),
    item(50, { tipo: doacao, documentoFornecedor: documentoPj(15), nomeFornecedor: "DIRETORIO ESTADUAL PARTIDO FICTICIO" }),
  ], totaisOficiais(150), contexto)
  const porValor = new Map(r.linha.doacoes_a_terceiros.map((d) => [d.valor, d]))
  assert.equal(porValor.get(10)!.destinatario_tipo, "candidato")
  assert.equal(porValor.get(10)!.destinatario_nome, "ELEICAO 2026 CICLANO FICTICIO GOVERNADOR")
  for (const valor of [20, 30, 40]) {
    assert.equal(porValor.get(valor)!.destinatario_tipo, "outro", String(valor))
    assert.equal(porValor.get(valor)!.destinatario_nome, null, String(valor))
  }
  assert.equal(porValor.get(50)!.destinatario_tipo, "partido")
})

test("nomeSegueConvencaoCnpjCampanha: ano, nome e cargo no fim", () => {
  assert.equal(nomeSegueConvencaoCnpjCampanha("ELEIÇÃO 2022 FULANO DE TAL DEPUTADO ESTADUAL", 2022), true)
  assert.equal(nomeSegueConvencaoCnpjCampanha("eleicao 2024 fulano vice-prefeito", 2024), true)
  assert.equal(nomeSegueConvencaoCnpjCampanha("ELEICAO 2022 FULANO DE TAL DEPUTADO ESTADUAL", 2026), false)
  assert.equal(nomeSegueConvencaoCnpjCampanha("ELEICAO 2022 GOVERNADOR", 2022), false)
  assert.equal(nomeSegueConvencaoCnpjCampanha(null, 2022), false)
})

test("textoTemDocumento pega documento com espaço, ponto, barra ou hífen, e não o decimal de um valor", () => {
  for (const texto of ["MEI 123 456 789 01", "MEI 123.456.789/01", "EMPRESA 12 345 678 0001 90", "12345678901"]) {
    assert.equal(textoTemDocumento(texto), true, texto)
    assert.equal(textoTemDocumento([{ nome: texto, valor: 1 }]), true, `${texto} dentro de objeto`)
  }
  assert.equal(textoTemDocumento([{ tipo: "PJ", nome: "GRAFICA 2024 LTDA", valor: 123456789.12 }]), false)
  assert.equal(textoTemDocumento({ fone: "(11) 98765-4321" }), false)
  assert.equal(textoTemDocumento({ valor: 12345678901 }), true, "inteiro de 11 dígitos continua documento")
})
