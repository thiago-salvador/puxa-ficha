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
function clienteFalso(respostas: Record<string, Resposta>) {
  return {
    from(tabela: string) {
      const resposta = respostas[tabela] ?? { data: [], error: null }
      const builder: Record<string, unknown> = {}
      for (const metodo of ["select", "eq", "in", "abortSignal", "maybeSingle"]) builder[metodo] = () => builder
      builder.then = (ok: (r: Resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, erro)
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
      projetos_lei: { data: [{ id: "pl1", tipo: "PL", numero: "1", ano: 2020, ementa: "Amplia o SUS.", url_inteiro_teor: null }], error: null },
      coleta_log_ultima: FALHA,
    }),
  })
  assert.equal(estado.estado, "com_vinculos")
  assert.equal(estado.estado === "com_vinculos" && estado.itens[0].texto, "Amplia o SUS.")
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
