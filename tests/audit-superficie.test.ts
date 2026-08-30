import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { describe, it } from "node:test"

import type { LinhaSuperficie } from "../scripts/audit/audit-superficie"
import {
  avaliarFotosSuperficie,
  avaliarFalhasDoGate,
  avaliarIntegridadePartidaria,
  avaliarSuperficie,
  contarFichasPublicas,
  separarPorCoorte,
  temCadeiaCronologicaPartidariaIntegra,
} from "../scripts/audit/audit-superficie"

const COLETAS_OK: LinhaSuperficie["coletas"] = {
  "transparencia-sanctions": { resultado: "vazio_confirmado", executado_em: "2026-08-15T10:00:00Z" },
  "processos-curadoria": { resultado: "encontrado", executado_em: "2026-08-15T10:00:00Z" },
}

function fichaIntegra(slug = "candidato-ok"): LinhaSuperficie {
  return {
    slug,
    verificacao_campos: { existing_profile_aggregate: "2026-08-14" },
    ultima_atualizacao: "2026-08-14T12:00:00Z",
    pontos_visiveis: 2,
    destaques_totais: 2,
    destaques_ocultos_revisados: 0,
    coletas: { ...COLETAS_OK },
    linhas_abas: { votacoes_chave: 1, historico_politico: 1 },
    textos_publicos: [],
    publica: true,
    foto_url: "/candidates/candidato-ok.jpg",
    integridade_partidaria: {
      mudancas_visiveis: [],
      partidos_historico_visivel: [],
      partidos_historico_despublicado: [],
    },
  }
}

describe("avaliarSuperficie", () => {
  it("ficha íntegra não gera violação", () => {
    assert.deepEqual(avaliarSuperficie([fichaIntegra()]), [])
  })

  it("selo via TSE completo também satisfaz R1 sem agregado curado", () => {
    const ficha = fichaIntegra()
    ficha.verificacao_campos = {
      candidate_registration: "2026-08-06",
      candidate_complement: "2026-08-06",
      social_networks: "2026-08-06",
    }
    assert.deepEqual(avaliarSuperficie([ficha]), [])
  })

  it("R1: TSE parcial sem agregado curado reprova (caso Augusto Cury)", () => {
    const ficha = fichaIntegra("augusto-cury")
    ficha.verificacao_campos = { candidate_registration: "2026-06-09" }
    const violacoes = avaliarSuperficie([ficha])
    assert.equal(violacoes.length, 1)
    assert.equal(violacoes[0].regra, "R1_selo")
    assert.equal(violacoes[0].slug, "augusto-cury")
  })

  it("R2: zero pontos visíveis sem revisão editorial reprova", () => {
    const ficha = fichaIntegra()
    ficha.pontos_visiveis = 0
    const violacoes = avaliarSuperficie([ficha])
    assert.deepEqual(violacoes.map((v) => v.regra), ["R2_destaques"])
  })

  it("R2: vazio editorial auditável preserva a despublicação da issue 96", () => {
    for (const slug of ["dr-luisinho", "eudo-raffael"]) {
      const ficha = fichaIntegra(slug)
      ficha.pontos_visiveis = 0
      ficha.destaques_totais = 1
      ficha.destaques_ocultos_revisados = 1
      assert.deepEqual(avaliarSuperficie([ficha]), [])
    }
  })

  it("R2: um destaque oculto sem revisão mantém o vazio em fail-closed", () => {
    const ficha = fichaIntegra("vazio-parcialmente-revisado")
    ficha.pontos_visiveis = 0
    ficha.destaques_totais = 2
    ficha.destaques_ocultos_revisados = 1
    assert.deepEqual(avaliarSuperficie([ficha]).map((v) => v.regra), ["R2_destaques"])
  })

  it("snapshot só reconhece vazio editorial com revisão, motivo e data", () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, "../scripts/audit/superficie-snapshot.sql"),
      "utf8",
    )
    assert.match(sql, /'destaques_totais'/)
    assert.match(sql, /'destaques_ocultos_revisados'/)
    assert.match(sql, /p\.visivel = false/)
    assert.match(sql, /p\.verificado = true/)
    assert.match(sql, /p\.despublicacao_motivo is not null/)
    assert.match(sql, /p\.despublicado_em is not null/)
  })

  it("R3: fonte sem linha ou com resultado inválido reprova por fonte", () => {
    const ficha = fichaIntegra()
    ficha.coletas = {
      "transparencia-sanctions": { resultado: "sucesso_inventado", executado_em: "2026-08-15" },
    }
    const violacoes = avaliarSuperficie([ficha])
    assert.deepEqual(violacoes.map((v) => v.regra), ["R3_coletas", "R3_coletas"])
  })

  it("R4: ultima_atualizacao ausente reprova", () => {
    const ficha = fichaIntegra()
    ficha.ultima_atualizacao = null
    const violacoes = avaliarSuperficie([ficha])
    assert.deepEqual(violacoes.map((v) => v.regra), ["R4_frescor"])
  })

  it("R5: aceita linha publicada ou recibo de estado correto por aba", () => {
    const ficha = fichaIntegra("materializada")
    ficha.linhas_abas = { votacoes_chave: 0, historico_politico: 0 }
    ficha.verificacao_campos = {
      existing_profile_aggregate: "2026-08-14",
      votacoes_chave: {
        estado: "nao_aplicavel",
        motivo: "mandato legislativo anterior ao catálogo",
        verificado_em: "2026-08-15",
      },
      historico_politico: {
        estado: "vazio_confirmado",
        motivo: "varredura TSE sem candidatura anterior",
        verificado_em: "2026-08-15",
      },
    }

    assert.deepEqual(avaliarSuperficie([ficha]), [])
  })

  it("R5: ausência de linhas e de recibos reprova as duas abas", () => {
    const ficha = fichaIntegra("celulas-silenciosas")
    ficha.linhas_abas = { votacoes_chave: 0, historico_politico: 0 }
    const violacoes = avaliarSuperficie([ficha])
    assert.deepEqual(
      violacoes.map((v) => v.regra),
      ["R5_materializacao_abas", "R5_materializacao_abas"],
    )
  })

  it("R6: marcador TSE em qualquer campo servido reprova", () => {
    const ficha = fichaIntegra("marcador-cru")
    ficha.textos_publicos = [
      { campo: "maiores_doadores.nome", texto: "#NULO#" },
      { campo: "historico_politico.observacoes", texto: "TSE: NULL" },
      { campo: "pontos_atencao.titulo", texto: "NÃO DIVULGÁVEL" },
    ]
    const violacoes = avaliarSuperficie([ficha])
    assert.equal(violacoes.length, 3)
    assert.ok(violacoes.every((v) => v.regra === "R6_marcador_tse"))
  })

  it("R7: carimbo ou vocabulário interno em texto servido reprova", () => {
    const ficha = fichaIntegra("carimbo-interno")
    ficha.textos_publicos = [
      { campo: "historico_politico.observacoes", texto: "Mandato + TSE 2026-08-15" },
      { campo: "pontos_atencao.titulo", texto: "curadoria S15.3" },
      { campo: "pontos_atencao.descricao", texto: "lote 4, período em conferência" },
    ]
    const violacoes = avaliarSuperficie([ficha])
    assert.equal(violacoes.length, 3)
    assert.ok(violacoes.every((v) => v.regra === "R7_vocabulario_interno"))
  })

  it("separarPorCoorte: dentro reprova, fora vira backlog", () => {
    const dentroDaCoorte = fichaIntegra("lula")
    dentroDaCoorte.pontos_visiveis = 0
    const legado = fichaIntegra("ficha-legada")
    legado.pontos_visiveis = 0
    const violacoes = avaliarSuperficie([dentroDaCoorte, legado])
    const { dentro, fora } = separarPorCoorte(violacoes, new Set(["lula"]))
    assert.deepEqual(dentro.map((v) => v.slug), ["lula"])
    assert.deepEqual(fora.map((v) => v.slug), ["ficha-legada"])
  })

  it("strict-all promove violações fora da coorte e avisos a falhas", () => {
    const legado = fichaIntegra("ficha-legada")
    legado.pontos_visiveis = 0
    legado.foto_url = null
    const violacoes = avaliarSuperficie([legado])
    const avisos = avaliarFotosSuperficie([legado]).avisos
    const resultado = avaliarFalhasDoGate(violacoes, avisos, new Set(["lula"]), true)

    assert.deepEqual(resultado.dentro, [])
    assert.equal(resultado.fora.length, 1)
    assert.equal(resultado.falhas.length, 2)
    assert.ok(resultado.falhas.some((falha) => falha.regra === "R11_foto_ausente"))
    assert.equal(resultado.avisos.length, 1)
    assert.equal(resultado.avisos[0]?.regra, "R11_foto_ausente")
  })

  it("CLI strict-all reprova backlog e aviso nominal fora da coorte", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "audit-superficie-strict-all-"))
    const snapshot = resolve(dir, "snapshot.json")
    const legado = fichaIntegra("ficha-legada")
    legado.pontos_visiveis = 0
    legado.foto_url = null
    writeFileSync(snapshot, JSON.stringify([legado]))
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/audit/audit-superficie.ts",
          `--from-snapshot=${snapshot}`,
          "--strict-all",
        ],
        { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" },
      )
      const output = `${result.stdout}\n${result.stderr}`
      assert.equal(result.status, 1)
      assert.match(output, /strict-all/)
      assert.match(output, /fora da coorte/)
      assert.match(output, /R11_foto_ausente/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("R6-R7 reprovam globalmente, inclusive fora da coorte", () => {
    const legado = fichaIntegra("ficha-legada")
    legado.textos_publicos = [
      { campo: "maiores_doadores.nome", texto: "#NE" },
      { campo: "pontos_atencao.descricao", texto: "curadoria S2" },
    ]
    const { dentro, fora } = separarPorCoorte(
      avaliarSuperficie([legado]),
      new Set(["outra-ficha"]),
    )
    assert.deepEqual(
      dentro.map((v) => v.regra),
      ["R6_marcador_tse", "R7_vocabulario_interno"],
    )
    assert.deepEqual(fora, [])
  })

  it("violações se acumulam por ficha e por regra", () => {
    const ficha = fichaIntegra("tudo-errado")
    ficha.verificacao_campos = {}
    ficha.pontos_visiveis = 0
    ficha.coletas = {}
    ficha.ultima_atualizacao = null
    ficha.linhas_abas = { votacoes_chave: 0, historico_politico: 0 }
    const violacoes = avaliarSuperficie([ficha])
    assert.equal(violacoes.length, 7)
    assert.ok(violacoes.every((v) => v.slug === "tudo-errado"))
  })

  it("R8: reprova nominalmente reversão PSDB-PV no mesmo ano do caso Bocalom", () => {
    const ficha = fichaIntegra("tiao-bocalom")
    ficha.integridade_partidaria.mudancas_visiveis = [
      { id: "m1", ano: 2004, partido_anterior: "PSDB", partido_novo: "PV", data_mudanca: null, contexto: null },
      { id: "m2", ano: 2004, partido_anterior: "PV", partido_novo: "PSDB", data_mudanca: null, contexto: null },
    ]

    const { violacoes } = avaliarIntegridadePartidaria([ficha])
    assert.equal(violacoes.length, 1)
    assert.equal(violacoes[0].regra, "R8_reversao_mesmo_ano")
    assert.equal(violacoes[0].slug, "tiao-bocalom")
    assert.match(violacoes[0].detalhe, /2004.*PSDB.*PV/)
  })

  it("R9: reprova nominalmente cadeia quebrada antes de PV-DEM", () => {
    const ficha = fichaIntegra("tiao-bocalom")
    ficha.integridade_partidaria.mudancas_visiveis = [
      { id: "m1", ano: 2010, partido_anterior: "PSDB", partido_novo: "DEM", data_mudanca: null, contexto: null },
      { id: "m2", ano: 2014, partido_anterior: "PV", partido_novo: "DEM", data_mudanca: null, contexto: null },
    ]

    const { violacoes } = avaliarIntegridadePartidaria([ficha])
    assert.equal(violacoes.length, 1)
    assert.equal(violacoes[0].regra, "R9_cadeia_quebrada")
    assert.match(violacoes[0].detalhe, /DEM.*PV/)
  })

  it("R9: ordena transições sem data pelo encadeamento, não pelo UUID", () => {
    const rows = [
      { id: "z", ano: 2014, partido_anterior: "A", partido_novo: "B", data_mudanca: null, contexto: null },
      { id: "a", ano: 2014, partido_anterior: "B", partido_novo: "C", data_mudanca: null, contexto: null },
    ]
    assert.equal(temCadeiaCronologicaPartidariaIntegra(rows), true)
  })

  it("R9: não aceita ordem por UUID quando o partido anterior já fixa a cadeia", () => {
    const rows = [
      { id: "base", ano: 2010, partido_anterior: "X", partido_novo: "A", data_mudanca: null, contexto: null },
      { id: "a", ano: 2014, partido_anterior: "A", partido_novo: "B", data_mudanca: null, contexto: null },
      { id: "z", ano: 2014, partido_anterior: "C", partido_novo: "A", data_mudanca: null, contexto: null },
    ]
    assert.equal(temCadeiaCronologicaPartidariaIntegra(rows), false)
  })

  it("R9: aplica a mesma normalização da ficha antes de avaliar a cadeia", () => {
    const ficha = fichaIntegra("linha-normalizada")
    ficha.integridade_partidaria.mudancas_visiveis = [
      { id: "m1", ano: 2009, partido_anterior: "Sem partido", partido_novo: "MDB", data_mudanca: "2009-01-01", contexto: "Wikidata P102" },
      { id: "m2", ano: 2018, partido_anterior: "MDB", partido_novo: "DEM", data_mudanca: "2018-01-01", contexto: "Wikidata P102" },
      { id: "m3", ano: 2020, partido_anterior: "MDB", partido_novo: "PATRIOTA", data_mudanca: null, contexto: "Mudança observada entre eleições TSE (2020)" },
    ]
    assert.deepEqual(avaliarIntegridadePartidaria([ficha]).violacoes, [])
  })

  it("R9: âncora honesta posterior reinicia a cadeia sem falso positivo", () => {
    const rows = [
      { id: "m1", ano: 2000, partido_anterior: "PSB", partido_novo: "PHS", data_mudanca: null, contexto: null },
      { id: "m2", ano: 2004, partido_anterior: "PHS", partido_novo: "PSD", data_mudanca: null, contexto: null },
      { id: "m3", ano: 2008, partido_anterior: "Histórico anterior não determinado", partido_novo: "PDT", data_mudanca: null, contexto: null },
    ]
    assert.equal(temCadeiaCronologicaPartidariaIntegra(rows), true)
  })

  it("R10: partido sustentado somente por trajetória despublicada gera aviso", () => {
    const ficha = fichaIntegra("partido-oculto")
    ficha.integridade_partidaria = {
      mudancas_visiveis: [
        { id: "m1", ano: 2014, partido_anterior: "PSDB", partido_novo: "PV", data_mudanca: null, contexto: null },
      ],
      partidos_historico_visivel: ["PSDB"],
      partidos_historico_despublicado: ["PV"],
    }

    const { violacoes, avisos } = avaliarIntegridadePartidaria([ficha])
    assert.deepEqual(violacoes, [])
    assert.equal(avisos.length, 1)
    assert.equal(avisos[0].regra, "R10_partido_so_despublicado")
    assert.match(avisos[0].detalhe, /PV/)
  })

  it("R11: placeholder reprova globalmente e foto nula vira aviso nominal", () => {
    const placeholder = fichaIntegra("foto-falsa")
    placeholder.foto_url = "https://ui-avatars.com/api/?name=FF"
    const semFoto = fichaIntegra("sem-foto")
    semFoto.foto_url = null

    const { violacoes, avisos } = avaliarFotosSuperficie([placeholder, semFoto])
    assert.deepEqual(violacoes.map((v) => [v.regra, v.slug]), [["R11_foto_placeholder", "foto-falsa"]])
    assert.deepEqual(avisos.map((v) => [v.regra, v.slug]), [["R11_foto_ausente", "sem-foto"]])
  })

  it("backlog não público é encontrado nominalmente sem reprovar o gate", () => {
    const andre = fichaIntegra("andre-do-prado")
    andre.publica = false
    andre.integridade_partidaria.mudancas_visiveis = [
      { id: "a1", ano: 2004, partido_anterior: "PL", partido_novo: "PSTU", data_mudanca: null, contexto: null },
      { id: "a2", ano: 2004, partido_anterior: "PSTU", partido_novo: "PL", data_mudanca: null, contexto: null },
    ]
    const maria = fichaIntegra("maria-da-consolacao")
    maria.publica = false
    maria.integridade_partidaria.mudancas_visiveis = [
      { id: "c1", ano: 2016, partido_anterior: "PSOL", partido_novo: "PT DO B", data_mudanca: null, contexto: null },
      { id: "c2", ano: 2016, partido_anterior: "PT DO B", partido_novo: "PSOL", data_mudanca: null, contexto: null },
    ]

    const { violacoes, avisos } = avaliarIntegridadePartidaria([andre, maria])
    assert.deepEqual(violacoes, [])
    assert.deepEqual(avisos.map((aviso) => aviso.slug), ["andre-do-prado", "maria-da-consolacao"])
    assert.ok(avisos.every((aviso) => aviso.regra === "R8_reversao_mesmo_ano"))
  })

  it("snapshot sem nenhuma ficha pública não satisfaz a cobertura do gate", () => {
    const privada = fichaIntegra("somente-backlog")
    privada.publica = false
    assert.equal(contarFichasPublicas([privada]), 0)
    assert.equal(contarFichasPublicas([{ ...privada, publica: null }]), 0)
  })

  it("CLI reprova snapshot que contém somente backlog não público", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "audit-superficie-"))
    const snapshot = resolve(dir, "snapshot.json")
    const privada = fichaIntegra("somente-backlog")
    privada.publica = false
    writeFileSync(snapshot, JSON.stringify([privada]))
    try {
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/audit/audit-superficie.ts", `--from-snapshot=${snapshot}`],
        { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" },
      )
      assert.equal(result.status, 1)
      assert.match(`${result.stdout}\n${result.stderr}`, /zero candidato público/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("fixture do Bocalom executa o CLI e reprova nominalmente R8, R9 e avisa R10", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/audit/audit-superficie.ts",
        "--from-snapshot=tests/fixtures/audit-superficie-integridade-bocalom.json",
      ],
      { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" },
    )
    const output = `${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /tiao-bocalom/)
    assert.match(output, /R8_reversao_mesmo_ano/)
    assert.match(output, /R9_cadeia_quebrada/)
    assert.match(output, /R10_partido_so_despublicado/)
  })

  it("fixture de fotos executa R11 com falha para placeholder e aviso para null", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/audit/audit-superficie.ts",
        "--from-snapshot=tests/fixtures/audit-superficie-fotos.json",
      ],
      { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" },
    )
    const output = `${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /R11_foto_placeholder.*foto-falsa/)
    assert.match(output, /R11_foto_ausente.*sem-foto/)
  })
})
