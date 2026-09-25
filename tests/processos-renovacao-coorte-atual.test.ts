import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  criarPlanos,
  validarEvidencia,
  validarEvidenciaCoorteAtual,
  validarPreflightRenovacao,
  type PlanoRegistro,
} from "../scripts/aplicar-evidencia-processos-curadoria"
import {
  cargoSolicitado,
  csvsDoConsultaCand,
  exigirCaminhoPersistente,
  margemDiasSolicitada,
  mencionaNomeNoTexto,
  modoAlvosSolicitado,
  montarSnapshotCoorteAtual,
  nomeDestinatario,
  pesquisarCandidato,
  selecionarAlvosIndeterminados,
  selecionarAlvosVencendo,
  type Comunicacao,
} from "../scripts/curadoria-processos-lote"
import { validarRevisaoManual } from "../scripts/registrar-revisao-curadoria"

const AGORA = Date.parse("2026-09-25T22:00:00Z")
const DIA = 86_400_000

function recibo(id: string, slug: string, resultado: string, diasAtras: number) {
  return {
    candidato_id: id,
    alvo: slug,
    fonte: "processos-curadoria",
    escopo: "candidato",
    executado_em: new Date(AGORA - diasAtras * DIA).toISOString(),
    resultado,
  }
}

describe("renovação de recibos judiciais antes do SLA", () => {
  const candidatos = [
    { id: "a", slug: "alpha" },
    { id: "b", slug: "beta" },
    { id: "c", slug: "charlie" },
    { id: "d", slug: "delta" },
    { id: "e", slug: "echo" },
    { id: "f", slug: "foxtrot" },
  ]

  it("reabre só recibos conclusivos dentro da margem, nunca indeterminado, erro ou sem recibo", () => {
    const recibos = [
      recibo("a", "alpha", "vazio_confirmado", 10),
      recibo("b", "beta", "encontrado", 50),
      recibo("c", "charlie", "vazio_confirmado", 3),
      recibo("d", "delta", "indeterminado", 40),
      recibo("e", "echo", "erro", 40),
    ]
    assert.deepEqual(selecionarAlvosVencendo(candidatos, recibos, 5, AGORA), ["alpha", "beta"])
    assert.deepEqual(selecionarAlvosVencendo(candidatos, recibos, 0, AGORA), ["beta"])
  })

  it("usa o recibo mais recente do candidato e ignora slug trocado ou data futura", () => {
    const recibos = [
      recibo("a", "alpha", "vazio_confirmado", 30),
      recibo("a", "alpha", "indeterminado", 1),
      { ...recibo("b", "outro", "vazio_confirmado", 30) },
      { ...recibo("c", "charlie", "vazio_confirmado", -2) },
    ]
    assert.deepEqual(selecionarAlvosVencendo(candidatos, recibos, 4, AGORA), [])
  })

  it("reexame de indeterminados seleciona indeterminado, erro e bloqueado", () => {
    const recibos = [
      recibo("a", "alpha", "indeterminado", 40),
      recibo("b", "beta", "erro", 2),
      recibo("c", "charlie", "vazio_confirmado", 2),
      recibo("d", "delta", "bloqueado", 5),
    ]
    assert.deepEqual(selecionarAlvosIndeterminados(candidatos, recibos, AGORA), ["alpha", "beta", "delta"])
    assert.equal(modoAlvosSolicitado(["--alvos=indeterminados"]), "indeterminados")
  })

  it("valida flags de alvos, margem e cargo", () => {
    assert.equal(modoAlvosSolicitado([]), "sem-recibo")
    assert.equal(modoAlvosSolicitado(["--alvos=vencendo"]), "vencendo")
    assert.throws(() => modoAlvosSolicitado(["--alvos=todos"]), /sem-recibo, --alvos=vencendo ou --alvos=indeterminados/)
    assert.equal(margemDiasSolicitada([]), 4)
    assert.equal(margemDiasSolicitada(["--margem-dias=13"]), 13)
    assert.throws(() => margemDiasSolicitada(["--margem-dias=14"]), /entre 0 e 13/)
    assert.equal(cargoSolicitado(["--cargo=Senador"]), "Senador")
    assert.equal(cargoSolicitado([]), null)
    assert.throws(() => cargoSolicitado(["--cargo=Deputado"]), /Presidente, Governador ou Senador/)
  })

  it("recusa evidência e snapshot em /tmp, que não sobrevivem a reboot", () => {
    const anterior = process.env.PF_PERMITIR_TMP
    delete process.env.PF_PERMITIR_TMP
    try {
      assert.throws(() => exigirCaminhoPersistente("/tmp/x.json", "--evidence"), /nao sobrevive a reboot/)
      assert.throws(() => exigirCaminhoPersistente("/private/tmp/x.json", "--evidence"), /nao sobrevive a reboot/)
      assert.doesNotThrow(() => exigirCaminhoPersistente("/home/runner/work/_temp/x.json", "--evidence"))
    } finally {
      if (anterior !== undefined) process.env.PF_PERMITIR_TMP = anterior
    }
  })

  it("snapshot registra alvo, cargo e último recibo sem CPF", () => {
    const base = {
      nome_completo: "Nome", nome_urna: "Nome", cargo_atual: null, partido_sigla: null,
      biografia: null, cpf: "12345678901",
    }
    const snapshot = montarSnapshotCoorteAtual(
      [{ ...base, id: "a", slug: "alpha", cargo_disputado: "Senador", estado: "MA" }],
      [recibo("a", "alpha", "vazio_confirmado", 10)],
      ["alpha"],
      { modo: "dry-run-coorte-atual-renovacao", filtro_cargo: "Senador", margem_dias: 5, coorte_publica_total: 513 },
      AGORA,
    )
    assert.equal(snapshot.alvos.length, 1)
    assert.equal(snapshot.alvos[0].ultimo_recibo?.resultado, "vazio_confirmado")
    assert.doesNotMatch(JSON.stringify(snapshot), /12345678901/)
  })
})

describe("nome exato fora dos destinatários não permite vazio", () => {
  const nome = "CARLOS DA SILVA TESTE"
  const item = (texto: string, destinatarios: string[]): Comunicacao => ({
    id: 1, texto, destinatarios: destinatarios.map((n) => ({ nome: n })),
  })

  it("remove apelido entre parênteses do destinatário", () => {
    assert.equal(nomeDestinatario("Carlos da Silva Teste (Carlinhos)"), nome)
  })

  it("conta menção no texto quando a intimação vai ao advogado", () => {
    assert.equal(mencionaNomeNoTexto(item("Autor: Carlos da Silva Teste. Adv.: Fulano", ["Fulano de Tal"]), nome), true)
  })

  it("conta destinatário com sobrenome a mais (possível nome civil alterado)", () => {
    assert.equal(mencionaNomeNoTexto(item("sem o nome", ["Carlos da Silva Teste Souza"]), nome), true)
  })

  it("não conta nome contido em outro com prenome diferente", () => {
    assert.equal(
      mencionaNomeNoTexto(item("Parte: Maria Carlos da Silva Teste", ["Maria Carlos da Silva Teste"]), nome),
      false,
    )
  })

  it("rebaixa para bloqueado o vazio que o protocolo antigo afirmaria", async () => {
    const resultado = await pesquisarCandidato(
      {
        id: "id", slug: "carlos", nome_completo: "Carlos da Silva Teste", nome_urna: "Carlos",
        cargo_disputado: "Senador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
      },
      { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 },
      undefined,
      new Map(),
      ["TJMG"],
      "/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome: "Carlos da Silva Teste" }),
        buscarDjen: async (consulta) => ({
          schema_version: 2,
          url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=Carlos%20da%20Silva%20Teste&pagina=1",
          query_nome: consulta,
          consultado_em: "2026-09-25T22:00:00Z",
          total: 1,
          itens: [{
            id: 7,
            siglaTribunal: "TJMG",
            numeroprocessocommascara: "0000001-00.2026.8.13.0001",
            texto: "Autor: CARLOS DA SILVA TESTE (apelido)",
            destinatarios: [{ nome: "CARLOS DA SILVA TESTE (apelido)" }],
          }],
          paginas: 1,
          completo: true,
        }),
      },
    )
    // Com o apelido removido, vira destinatário exato; sem cargo no texto, fica ambíguo.
    assert.equal(resultado.classificacao, "bloqueado")
    assert.equal(resultado.busca.ocorrencias_nome_exato, 1)
    assert.equal(resultado.busca.completo, true)
  })
})

function evidenciaCoorte(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const candidato = {
    slug: "senadora-teste",
    nome_completo: "Senadora Teste",
    nome_urna: "Senadora Teste",
    cargo: "Senador",
    uf: "MA",
    identidade: {
      status: "confirmada", metodo: "tse-sq-candidato", sq_candidato: "100002536212",
      nome: "Senadora Teste", url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
    },
    busca: {
      url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=Senadora%20Teste&pagina=1",
      consultado_em: "2026-09-25T22:13:00Z",
      periodo: "acervo publico consultado em 2026-09-25T22:13:00Z",
      termos: "nome completo exato",
      tribunais_consultados: ["TJMA"],
      total_api: 0,
      teto_publico_atingido: false,
      completo: true,
    },
    ocorrencias_ambiguas: [],
    homonimos_descartados: [],
    classificacao: "vazio_confirmado",
    motivo: "nenhum processo atribuivel",
    processos: [],
  }
  return {
    schema_version: 1,
    total_inicial: 1,
    candidatos_iniciais: ["senadora-teste"],
    fontes: { modo: "dry-run-coorte-atual-renovacao", snapshot_sha256: "abc" },
    lotes: [{ numero: 1, concluido_em: "2026-09-25T22:14:00Z", slugs: ["senadora-teste"], candidatos: [candidato] }],
    resumo: { classificados: 1, encontrado: 0, vazio_confirmado: 1, bloqueado: 0, erro: 0 },
    ...overrides,
  }
}

describe("aplicador aceita evidência da coorte atual", () => {
  it("valida evidência de qualquer tamanho sem o snapshot de 185", () => {
    const evidencia = validarEvidencia(evidenciaCoorte())
    assert.equal(evidencia.total_inicial, 1)
    assert.equal(evidencia.coorte_atual?.modo, "dry-run-coorte-atual-renovacao")
    const [plano] = criarPlanos(evidencia)
    assert.equal(plano.resultado, "vazio_confirmado")
  })

  it("recusa evidência cujo total diverge dos alvos classificados", () => {
    assert.throws(() => validarEvidenciaCoorteAtual(evidenciaCoorte({ total_inicial: 2 })), /total_inicial/)
    assert.throws(() => validarEvidenciaCoorteAtual(evidenciaCoorte({ fontes: { modo: "dry-run-coorte-atual-somente-cnj" } })), /modo nao aplicavel/)
  })

  it("evidência de reexame de indeterminados nunca vira recibo pelo aplicador", () => {
    assert.throws(
      () => validarEvidencia(evidenciaCoorte({ fontes: { modo: "dry-run-coorte-atual-reexame-indeterminados" } })),
      /modo nao aplicavel/,
    )
  })

  it("mantém a evidência de agosto no validador de 185", () => {
    const semFontes = evidenciaCoorte()
    delete semFontes.fontes
    assert.throws(() => validarEvidencia(semFontes), /esperado 185/)
  })

  it("renovação trata recibo antigo como renovável, recusa recibo mais novo e pula o idêntico", () => {
    const [plano] = criarPlanos(validarEvidencia(evidenciaCoorte())) as PlanoRegistro[]
    const lotes = new Map([[1, "2026-09-25T22:14:00Z"]])
    const antigo = { alvo: plano.slug, resultado: "vazio_confirmado", detalhe: "revisao_em=2026-09-15; ...", executado_em: "2026-09-15T18:36:00Z" }
    assert.equal(validarPreflightRenovacao([plano], [plano.slug], [antigo], lotes).pendentes.length, 1)
    const novo = { ...antigo, executado_em: "2026-09-26T00:00:00Z" }
    assert.throws(() => validarPreflightRenovacao([plano], [plano.slug], [antigo, novo], lotes), /mais novo que a evidencia/)
    assert.throws(() => validarPreflightRenovacao([plano], [], [], lotes), /fora de candidatos_publico/)
  })

  it("falha de fonte antes da identidade vira recibo erro, não silêncio", () => {
    const evidencia = evidenciaCoorte()
    const lote = (evidencia.lotes as Array<{ candidatos: Array<Record<string, unknown>> }>)[0]
    lote.candidatos[0] = {
      ...lote.candidatos[0],
      classificacao: "erro",
      identidade: { status: "bloqueada", motivo: "consulta TSE 2026 falhou antes da identidade", url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip" },
      motivo: "HTTP 503 no DJEN",
    }
    evidencia.resumo = { classificados: 1, encontrado: 0, vazio_confirmado: 0, bloqueado: 0, erro: 1 }
    const [plano] = criarPlanos(validarEvidencia(evidencia))
    assert.equal(plano.resultado, "erro")
    assert.ok(plano.args.includes("--identidade=nao-confirmada"))
  })

  it("registrador aceita nao-confirmada com erro, mas nunca com vazio", () => {
    const base = [
      "--slug=x", "--frente=processos", "--data=2026-09-25", "--identidade=nao-confirmada",
      "--detalhe=orgaos: TJMA; jurisdicao: MA; periodo: 2026; termos: nome; motivo: fonte oficial fora do ar antes da identidade; fontes consultadas: TSE; anos consultados: 2026",
    ]
    assert.equal(validarRevisaoManual([...base, "--resultado=erro"]).resultado, "erro")
    assert.throws(() => validarRevisaoManual([...base, "--resultado=vazio_confirmado"]), /indeterminado ou erro/)
  })
})

describe("conferência de CPF usa o texto bruto em memória", () => {
  it("atribui pelo CPF rotulado quando a resposta veio da rede, sem persistir o bruto", async () => {
    const cpf = "52998224725"
    const resultado = await pesquisarCandidato(
      {
        id: "id", slug: "carlos", nome_completo: "Carlos da Silva Teste", nome_urna: "Carlos",
        cargo_disputado: "Senador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
      },
      { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 },
      undefined,
      new Map(),
      ["TJMG"],
      "/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome: "Carlos da Silva Teste", cpf }),
        buscarDjen: async (consulta) => ({
          schema_version: 2,
          url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=x&pagina=1",
          query_nome: consulta,
          consultado_em: "2026-09-25T22:00:00Z",
          total: 1,
          itens: [{
            id: 9, siglaTribunal: "TJMG", numeroprocessocommascara: "5001754-50.2024.8.13.0441",
            texto: "Réu: CARLOS DA SILVA TESTE, CPF [cpf omitido]",
            destinatarios: [{ nome: "CARLOS DA SILVA TESTE", polo: "P" }],
          }],
          paginas: 1,
          completo: true,
          textosBrutos: new Map([[9, `Réu: CARLOS DA SILVA TESTE, CPF ${cpf}`]]),
        }),
      },
    )
    assert.equal(resultado.classificacao, "encontrado")
    assert.equal(resultado.busca.conferencia_cpf, "texto_bruto_em_memoria")
  })
})

describe("identidade TSE nunca falha em silêncio", () => {
  it("segue diretório de cache ligado por symlink e recusa extração sem CSV", () => {
    const raiz = mkdtempSync(join(tmpdir(), "pf-consulta-cand-"))
    try {
      const real = join(raiz, "real")
      mkdirSync(real)
      writeFileSync(join(real, "consulta_cand_2022_MG.csv"), "SQ_CANDIDATO;NM_CANDIDATO\n")
      symlinkSync(real, join(raiz, "link"))
      assert.equal(csvsDoConsultaCand(join(raiz, "link"), "2022").length, 1)
      mkdirSync(join(raiz, "vazio"))
      assert.throws(() => csvsDoConsultaCand(join(raiz, "vazio"), "2022"), /nenhum CSV/)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })
})
