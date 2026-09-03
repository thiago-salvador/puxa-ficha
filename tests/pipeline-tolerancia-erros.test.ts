import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import {
  ERRO_MAX_FRACAO_PADRAO,
  avaliarToleranciaPorFonte,
  parseErroMaxFracao,
} from "../scripts/lib/pipeline-tolerancia-erros"
import type { IngestResult } from "../scripts/lib/types"

/**
 * O codigo de saida de `scripts/ingest-all.ts` deriva direto de `reprovada`:
 * qualquer fonte reprovada, ou tarefa que morreu antes de devolver resultado,
 * sai 1. Abaixo do limiar sai 0 e os erros ficam em `coleta_log`.
 */

function resultado(source: string, candidato: string, erros: string[] = []): IngestResult {
  return {
    source,
    candidato,
    tables_updated: [],
    rows_upserted: erros.length > 0 ? 0 : 10,
    errors: erros,
    duration_ms: 1,
  }
}

function pulado(source: string, candidato: string): IngestResult {
  return { ...resultado(source, candidato), skipped: true, skip_reason: "acervo congelado" }
}

describe("parseErroMaxFracao", () => {
  it("usa 0.25 quando a variavel esta ausente ou vazia", () => {
    assert.equal(parseErroMaxFracao(undefined), ERRO_MAX_FRACAO_PADRAO)
    assert.equal(parseErroMaxFracao("  "), ERRO_MAX_FRACAO_PADRAO)
    assert.equal(ERRO_MAX_FRACAO_PADRAO, 0.25)
  })

  it("aceita fracao explicita entre 0 e 1", () => {
    assert.equal(parseErroMaxFracao("0"), 0)
    assert.equal(parseErroMaxFracao("0.5"), 0.5)
    assert.equal(parseErroMaxFracao("1"), 1)
  })

  it("falha fechado em valor invalido", () => {
    assert.throws(() => parseErroMaxFracao("25%"), /fracao entre 0 e 1/)
    assert.throws(() => parseErroMaxFracao("2"), /fracao entre 0 e 1/)
    assert.throws(() => parseErroMaxFracao("-1"), /fracao entre 0 e 1/)
  })
})

describe("avaliarToleranciaPorFonte", () => {
  it("abaixo do limiar nao reprova a fonte", () => {
    // 2 de 10 candidatos com erro: 20%, abaixo dos 25%.
    const resultados = [
      ...Array.from({ length: 8 }, (_, i) => resultado("senado", `ok-${i}`)),
      resultado("senado", "ruim-1", ["fetch failed"]),
      resultado("senado", "ruim-2", ["fetch failed"]),
    ]

    const [senado] = avaliarToleranciaPorFonte(resultados, ERRO_MAX_FRACAO_PADRAO)
    assert.equal(senado.comErro, 2)
    assert.equal(senado.tentativas, 10)
    assert.equal(senado.fracao, 0.2)
    assert.equal(senado.reprovada, false)
  })

  it("acima do limiar reprova a fonte", () => {
    const resultados = [
      ...Array.from({ length: 6 }, (_, i) => resultado("senado", `ok-${i}`)),
      ...Array.from({ length: 4 }, (_, i) => resultado("senado", `ruim-${i}`, ["fetch failed"])),
    ]

    const [senado] = avaliarToleranciaPorFonte(resultados, ERRO_MAX_FRACAO_PADRAO)
    assert.equal(senado.fracao, 0.4)
    assert.equal(senado.reprovada, true)
    assert.equal(senado.fonteMorta, false)
  })

  it("fonte inteira morta reprova mesmo com limiar frouxo", () => {
    const resultados = Array.from({ length: 3 }, (_, i) =>
      resultado("camara", `ruim-${i}`, ["fetch failed"]),
    )

    const [camara] = avaliarToleranciaPorFonte(resultados, 1)
    assert.equal(camara.fonteMorta, true)
    assert.equal(camara.reprovada, true)
  })

  it("isola o veredito por fonte", () => {
    const resultados = [
      resultado("camara", "ok-1"),
      resultado("camara", "ok-2"),
      resultado("senado", "ruim-1", ["fetch failed"]),
    ]

    const porFonte = new Map(avaliarToleranciaPorFonte(resultados, 0.25).map((t) => [t.fonte, t]))
    assert.equal(porFonte.get("camara")!.reprovada, false)
    assert.equal(porFonte.get("senado")!.reprovada, true)
  })

  it("candidato pulado nao entra no denominador nem no numerador", () => {
    const resultados = [
      resultado("camara", "ok-1"),
      resultado("camara", "ok-2"),
      resultado("camara", "ok-3"),
      resultado("camara", "ruim-1", ["fetch failed"]),
      pulado("camara", "congelado-1"),
      pulado("camara", "congelado-2"),
    ]

    const [camara] = avaliarToleranciaPorFonte(resultados, ERRO_MAX_FRACAO_PADRAO)
    assert.equal(camara.tentativas, 4)
    assert.equal(camara.fracao, 0.25)
    assert.equal(camara.reprovada, false)
  })
})

describe("contrato de saida do ingest-all", () => {
  const fonte = readFileSync(
    fileURLToPath(new URL("../scripts/ingest-all.ts", import.meta.url)),
    "utf-8",
  )

  const main = fonte.slice(fonte.indexOf("async function main()"))

  it("tem uma unica saida 1 em main, guardada pelas fontes reprovadas", () => {
    const saidas = main.match(/process\.exit\(1\)/g) ?? []
    assert.equal(saidas.length, 1, "main deveria ter exatamente uma saida 1")

    const guarda = main.slice(0, main.indexOf("process.exit(1)"))
    const ultimaCondicao = guarda.lastIndexOf("if (")
    assert.match(
      guarda.slice(ultimaCondicao),
      /if \(reprovadas\.length > 0 \|\| taskFailures > 0\) \{/,
      "a saida 1 voltou a ser condicionada por outra coisa (totalErrors, por exemplo)",
    )
  })

  it("calcula o veredito com o limiar lido do ambiente", () => {
    assert.match(main, /avaliarToleranciaPorFonte\(allResults, erroMaxFracao\)/)
    assert.match(fonte, /parseErroMaxFracao\(process\.env\.PF_INGEST_ERRO_MAX_FRACAO\)/)
  })
})
