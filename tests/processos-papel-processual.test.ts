import assert from "node:assert/strict"
import { it } from "node:test"

import {
  atribuirProcessoPorPapel,
  estadoJevPapelProcessual,
  papelProcessualDoNome,
  pesquisarCandidato,
  pesquisarCandidatoPorCnjs,
} from "../scripts/curadoria-processos-lote"

const nome = "Fulano de Tal"

it("classifica advogado com CPF e OAB e não o encontra como parte", () => {
  const texto = "ADVOGADO: Fulano de Tal, CPF 000.000.000-00, OAB/SP 12345."
  assert.equal(papelProcessualDoNome(texto, nome), "advogado")
  assert.equal(atribuirProcessoPorPapel(texto, nome).encontrado, false)
  assert.equal(atribuirProcessoPorPapel(texto, nome).motivo, "papel_processual:advogado")
})

it("reconhece OAB sem UF entre parênteses", () => {
  assert.equal(papelProcessualDoNome("Fulano de Tal (OAB 12345)", nome), "advogado")
})

it("classifica vítima listada como destinatária e não a encontra como parte", () => {
  const texto = "VÍTIMA: Fulano de Tal."
  const destinatarios = [{ nome, polo: "" }]
  assert.equal(papelProcessualDoNome(texto, nome, destinatarios), "vitima_ou_ofendido")
  assert.equal(atribuirProcessoPorPapel(texto, nome, destinatarios).encontrado, false)
})

it("classifica requerido como parte passiva", () => {
  const texto = "REQUERIDO: FULANO DE TAL, ex-prefeito."
  assert.equal(papelProcessualDoNome(texto, nome), "parte_passiva")
  assert.equal(atribuirProcessoPorPapel(texto, nome).encontrado, true)
})

it("classifica autor como parte ativa", () => {
  const texto = "AUTOR: FULANO DE TAL, devidamente qualificado."
  assert.equal(papelProcessualDoNome(texto, nome), "parte_ativa")
})

it("classifica menção sem papel como apenas citado", () => {
  assert.equal(papelProcessualDoNome("A decisão menciona Fulano de Tal no corpo do texto.", nome), "apenas_citado")
})

it("falha fechado quando a mesma menção mistura parte e advogado", () => {
  const texto = "REQUERIDO: Fulano de Tal, advogado, OAB/SP 12345."
  assert.equal(papelProcessualDoNome(texto, nome), "indeterminado")
  assert.equal(atribuirProcessoPorPapel(texto, nome).encontrado, false)
  assert.equal(papelProcessualDoNome("ADVOGADO: Fulano de Tal, OAB/SP 12345", nome, [{ nome, polo: "P" }]), "indeterminado")
  assert.equal(papelProcessualDoNome("Fulano de Tal", nome, [{ nome, polo: "A" }, { nome, polo: "P" }]), "indeterminado")
})

it("expõe o state mínimo para o juiz Jev em sombra", () => {
  assert.deepEqual(estadoJevPapelProcessual({
    candidatura: { nome, cargo: "Prefeito" },
    processo: { numero_cnj: "0000000-00.2026.8.26.0001", contexto_identidade: "REQUERIDO: FULANO DE TAL", destinatarios: [{ nome, polo: "P" }] },
  }), {
    candidatura: { nome, cargo: "Prefeito" },
    processo: { numero_cnj: "0000000-00.2026.8.26.0001", trecho: "REQUERIDO: FULANO DE TAL", destinatarios: [{ nome, polo: "P" }] },
  })
  assert.deepEqual(estadoJevPapelProcessual({
    nome_completo: nome, cargo: "Governador",
    processos: [{ numero_cnj: "1", trecho_papel: "ADVOGADO: Fulano de Tal", destinatarios: [] }],
  } as never), {
    candidatura: { nome, cargo: "Governador" },
    processo: { numero_cnj: "1", trecho: "ADVOGADO: Fulano de Tal", destinatarios: [] },
  })
})

it("readback por CNJ manda menção corporal sem papel para revisão", async () => {
  const resultado = await pesquisarCandidatoPorCnjs(
    {
      id: "id-teste", slug: "candidato-teste", nome_completo: nome, nome_urna: "Fulano",
      cargo_disputado: "Governador", cargo_atual: null, estado: "MG", partido_sigla: "PSD",
      biografia: null,
    },
    { slug: "candidato-teste", nome_urna: "Fulano", cargo_disputado: "Governador", processos: 0 },
    undefined,
    new Map(),
    [{ numero_cnj: "0000000-00.2026.8.26.0001", tribunal: "TJSP" }],
    async () => ({ count: 1, items: [{
      id: 1, ativo: true, numero_processo: "00000000020268260001", siglaTribunal: "TJSP",
      texto: "Fulano de Tal, governador de Minas Gerais, foi mencionado no processo.",
      destinatarios: [{ nome }],
    }] }),
    async () => ({ status: "confirmada", nome, cpf: "11111111111" }),
  )
  assert.equal(resultado.processos.length, 0)
  assert.equal(resultado.ocorrencias_ambiguas[0]?.motivo, "papel_processual:apenas_citado")
  assert.equal(resultado.ocorrencias_ambiguas[0]?.papel_processual, "apenas_citado")
})

it("readback por CNJ prefere revisão quando o mesmo número tem parte e advogado", async () => {
  const resultado = await pesquisarCandidatoPorCnjs(
    {
      id: "id-teste", slug: "candidato-teste", nome_completo: nome, nome_urna: "Fulano",
      cargo_disputado: "Governador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
    },
    { slug: "candidato-teste", nome_urna: "Fulano", cargo_disputado: "Governador", processos: 0 },
    undefined, new Map(), [{ numero_cnj: "0000000-00.2026.8.26.0001", tribunal: "TJSP" }],
    async () => ({ count: 2, items: [
      { id: 1, ativo: true, numero_processo: "00000000020268260001", siglaTribunal: "TJSP",
        texto: "AUTOR: Fulano de Tal governador de Minas Gerais", destinatarios: [{ nome }] },
      { id: 2, ativo: true, numero_processo: "00000000020268260001", siglaTribunal: "TJSP",
        texto: "ADVOGADO: Fulano de Tal governador de Minas Gerais, OAB 12345", destinatarios: [{ nome }] },
    ] }),
    async () => ({ status: "confirmada", nome, cpf: "11111111111" }),
  )
  assert.equal(resultado.processos.length, 0)
  assert.equal(resultado.ocorrencias_ambiguas[0]?.motivo, "papel_processual:advogado")
})

it("rebaixa o CNJ quando uma comunicação é parte e outra é advogado", async () => {
  const resultado = await pesquisarCandidato(
    {
      id: "id-teste", slug: "candidato-teste", nome_completo: nome, nome_urna: "Fulano",
      cargo_disputado: "Governador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
    },
    { slug: "candidato-teste", nome_urna: "Fulano", cargo_disputado: "Governador", processos: 0 },
    undefined, new Map(), ["TJMG"], "/tmp/cache-nao-usado", {
      confirmarIdentidade: async () => ({ status: "confirmada", nome, cpf: "11111111111" }),
      buscarDjen: async () => ({
        schema_version: 2, url: "https://comunicaapi.pje.jus.br", query_nome: nome,
        consultado_em: "2026-09-29T00:00:00Z", total: 2, paginas: 1, completo: true,
        itens: [
          { id: 1, numero_processo: "00000000020268260001", siglaTribunal: "TJMG", texto: "Fulano de Tal governador de Minas Gerais", destinatarios: [{ nome, polo: "A" }] },
          { id: 2, numero_processo: "00000000020268260001", siglaTribunal: "TJMG", texto: "ADVOGADO: Fulano de Tal, OAB 12345", destinatarios: [{ nome }] },
        ],
        textosBrutos: new Map([[1, "Fulano de Tal governador de Minas Gerais"], [2, "ADVOGADO: Fulano de Tal, OAB 12345"]]),
      }),
    },
  )
  assert.equal(resultado.processos.length, 0)
  assert.equal(resultado.ocorrencias_ambiguas[0]?.papel_processual, "advogado")

  const inverso = await pesquisarCandidato(
    {
      id: "id-teste", slug: "candidato-teste", nome_completo: nome, nome_urna: "Fulano",
      cargo_disputado: "Governador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
    },
    { slug: "candidato-teste", nome_urna: "Fulano", cargo_disputado: "Governador", processos: 0 },
    undefined, new Map(), ["TJMG"], "/tmp/cache-nao-usado", {
      confirmarIdentidade: async () => ({ status: "confirmada", nome, cpf: "11111111111" }),
      buscarDjen: async () => ({
        schema_version: 2, url: "https://comunicaapi.pje.jus.br", query_nome: nome,
        consultado_em: "2026-09-29T00:00:00Z", total: 2, paginas: 1, completo: true,
        itens: [
          { id: 2, numero_processo: "00000000020268260001", siglaTribunal: "TJMG", texto: "ADVOGADO: Fulano de Tal, OAB 12345", destinatarios: [{ nome }] },
          { id: 1, numero_processo: "00000000020268260001", siglaTribunal: "TJMG", texto: "Fulano de Tal governador de Minas Gerais", destinatarios: [{ nome, polo: "A" }] },
        ],
        textosBrutos: new Map([[1, "Fulano de Tal governador de Minas Gerais"], [2, "ADVOGADO: Fulano de Tal, OAB 12345"]]),
      }),
    },
  )
  assert.equal(inverso.processos.length, 0)
  assert.equal(inverso.ocorrencias_ambiguas[0]?.motivo, "papel_processual:advogado")
})

it("rótulo de outra pessoa não contamina a menção seguinte, e a trava de não-parte continua", () => {
  const cpf = "529.982.247-25"
  // O OAB do advogado do autor não faz do réu um advogado.
  assert.equal(papelProcessualDoNome(`AUTOR: Beltrano, OAB/MG 123. REU: Fulano de Tal, CPF ${cpf}`, nome), "parte_passiva")
  // "ADVOGADO DO(A) REU:" depois do nome apresenta a próxima pessoa.
  assert.equal(papelProcessualDoNome("INVESTIGADO: Fulano de Tal ADVOGADO DO(A) INVESTIGADO: Beltrano - MS18103", nome), "parte_passiva")
  // Qualificação de parte só pelo CPF colado ao nome.
  assert.equal(atribuirProcessoPorPapel(`CUMPRIMENTO DE SENTENCA - Fulano de Tal, CPF ${cpf}`, nome).encontrado, true)
  // Advogado com o próprio CPF e OAB continua fora.
  const advogado = atribuirProcessoPorPapel(`ADVOGADO: Fulano de Tal, CPF ${cpf}, OAB/SP 12345`, nome)
  assert.equal(advogado.encontrado, false)
  assert.equal(advogado.papel, "advogado")
  assert.equal(atribuirProcessoPorPapel(`CUMPRIMENTO DE SENTENCA - Fulano de Tal, CPF ${cpf}, OAB/SP 12345`, nome).encontrado, false)
  // Lista com papel entre parênteses: vale o parêntese da própria menção.
  assert.equal(papelProcessualDoNome(`PARTE(S): [Beltrano - CPF: 111.444.777-35 (ADVOGADO), Fulano de Tal - CPF: ${cpf} (AGRAVADO)]`, nome), "parte_passiva")
  assert.equal(atribuirProcessoPorPapel(`PARTE(S): [Fulano de Tal - CPF: ${cpf} (ADVOGADO), Beltrano - CPF: 111.444.777-35 (AGRAVADO)]`, nome).encontrado, false)
  // Só citado no corpo, sem rótulo nem CPF, continua fora.
  assert.equal(atribuirProcessoPorPapel("O juízo determinou a intimação, conforme parecer citado por Fulano de Tal em audiência.", nome).encontrado, false)
})

it("entrada patológica não causa backtracking (ReDoS)", () => {
  const listas = ["A" + " E A".repeat(50_000), "REQUERIDOS: " + "A, ".repeat(50_000) + "Fulano de Tal", "- CPF:" + " ".repeat(50_000) + "(", "(".repeat(50_000) + " OAB"]
  atribuirProcessoPorPapel("REQUERIDO: Fulano de Tal", nome) // aquece o JIT antes de medir
  for (const texto of listas) {
    for (const chamar of [() => papelProcessualDoNome(texto, nome), () => atribuirProcessoPorPapel(texto, nome)]) {
      const inicio = performance.now()
      chamar()
      const ms = performance.now() - inicio
      assert.ok(ms < 100, `levou ${Math.round(ms)} ms`)
    }
  }
})
