import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

const SRC = readFileSync(resolve(process.cwd(), "src/components/ComparadorPanel.tsx"), "utf-8")

/**
 * Medido no browser a 768px antes do fix: a tabela do seletor ocupava 754px num
 * wrapper de 657px (ou seja, ja rolava), mas `table-auto` starvava a coluna do
 * nome, que quebrava em linhas de 2 a 3 letras. O span do nome media 21px de
 * largura por 100px de altura: "AU / GU / STO / CU / RY".
 *
 * Depois: piso de 56rem e nome sem quebra. O span passa a 20px de altura, e a
 * tabela rola dentro do `region` focavel em vez de esmagar a coluna.
 *
 * A largura natural da tabela com o nome numa linha so e 868px, entao o scroll
 * entre 768px e ~964px e inerente ao conteudo, nao ao piso.
 */
describe("tabela do comparador", () => {
  it("tem piso de largura que força scroll em vez de esmagar a coluna do nome", () => {
    assert.match(
      SRC,
      /<table className="w-full min-w-\[56rem\] table-auto text-left">/,
      "a tabela do seletor precisa do piso de 56rem",
    )
    assert.doesNotMatch(SRC, /min-w-\[44rem\]/, "o piso antigo de 44rem não pode voltar")
  })

  it("o nome do candidato não quebra linha", () => {
    assert.match(
      SRC,
      /<span className="whitespace-nowrap font-heading text-\[length:var\(--text-body-lg\)\] uppercase leading-tight text-foreground">\s*\{candidato\.nome_urna\}/,
      "o nome na linha da tabela precisa de whitespace-nowrap",
    )
  })

  it("o wrapper continua sendo uma região rolável e focável", () => {
    // Sem isso, forçar o scroll seria trocar um defeito por outro: teclado sem
    // acesso ao conteúdo que saiu da viewport.
    assert.match(SRC, /className="overflow-x-auto overscroll-x-contain"/)
    assert.match(SRC, /role="region"/)
    assert.match(SRC, /tabIndex=\{0\}/)
    assert.match(SRC, /aria-label="Lista de candidatos para comparar\. Role na horizontal/)
  })

  it("abaixo de md a lista continua sendo cards, não a tabela", () => {
    assert.match(SRC, /<div className="hidden md:block">/)
  })
})
