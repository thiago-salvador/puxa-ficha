import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"
import { join, resolve } from "node:path"

/**
 * A camada normativa saiu de `Settings/` dentro do app e passou a viver em
 * `Status/`, na raiz do repositório, em 16/08/2026. Este contrato acompanhou a
 * mudança: ele guarda a camada que manda hoje, não a que mandava antes.
 *
 * Sem ele, a normativa pode sumir ou ser renomeada sem nada reprovar, que é
 * exatamente o modo de falha que o teste original existia para impedir.
 */

const raizRepo = resolve(process.cwd(), "..")
const statusDir = join(raizRepo, "Status")

/**
 * ONDE ESTE CONTRATO VALE, e por que ele nao pode simplesmente reprovar fora dali.
 *
 * Ele guarda a camada normativa do repositorio de OPERACAO (`Status/`, `contratos/` e o
 * README da raiz), que mora um nivel acima do app quando o app vive em `pf-16-08/app/`.
 *
 * Na migracao de 18/08/2026 o codigo passou a ser a RAIZ do repositorio publico
 * `thiago-salvador/puxa-ficha`, e ali `cwd/..` nao e o repo de operacao, e sim a pasta do
 * runner. A normativa legitimamente nao existe nesse contexto, e o teste quebrava com ENOENT
 * em `/home/runner/work/puxa-ficha/README.md`.
 *
 * A saida NAO e afrouxar a assercao: onde a normativa existe, ela continua sendo cobrada
 * inteira. O teste detecta o contexto e, quando roda fora do repo de operacao, diz isso em
 * voz alta em vez de passar calado, para ninguem achar que o guarda esta ativo quando nao esta.
 */
const dentroDoRepoDeOperacao = existsSync(statusDir)

function pularForaDaOperacao(t: { skip: (motivo: string) => void }): boolean {
  if (dentroDoRepoDeOperacao) return false
  t.skip(
    "fora do repositorio de operacao: nao existe `Status/` acima de " +
      process.cwd() +
      ". Este contrato so vale no pf-16-08, onde a camada normativa mora."
  )
  return true
}

const documentosCanonicos = [
  "README.md",
  "REGRAS.md",
  "ARQUITETURA.md",
  "DADOS.md",
  "STATUS.md",
] as const

function ler(caminho: string): string {
  return readFileSync(caminho, "utf8")
}

test("Status expõe os documentos canônicos na ordem de leitura", (t) => {
  if (pularForaDaOperacao(t)) return
  for (const arquivo of documentosCanonicos) {
    assert.ok(
      existsSync(join(statusDir, arquivo)),
      `faltou Status/${arquivo}: a camada normativa não pode perder um documento em silêncio`
    )
  }

  const indice = ler(join(statusDir, "README.md"))
  for (const arquivo of documentosCanonicos.filter((a) => a !== "README.md")) {
    assert.match(
      indice,
      new RegExp(arquivo.replace(".", "\\.")),
      `Status/README.md deixou de apontar para ${arquivo}`
    )
  }
})

test("a Regra 0 continua no topo de REGRAS.md", (t) => {
  if (pularForaDaOperacao(t)) return
  const regras = ler(join(statusDir, "REGRAS.md"))
  assert.match(regras, /Regra 0/, "REGRAS.md perdeu a Regra 0")
  assert.match(
    regras,
    /proibido escrever no dado qualquer coisa que não seja o dado/i,
    "REGRAS.md perdeu a formulação da Regra 0"
  )
})

test("os contratos campo a campo existem e são referenciados por DADOS.md", (t) => {
  if (pularForaDaOperacao(t)) return
  const contratosDir = join(raizRepo, "contratos")
  assert.ok(existsSync(contratosDir), "faltou a pasta contratos/")

  const dados = ler(join(statusDir, "DADOS.md"))
  assert.match(dados, /contratos\//, "DADOS.md deixou de apontar para contratos/")
})

test("o README da raiz aponta para a camada normativa", (t) => {
  if (pularForaDaOperacao(t)) return
  const readme = ler(join(raizRepo, "README.md"))
  assert.match(readme, /Status\/REGRAS\.md/, "README da raiz perdeu o ponteiro para as regras")
})
