import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  FONTES_POR_CANDIDATO,
  FONTES_POR_COLUNA,
  linhasPorFonte,
  provenienciaDaColuna,
  type ColetaPorFonte
} from "../scripts/audit/lib/coleta-proveniencia"
import { COLUNAS } from "../scripts/audit/lib/coverage-model"
import { FONTES } from "../scripts/lib/coleta-log"

describe("provenienciaDaColuna separa o zero provado do zero presumido", () => {
  it("sancoes sem nenhuma tentativa e nunca_verificado, nao zero", () => {
    // O caso do enunciado: 194 fichas com sancoes vazias e nenhuma coleta.
    const p = provenienciaDaColuna("sancoes", {})
    assert.equal(p.veredito, "nunca_verificado")
    assert.deepEqual(p.faltando, ["transparencia-sanctions"])
  })

  it("zero_provado exige que a fonte tenha respondido vazio", () => {
    const coleta: ColetaPorFonte = {
      "transparencia-sanctions": { resultado: "vazio_confirmado" }
    }
    assert.equal(provenienciaDaColuna("sancoes", coleta).veredito, "zero_provado")
  })

  it("credencial ausente nao vira zero: vira nao_sabemos", () => {
    const coleta: ColetaPorFonte = {
      "transparencia-sanctions": {
        resultado: "erro",
        detalhe: "TRANSPARENCIA_API_KEY ausente"
      }
    }
    const p = provenienciaDaColuna("sancoes", coleta)
    assert.equal(p.veredito, "nao_sabemos")
    assert.deepEqual(p.duvidosas, ["transparencia-sanctions"])
  })

  it("indeterminado tambem nao vira zero", () => {
    const coleta: ColetaPorFonte = {
      "google-news": { resultado: "indeterminado" }
    }
    assert.equal(provenienciaDaColuna("noticias", coleta).veredito, "nao_sabemos")
  })

  it("uma fonte de duas sem tentativa ja impede o zero_provado", () => {
    // Cota parlamentar depende da Camara E do CEAPS do Senado. Confirmar so uma
    // e afirmar sobre metade da vida parlamentar da pessoa.
    const coleta: ColetaPorFonte = {
      camara: { resultado: "vazio_confirmado" }
    }
    const p = provenienciaDaColuna("gastos", coleta)
    assert.equal(p.veredito, "nunca_verificado")
    assert.deepEqual(p.faltando, ["ceaps-senado"])
  })

  it("nunca_verificado ganha de nao_sabemos quando os dois aparecem", () => {
    // Fonte que ninguem tentou e trabalho pendente com endereco; esconder isso
    // atras de "houve um erro" faz parecer que ja foram la e nao deu.
    const coleta: ColetaPorFonte = { camara: { resultado: "erro" } }
    const p = provenienciaDaColuna("gastos", coleta)
    assert.equal(p.veredito, "nunca_verificado")
    assert.deepEqual(p.faltando, ["ceaps-senado"])
    assert.deepEqual(p.duvidosas, ["camara"])
  })

  it("dado encontrado em qualquer fonte ganha de tudo", () => {
    const coleta: ColetaPorFonte = {
      camara: { resultado: "encontrado", volume: 12 }
    }
    assert.equal(provenienciaDaColuna("projetos", coleta).veredito, "coletado")
  })

  it("curadoria manual ganha procedência sem fingir ingest automático", () => {
    assert.deepEqual(FONTES_POR_COLUNA.processos, ["processos-curadoria"])
    assert.deepEqual(FONTES_POR_COLUNA.contradicoes, ["contradicoes-curadoria"])
    assert.equal(provenienciaDaColuna("processos", {}).veredito, "nunca_verificado")
    assert.equal(provenienciaDaColuna("posicoes", {}).veredito, "sem_ingest")
  })

  it("contradição sem achado no escopo não vira ausência comprovada", () => {
    const coleta: ColetaPorFonte = {
      "contradicoes-curadoria": { resultado: "sem_achado_no_escopo" }
    }
    assert.equal(
      provenienciaDaColuna("contradicoes", coleta).veredito,
      "curadoria_concluida_sem_achado"
    )
  })

  it("coluna fora do mapa nunca vira zero provado por acidente", () => {
    assert.equal(provenienciaDaColuna("coluna-que-nao-existe", {}).veredito, "nao_sabemos")
  })
})

describe("o mapa coluna -> fontes fica em dia com o resto do sistema", () => {
  it("toda coluna do relatorio tem entrada declarada", () => {
    const faltando = COLUNAS.map((c) => c.key).filter((k) => !(k in FONTES_POR_COLUNA))
    assert.deepEqual(
      faltando,
      [],
      `coluna sem procedencia declarada em coleta-proveniencia.ts: ${faltando.join(", ")}`
    )
  })

  it("nenhuma entrada aponta para fonte que nao existe", () => {
    const invalidas = Object.entries(FONTES_POR_COLUNA).flatMap(([coluna, fontes]) =>
      fontes.filter((f) => !(f in FONTES)).map((f) => `${coluna} -> ${f}`)
    )
    assert.deepEqual(invalidas, [], `fonte inexistente: ${invalidas.join(", ")}`)
  })

  it("a visão por fonte inclui só fontes cujo alvo é candidato", () => {
    const esperadas = Object.entries(FONTES)
      .filter(([, escopo]) => escopo === "candidato")
      .map(([fonte]) => fonte)
      .concat("tse-cpf")
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
    assert.deepEqual(FONTES_POR_CANDIDATO, esperadas)
    assert.ok(FONTES_POR_CANDIDATO.includes("tse-cpf"))
    assert.ok(!FONTES_POR_CANDIDATO.includes("siconfi"))
  })

  it("a ausência de linha vira nunca verificado sem apagar o último desfecho", () => {
    const linhas = linhasPorFonte({
      tse: {
        resultado: "encontrado",
        volume: 3,
        executado_em: "2026-08-05T12:00:00Z"
      },
      "busca-redes-manual": { resultado: "encontrado", volume: 1 }
    })
    assert.deepEqual(
      linhas.find((linha) => linha.fonte === "tse"),
      {
        fonte: "tse",
        resultado: "encontrado",
        volume: 3,
        executado_em: "2026-08-05T12:00:00Z"
      }
    )
    assert.deepEqual(
      linhas.find((linha) => linha.fonte === "tse-cpf"),
      {
        fonte: "tse-cpf",
        resultado: "nunca_verificado"
      }
    )
    assert.deepEqual(
      linhas.find((linha) => linha.fonte === "busca-redes-manual"),
      {
        fonte: "busca-redes-manual",
        resultado: "encontrado",
        volume: 1
      }
    )
  })

  it("fonte não aplicável sem tentativa vira N/A, mas tentativa real prevalece", () => {
    const motivo = "N/A pelo histórico e pelo seed: sem mandato ou ID da Câmara"
    const semTentativa = linhasPorFonte({}, { camara: motivo })
    assert.deepEqual(
      semTentativa.find((linha) => linha.fonte === "camara"),
      {
        fonte: "camara",
        resultado: "nao_aplicavel",
        detalhe: motivo
      }
    )

    const comTentativa = linhasPorFonte(
      { camara: { resultado: "encontrado", volume: 2 } },
      { camara: motivo }
    )
    assert.deepEqual(
      comTentativa.find((linha) => linha.fonte === "camara"),
      {
        fonte: "camara",
        resultado: "encontrado",
        volume: 2
      }
    )
  })

  it("o snapshot que alimenta o relatorio traz o campo coleta", () => {
    // Sem esta linha no SQL, o relatorio le `coleta` como undefined e TODA
    // celula vira nunca_verificado, o que parece funcionar e esta errado.
    const sql = readFileSync(join(process.cwd(), "scripts/audit/coverage-snapshot.sql"), "utf8")
    assert.match(sql, /'coleta',\s*coalesce\(/)
    assert.match(sql, /from coleta_log_ultima u/)
  })

  it("o histórico do snapshot exclui o que a ficha despublicou", () => {
    const sql = readFileSync(join(process.cwd(), "scripts/audit/coverage-snapshot.sql"), "utf8")
    assert.match(
      sql,
      /from historico_politico h\s+where h\.candidato_id = c\.id and h\.despublicado_em is null/
    )
  })
})
