import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test, { describe } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const matrizPath = join(ROOT, "QA", "2026-08-10-matriz-17-itens.md")
const matriz = readFileSync(matrizPath, "utf8")

const linhas = matriz
  .split("\n")
  .filter((linha) => /^\| \d+ \|/.test(linha))
  .map((linha) => linha.split("|").slice(1, -1).map((celula) => celula.trim()))

describe("matriz canônica PF Ajustes", () => {
  test("contém exatamente os itens 1 a 17 e mantém o item 18 fora da matriz", () => {
    assert.deepEqual(
      linhas.map(([numero]) => Number(numero)),
      Array.from({ length: 17 }, (_, indice) => indice + 1)
    )
    assert.doesNotMatch(matriz, /^\| 18 \|/m)
    assert.match(matriz, /item 18[^\n]*(?:adiado|fora do escopo)/i)
  })

  test("cada linha registra causa, correção, universo, prova, ato, readback e estado", () => {
    for (const linha of linhas) {
      assert.equal(linha.length, 8, `item ${linha[0]} com quantidade de colunas incorreta`)
      for (const [indice, celula] of linha.entries()) {
        assert.ok(celula.length > 0, `item ${linha[0]} com coluna ${indice + 1} vazia`)
      }
      assert.match(linha[7], /NÃO VERDE/, `item ${linha[0]} foi tratado como verde localmente`)
      assert.doesNotMatch(linha[5], /^(?:n\/?a|nenhum)$/i, `item ${linha[0]} sem ato externo`)
      assert.doesNotMatch(linha[6], /^(?:n\/?a|nenhum)$/i, `item ${linha[0]} sem readback público`)
    }
  })

  test("as quatro frentes do workflow apontam para provas globais versionadas", () => {
    const item = (numero: number) => linhas.find(([valor]) => Number(valor) === numero)?.join(" ") ?? ""

    assert.match(item(4), /194/)
    assert.match(item(4), /970 células/)
    assert.match(item(4), /292 estados residuais/)
    assert.match(item(4), /241 indeterminados/)
    assert.match(item(4), /51 limitados/)
    assert.match(item(4), /fonte|proveniência/i)
    assert.match(item(7), /13 linhas/)
    assert.match(item(7), /75 pares/)
    assert.match(item(11), /194 fichas/)
    assert.match(item(11), /desktop/)
    assert.match(item(11), /mobile/)
    assert.match(item(14), /194/)
    assert.match(item(14), /14 com conteúdo/)
    assert.match(item(14), /28 limitadas/)
    assert.match(item(14), /152 indeterminadas/)
    assert.match(item(14), /fonte|proveniência/i)

    for (const caminho of [
      "QA/evidencias/2026-08-11-item7-senado/auditoria-oficial-13-linhas.json",
      "QA/evidencias/2026-08-11-item11-cards-dinheiro/auditoria-desktop.json",
      "QA/evidencias/2026-08-11-item11-cards-dinheiro/auditoria-mobile.json",
      "supabase/migrations/20260811100000_votacoes_senado_chave_exata.sql",
      "supabase/migrations/20260811100100_votacoes_senado_contrato_exato.sql",
      "supabase/migrations/20260811101000_destaques_estados_residuais_194.sql",
      "supabase/migrations/20260811101100_historico_fontes_oficiais_cadu_cappelli.sql",
      "supabase/migrations/20260811101200_processos_legados_fontes_oficiais.sql",
      "QA/2026-08-11-workflow-final-pf-ajustes.md",
      "QA/evidencias/2026-08-11-workflow-final/snapshots/comparacao.json",
    ]) {
      assert.ok(existsSync(join(ROOT, caminho)), caminho)
    }
  })

  test("o resumo integrado usa as contagens finais do terceiro ciclo", () => {
    assert.match(matriz, /2\.997\/2\.997 testes/)
    assert.match(matriz, /293 \+ 100 = 393/)
    assert.match(matriz, /70 \+ 323 = 393/)
    assert.doesNotMatch(matriz, /carga residual 80\/32\/159/)
    assert.doesNotMatch(matriz, /35 conteúdo, 8 limitadas, 151 indeterminadas/)
  })
})
