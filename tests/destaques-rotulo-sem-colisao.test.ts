import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

/**
 * "Destaques" e o rotulo PUBLICO do contador de pontos de atencao na ficha, e ele
 * conta todos os pontos publicos, inclusive `feito_positivo`
 * (total_pontos_atencao em src/lib/api.ts).
 *
 * A regua de cobertura tem uma coluna que conta os pontos visiveis MENOS os
 * positivos (coverage-snapshot.sql). Sao numeros diferentes para o mesmo
 * candidato. Enquanto as duas se chamaram "Alertas" isso era coerente; a
 * renomeacao publica de 07/08/2026 levou o rotulo novo para a regua sem mudar a
 * conta, e criou duas medidas homonimas.
 *
 * docs/cobertura-de-dados.md registra por que isso e caro: em 04/08/2026 duas
 * medidas com o mesmo nome discordaram e a discordancia virou alarme de regressao
 * que nao existia. "Duas reguas geram dois vocabularios, e a diferenca entre eles
 * e indistinguivel de regressao para quem le."
 *
 * Este teste nao compara os numeros: eles DEVEM ser diferentes. Ele impede que os
 * dois voltem a se chamar igual.
 */
const COVERAGE_MODEL = join(process.cwd(), "scripts", "audit", "lib", "coverage-model.ts")

function rotuloDaColuna(chave: string): string | null {
  const fonte = readFileSync(COVERAGE_MODEL, "utf8")
  const achado = new RegExp(`key:\\s*"${chave}",\\s*label:\\s*"([^"]+)"`).exec(fonte)
  return achado ? achado[1] : null
}

describe("rótulos da régua de cobertura não colidem com os rótulos públicos", () => {
  it("a coluna de pontos de atenção não se chama Destaques", () => {
    const rotulo = rotuloDaColuna("alertas")
    assert.ok(rotulo, "coluna `alertas` desapareceu da régua")
    assert.notEqual(
      rotulo,
      "Destaques",
      "a ficha pública já usa Destaques para uma conta que inclui feito_positivo; " +
        "esta coluna exclui. Nomeie pelo que a coluna mede.",
    )
  })

  it("o rótulo diz explicitamente que positivos ficam fora", () => {
    const rotulo = rotuloDaColuna("alertas") ?? ""
    assert.match(
      rotulo,
      /sem positivos/i,
      "quem lê o relatório precisa saber, no próprio rótulo, que a conta exclui feito_positivo",
    )
  })

  it("nenhuma outra coluna da régua se chama exatamente Destaques", () => {
    const fonte = readFileSync(COVERAGE_MODEL, "utf8")
    const rotulos = [...fonte.matchAll(/key:\s*"[^"]+",\s*label:\s*"([^"]+)"/g)].map((m) => m[1])
    const colisoes = rotulos.filter((r) => r === "Destaques")
    assert.deepEqual(
      colisoes,
      [],
      `a régua não deve reusar o rótulo público "Destaques": ${colisoes.length} coluna(s) usam`,
    )
  })
})
