import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

/**
 * Toda rota protegida por segredo compara em tempo constante.
 *
 * Ate 2026-08-03, `internal/runtime-smoke` era a unica das cinco que usava
 * `!==`. Comparacao de string sai no primeiro byte diferente, entao o tempo de
 * resposta carrega quantos bytes do prefixo o atacante acertou. As outras
 * quatro ja passavam por `secretsMatch` (`timingSafeEqual` sobre o SHA-256 dos
 * dois lados) ou por `verifyRevalidateSecret`.
 *
 * Isto e teste de fonte, e nao de comportamento, porque nao ha comportamento
 * observavel a distinguir: o defeito e o canal lateral de tempo, e as duas
 * versoes aceitam e recusam exatamente os mesmos segredos.
 */

const root = process.cwd()

const ROTAS_DE_SEGREDO = [
  { arquivo: "src/app/api/internal/runtime-smoke/route.ts", variavel: "expectedSecret" },
  { arquivo: "src/app/api/internal/published-consistency/route.ts", variavel: "expectedSecret" },
  { arquivo: "src/app/api/alerts/send-digest/route.ts", variavel: "expectedSecret" },
  { arquivo: "src/app/api/news/refresh/route.ts", variavel: "expectedSecret" },
  { arquivo: "src/app/api/news/refresh/recover/route.ts", variavel: "expectedSecret" },
  { arquivo: "src/lib/revalidate-cache.ts", variavel: "expectedTrimmed" },
]

const COMPARADORES_ACEITOS = ["secretsMatch", "timingSafeEqual"]

describe("rotas protegidas por segredo comparam em tempo constante", () => {
  for (const { arquivo, variavel } of ROTAS_DE_SEGREDO) {
    it(`${arquivo} nao compara o segredo com === nem !==`, () => {
      const linhas = readFileSync(join(root, arquivo), "utf8").split("\n")

      // O segredo precisa estar de um dos lados do operador. `typeof x ===
      // "string"` na mesma linha nao conta, e comparar COMPRIMENTO de buffer
      // tambem nao: e pre-condicao legitima do `timingSafeEqual`.
      const comparacaoDireta = new RegExp(
        `(===|!==)\\s*(?:\\w+\\.)*${variavel}\\b(?!\\.length)|(?:\\w+\\.)*${variavel}\\b(?!\\.length)\\s*(===|!==)`,
      )

      const suspeitas = linhas
        .map((linha, i) => ({ linha: linha.trim(), numero: i + 1 }))
        .filter(({ linha }) => !linha.startsWith("//") && !linha.startsWith("*"))
        .filter(({ linha }) => comparacaoDireta.test(linha))

      assert.deepEqual(
        suspeitas,
        [],
        `${arquivo} compara ${variavel} com igualdade direta; use ${COMPARADORES_ACEITOS.join(" ou ")}`,
      )
    })

    it(`${arquivo} usa um comparador de tempo constante`, () => {
      const fonte = readFileSync(join(root, arquivo), "utf8")

      assert.ok(
        COMPARADORES_ACEITOS.some((comparador) => fonte.includes(comparador)),
        `${arquivo} deveria comparar segredo com ${COMPARADORES_ACEITOS.join(" ou ")}`,
      )
    })
  }
})
