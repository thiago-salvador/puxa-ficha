import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import { detalheReciboPromessa, estadoDasEvidencias, lerReciboPromessa } from "../src/lib/compromisso-evidencia"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const { getCompromissoEvidenciasEstado } = require("../src/lib/compromisso-evidencia-server") as typeof import("../src/lib/compromisso-evidencia-server")

type Resposta = { data: unknown; error: { code?: string; message: string } | null }
const FALHA: Resposta = { data: null, error: { code: "42501", message: "permission denied" } }
const PROGRAMA = "2026:GOVERNADOR:AM:40000000001"
const recibo = (resultado: string, pares = 3): Resposta => ({
  data: { candidato_id: "c1", resultado, executado_em: "2026-09-25T08:34:00.000Z", detalhe: detalheReciboPromessa({ programaChave: PROGRAMA, paresAvaliados: pares, publicados: 0, versao: "c2" }) },
  error: null,
})

/** Cliente falso: cada tabela devolve uma resposta fixa, qualquer que seja o filtro. */
function clienteFalso(respostas: Record<string, Resposta>, filtros: string[] = []) {
  return {
    from(tabela: string) {
      const resposta = respostas[tabela] ?? { data: [], error: null }
      const builder: Record<string, unknown> = {}
      for (const metodo of ["select", "eq", "in", "abortSignal", "maybeSingle"]) builder[metodo] = () => builder
      let filtrarDespublicados = false
      builder.is = (coluna: string, valor: unknown) => {
        filtros.push(`${tabela}.${coluna}=${valor}`)
        if (coluna === "despublicado_em" && valor === null) filtrarDespublicados = true
        return builder
      }
      builder.then = (ok: (r: Resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({
        ...resposta,
        data: filtrarDespublicados && Array.isArray(resposta.data)
          ? resposta.data.filter((linha: { despublicado_em?: string | null }) => linha.despublicado_em == null)
          : resposta.data,
      }).then(ok, erro)
      return builder
    },
  } as never
}

const entrada = { candidatoId: "c1", slug: "cand", programaChave: PROGRAMA }
const linhaView = { id: "v1", candidato_id: "c1", programa_chave: PROGRAMA, tema_id: "saude", tipo_evidencia: "projeto_lei", evidencia_ref: "pl1", relacao: "relacionada" }

test("view falhando e recibo ok: erro_leitura, nunca 'nenhum par'", async () => {
  const estado = await getCompromissoEvidenciasEstado(entrada, {
    criarCliente: () => clienteFalso({ compromisso_evidencia_publica: FALHA, coleta_log_ultima: recibo("vazio_confirmado", 0) }),
  })
  assert.deepEqual(estado, { estado: "erro_leitura" })
})

test("view ok sem vínculo e recibo falhando: erro_leitura", async () => {
  const estado = await getCompromissoEvidenciasEstado(entrada, {
    criarCliente: () => clienteFalso({ compromisso_evidencia_publica: { data: [], error: null }, coleta_log_ultima: FALHA }),
  })
  assert.deepEqual(estado, { estado: "erro_leitura" })
})

test("view ok com vínculo e recibo falhando: o vínculo aparece", async () => {
  const estado = await getCompromissoEvidenciasEstado(entrada, {
    criarCliente: () => clienteFalso({
      compromisso_evidencia_publica: { data: [linhaView], error: null },
      projetos_lei: { data: [{ id: "pl1", tipo: "PL", numero: "1", ano: 2020, ementa: "Amplia o SUS.", url_inteiro_teor: null, despublicado_em: null }], error: null },
      coleta_log_ultima: FALHA,
    }),
  })
  assert.equal(estado.estado, "com_vinculos")
  assert.equal(estado.estado === "com_vinculos" && estado.itens[0].texto, "Amplia o SUS.")
})

test("evidência ligada a projeto despublicado não exibe o item", async () => {
  const filtros: string[] = []
  const estado = await getCompromissoEvidenciasEstado(entrada, {
    criarCliente: () => clienteFalso({
      compromisso_evidencia_publica: { data: [linhaView], error: null },
      projetos_lei: { data: [{ id: "pl1", tipo: "PL", numero: "1", ano: 2020, ementa: "Projeto de outra pessoa.", url_inteiro_teor: null, despublicado_em: "2026-09-27T00:00:00Z" }], error: null },
      coleta_log_ultima: recibo("encontrado"),
    }, filtros),
  })
  assert.ok(filtros.includes("projetos_lei.despublicado_em=null"))
  assert.equal(estado.estado, "vinculos_sem_exibicao")
})

const linhaVoto = { id: "v2", candidato_id: "c1", programa_chave: PROGRAMA, tema_id: "politica-tributaria", tipo_evidencia: "votacao_chave", evidencia_ref: "vt1", relacao: "relacionada" }
const urlDoVoto = async (votacao: Record<string, unknown>) => {
  const estado = await getCompromissoEvidenciasEstado(entrada, {
    criarCliente: () => clienteFalso({
      compromisso_evidencia_publica: { data: [linhaVoto], error: null },
      votos_candidato: { data: [{ id: "vt1", voto: "sim", votacao: { titulo: "Reforma Tributaria", data_votacao: "2023-11-08", ...votacao } }], error: null },
      coleta_log_ultima: recibo("encontrado"),
    }),
  })
  assert.equal(estado.estado, "com_vinculos")
  return estado.estado === "com_vinculos" ? estado.itens[0].url : undefined
}

test("voto do Senado com proposição e votação aponta a votação nominal", async () => {
  assert.equal(
    await urlDoVoto({ casa: "Senado", proposicao_id: "158930", votacao_id_api: "6777" }),
    "https://www25.senado.leg.br/web/atividade/materias/-/materia/158930/votacoes#votacao_6777",
  )
})

test("voto sem ids da proposição fica sem link", async () => {
  assert.equal(await urlDoVoto({ casa: "Senado", proposicao_id: null, votacao_id_api: null }), null)
  assert.equal(await urlDoVoto({ casa: "Senado", proposicao_id: null, votacao_id_api: "6777" }), null)
  assert.equal(await urlDoVoto({ casa: null, proposicao_id: null, votacao_id_api: null }), null)
})

test("voto do Senado sem id de votação cai na página da matéria; Câmara usa a proposição", async () => {
  assert.equal(
    await urlDoVoto({ casa: "Senado", proposicao_id: "158930", votacao_id_api: null }),
    "https://www25.senado.leg.br/web/atividade/materias/-/materia/158930",
  )
  assert.equal(
    await urlDoVoto({ casa: "Câmara", proposicao_id: "2196833", votacao_id_api: "9" }),
    "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2196833",
  )
})

test("as duas leituras ok: estado vem do recibo", async () => {
  const nenhum = await getCompromissoEvidenciasEstado(entrada, {
    criarCliente: () => clienteFalso({ compromisso_evidencia_publica: { data: [], error: null }, coleta_log_ultima: recibo("vazio_confirmado", 0) }),
  })
  assert.equal(nenhum.estado, "nenhum_par")
  const barrados = await getCompromissoEvidenciasEstado(entrada, {
    criarCliente: () => clienteFalso({ compromisso_evidencia_publica: { data: [], error: null }, coleta_log_ultima: recibo("sem_achado_no_escopo", 3) }),
  })
  assert.deepEqual(barrados, { estado: "avaliados_nao_publicados", processadoEm: "2026-09-25T08:34:00.000Z", paresAvaliados: 3 })
})

test("cliente que não pode ser criado: erro_leitura", async () => {
  const estado = await getCompromissoEvidenciasEstado(entrada, { criarCliente: () => { throw new Error("sem credencial") } })
  assert.deepEqual(estado, { estado: "erro_leitura" })
})

test("recibo 'encontrado' sem item exibível vira vinculos_sem_exibicao", () => {
  const r = lerReciboPromessa(recibo("encontrado").data)
  assert.deepEqual(estadoDasEvidencias({ itens: [], recibo: r, reciboFalhou: false, programaChave: PROGRAMA }), {
    estado: "vinculos_sem_exibicao",
    processadoEm: "2026-09-25T08:34:00.000Z",
  })
})
