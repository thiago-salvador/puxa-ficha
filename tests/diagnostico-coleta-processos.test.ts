import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  ColetorDiagnostico,
  DISJUNTOR_ABERTO,
  classificarFalhaColeta,
  fonteDaUrl,
  linhaResumoDiagnostico,
  origemDoErro,
  sanitizarDiagnostico,
} from "../scripts/lib/diagnostico-coleta-processos"
import { main as resumir } from "../scripts/resumir-diagnostico-coleta-processos"

const DJEN_NOME = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=FULANA%20DE%20TAL&pagina=1"
const INVENTARIO = "https://comunicaapi.pje.jus.br/api/v1/comunicacao/tribunal"

function erroComCausa(mensagem: string, code: string): Error {
  return new TypeError(mensagem, { cause: Object.assign(new Error(code), { code }) })
}

describe("classificação da falha da coleta judicial", () => {
  it("separa limite, bloqueio, indisponibilidade, tempo, DNS e rede", () => {
    assert.equal(classificarFalhaColeta(new Error(DISJUNTOR_ABERTO)), "limite_de_taxa")
    assert.equal(classificarFalhaColeta(new Error(`HTTP 429 em ${DJEN_NOME}`)), "limite_de_taxa")
    assert.equal(classificarFalhaColeta(new Error(`HTTP 403 em ${INVENTARIO}`)), "bloqueio_http")
    assert.equal(classificarFalhaColeta(new Error("HTTP 403 ao baixar https://cdn.tse.jus.br/x/consulta_cand_2026.zip")), "bloqueio_http")
    assert.equal(classificarFalhaColeta(new Error(`HTTP 503 em ${INVENTARIO}`)), "fonte_indisponivel")
    assert.equal(classificarFalhaColeta(new Error(`limite de tentativas em ${INVENTARIO}`)), "fonte_indisponivel")
    assert.equal(classificarFalhaColeta(new Error("DJEN por CNJ suspenso após duas falhas consecutivas")), "fonte_indisponivel")
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError")
    assert.equal(classificarFalhaColeta(timeout), "tempo_esgotado")
    assert.equal(classificarFalhaColeta(erroComCausa("fetch failed", "UND_ERR_CONNECT_TIMEOUT")), "tempo_esgotado")
    assert.equal(classificarFalhaColeta(erroComCausa("fetch failed", "ENOTFOUND")), "dns")
    assert.equal(classificarFalhaColeta(erroComCausa("fetch failed", "ECONNRESET")), "rede")
    assert.equal(classificarFalhaColeta(new TypeError("fetch failed")), "rede")
  })

  it("separa parser, checkpoint, TSE, banco e erro de código", () => {
    assert.equal(classificarFalhaColeta(new Error("DJEN resposta invalida: items array esperado")), "resposta_invalida")
    assert.equal(classificarFalhaColeta(new Error("DJEN truncado: 3/10")), "resposta_invalida")
    assert.equal(classificarFalhaColeta(new SyntaxError("Unexpected token < in JSON")), "resposta_invalida")
    assert.equal(classificarFalhaColeta(new Error("chave publica do DataJud nao encontrada na documentacao oficial")), "resposta_invalida")
    assert.equal(classificarFalhaColeta(new Error("DataJud: status nao final para TJSP 0000000-00.0000.0.00.0000: ausente")), "resposta_invalida")
    assert.equal(classificarFalhaColeta(new Error("checkpoint: timeout aguardando lock /x.lock")), "checkpoint")
    assert.equal(classificarFalhaColeta(new Error("checkpoint: coorte diverge no total (1 x 2)")), "checkpoint")
    assert.equal(classificarFalhaColeta(new Error("consulta_cand_2026: nenhum CSV em /x")), "identidade_tse")
    assert.equal(classificarFalhaColeta(new Error("preflight candidatos: timeout")), "preflight_banco")
    assert.equal(classificarFalhaColeta(new Error("candidato ausente no banco: fulana")), "erro_codigo")
    assert.equal(classificarFalhaColeta(new TypeError("Cannot read properties of undefined (reading 'x')")), "erro_codigo")
    assert.equal(classificarFalhaColeta("qualquer"), "outro")
  })

  it("rotula a fonte sem reter query, nome ou CNJ", () => {
    assert.equal(fonteDaUrl(DJEN_NOME), "DJEN")
    assert.equal(fonteDaUrl(INVENTARIO), "DJEN:inventario")
    assert.equal(fonteDaUrl("https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search"), "DataJud:TJSP")
    assert.equal(fonteDaUrl("https://datajud-wiki.cnj.jus.br/api-publica/acesso/"), "DataJud:chave")
    assert.equal(fonteDaUrl("https://cdn.tse.jus.br/estatistica/x.zip"), "TSE")
    assert.equal(fonteDaUrl("https://exemplo.org/?nome=fulana"), "outra")
    assert.equal(fonteDaUrl("não é url"), "desconhecida")
    assert.deepEqual(origemDoErro(new Error(`HTTP 403 em ${DJEN_NOME}`)), { fonte: "DJEN", status: 403 })
    assert.deepEqual(origemDoErro(new Error("DataJud: conflito de tribunal para X")), { fonte: "DataJud", status: null })
  })
})

describe("diagnóstico agregado", () => {
  it("conta respostas por fonte, candidatos e fatal, sem texto nominal", () => {
    const d = new ColetorDiagnostico()
    d.registrarResposta(INVENTARIO, 403)
    d.registrarResposta(DJEN_NOME, 200)
    d.registrarResposta(DJEN_NOME, 200)
    d.registrarFalhaRede("https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search", erroComCausa("fetch failed", "ENOTFOUND"))
    d.registrarCandidato("bloqueado")
    d.registrarCandidato("erro", `HTTP 429 em ${DJEN_NOME}`)
    d.registrarFatal(new Error(`HTTP 403 em ${INVENTARIO}`))
    const json = d.paraJson()
    assert.deepEqual(json.respostas, { "DJEN:inventario": { 403: 1 }, DJEN: { 200: 2 }, "DataJud:TRF1": { dns: 1 } })
    assert.deepEqual(json.candidatos, { encontrado: 0, vazio_confirmado: 0, bloqueado: 1, erro: 1 })
    assert.deepEqual(json.erros_candidato, { limite_de_taxa: { DJEN: 1 } })
    assert.deepEqual(json.fatal, { tipo: "bloqueio_http", fonte: "DJEN:inventario", status: 403 })
    const texto = JSON.stringify(json)
    assert.doesNotMatch(texto, /FULANA|nomeParte|comunicaapi|https?:/i)
    assert.equal(
      linhaResumoDiagnostico("vencendo", json),
      "vencendo diagnóstico: fatal=bloqueio_http fonte=DJEN:inventario status=403; respostas=DataJud:TRF1{dns:1} DJEN{200:2} DJEN:inventario{403:1}; candidatos=encontrado:0,vazio:0,bloqueado:1,erro:1; erros_candidato=limite_de_taxa{DJEN:1}",
    )
  })

  it("allowlist descarta chave, fonte ou valor fora do contrato", () => {
    const saneado = sanitizarDiagnostico({
      schema_version: 1,
      respostas: { DJEN: { 200: 3, "fulana-de-tal": 1, 500: -1 }, "fulana-de-tal": { 200: 1 } },
      candidatos: { encontrado: 2, erro: "muitos", slug: 9 },
      erros_candidato: { rede: { DJEN: 1, "0000000-00.0000.0.00.0000": 1 }, inventado: { DJEN: 1 } },
      fatal: { tipo: "bloqueio_http", fonte: "https://x/?nome=fulana", status: 403, mensagem: "HTTP 403 em ...fulana" },
      extra: "fulana",
    })
    assert.deepEqual(saneado, {
      schema_version: 1,
      respostas: { DJEN: { 200: 3 } },
      candidatos: { encontrado: 2, vazio_confirmado: 0, bloqueado: 0, erro: 0 },
      erros_candidato: { rede: { DJEN: 1 } },
      fatal: { tipo: "bloqueio_http", fonte: "desconhecida", status: 403 },
    })
    assert.throws(() => sanitizarDiagnostico({ schema_version: 2 }), /schema_version/)
    assert.equal(sanitizarDiagnostico({ schema_version: 1, fatal: { tipo: "texto livre" } }).fatal, null)
  })

  it("CLI grava só a cópia saneada e devolve a linha do resumo", () => {
    const dir = mkdtempSync(join(tmpdir(), "diag-coleta-"))
    const entrada = join(dir, "e.diagnostico.json")
    const saida = join(dir, "publico", "vencendo.json")
    writeFileSync(entrada, JSON.stringify({ schema_version: 1, respostas: { DJEN: { 403: 2 } }, fatal: { tipo: "bloqueio_http", fonte: "DJEN", status: 403 }, nome: "fulana" }))
    const linha = resumir([`--entrada=${entrada}`, "--modo=vencendo", `--saida=${saida}`])
    assert.match(linha, /^vencendo diagnóstico: fatal=bloqueio_http fonte=DJEN status=403; respostas=DJEN\{403:2\}/)
    assert.doesNotMatch(readFileSync(saida, "utf8"), /fulana/)
    assert.throws(() => resumir([`--entrada=${entrada}`, "--modo=x; rm", `--saida=${saida}`]), /--modo invalido/)
  })
})
