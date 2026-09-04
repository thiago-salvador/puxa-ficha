import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

/**
 * Guarda estrutural dos provers em PostgreSQL 17.
 *
 * O defeito que ela existe para impedir, encontrado em 04/09/2026: um comentario
 * dentro da fixture de `provar-alvaro-dias-rn-homonimo-pg17.sh` citava dois nomes
 * de coluna entre crases. O heredoc daquele arquivo era aberto sem aspas
 * (`<<SQL`), entao o shell tratou as crases como substituicao de comando, tentou
 * executar `total_receitas` e imprimiu "command not found" no stderr.
 *
 * O que torna isso perigoso nao e o ruido: e que **o prover continuou saindo 0**.
 * O texto entre crases sumiu do SQL que chegou ao Postgres, e nenhuma assercao
 * reparou. Um prover que erra em silencio e pior do que nao ter prover, porque a
 * decisao de aplicar em producao se apoia nele.
 *
 * A guarda mira o PERIGO, nao o estilo. Heredoc sem aspas continua permitido, e
 * quatro provers antigos usam essa forma legitimamente para interpolar uma
 * variavel; o que nao pode e substituicao de comando dentro de um corpo que o
 * shell expande.
 */

const AUDIT = join(process.cwd(), "scripts", "audit")
const PROVERS = readdirSync(AUDIT).filter((f) => /^provar-.*-pg17\.sh$/.test(f))

type Heredoc = { delimitador: string; citado: boolean; corpo: string; linha: number }

function heredocs(fonte: string): Heredoc[] {
  const achados: Heredoc[] = []
  const abertura = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g
  for (const m of fonte.matchAll(abertura)) {
    // Abertura dentro de comentario do shell nao abre heredoc nenhum. Sem este
    // filtro a propria guarda deu falso positivo, casando o `<<SQL` citado no
    // comentario que explica a correcao logo acima do heredoc de verdade.
    const inicioDaLinha = fonte.lastIndexOf("\n", m.index!) + 1
    if (/^\s*#/.test(fonte.slice(inicioDaLinha, m.index!))) continue
    const delimitador = m[2]
    const inicio = m.index! + m[0].length
    const fim = new RegExp(`^${delimitador}\\s*$`, "m").exec(fonte.slice(inicio))
    achados.push({
      delimitador,
      citado: Boolean(m[1]),
      corpo: fonte.slice(inicio, inicio + (fim ? fim.index : 0)),
      linha: fonte.slice(0, m.index!).split("\n").length,
    })
  }
  return achados
}

test("nenhum prover tem substituicao de comando dentro de heredoc expandido", () => {
  assert.ok(PROVERS.length >= 10, `so ${PROVERS.length} provers encontrados; o glob quebrou`)
  const perigosos: string[] = []
  for (const arquivo of PROVERS) {
    const fonte = readFileSync(join(AUDIT, arquivo), "utf8")
    for (const h of heredocs(fonte)) {
      if (h.citado) continue
      // Crase, e `$(` que nao esteja escapado com barra invertida.
      if (h.corpo.includes("`") || /(?<!\\)\$\(/.test(h.corpo)) {
        perigosos.push(`${arquivo}:${h.linha} (<<${h.delimitador})`)
      }
    }
  }
  assert.deepEqual(perigosos, [], `substituicao de comando em heredoc expandido: ${perigosos.join(", ")}`)
})

test("a fixture do prover do homonimo fica citada, e o predecessor entra por variavel do psql", () => {
  // Trava a correcao de 04/09: se alguem reabrir este heredoc sem aspas, a crase
  // do comentario sobre os nomes de coluna volta a ser executada pelo shell.
  const fonte = readFileSync(join(AUDIT, "provar-alvaro-dias-rn-homonimo-pg17.sh"), "utf8")
  assert.match(fonte, /q -q -v previous="\$PREVIOUS" <<'SQL'/)
  assert.doesNotMatch(fonte, /^q -q <<SQL$/m)
  assert.match(fonte, /VALUES \(:'previous', 'sha256:fixture-previous'\);/)
})

test("a fixture usa os nomes de coluna reais de financiamento, nao os inventados", () => {
  // O defeito de origem: a fixture inventou `ano` e `total_receitas`, o readback
  // foi escrito contra ela, e o EXECUTE teria abortado a transacao do apply em
  // producao, onde as colunas sao `ano_eleicao` e `total_arrecadado`.
  const prover = readFileSync(join(AUDIT, "provar-alvaro-dias-rn-homonimo-pg17.sh"), "utf8")
  const readback = readFileSync(
    join(process.cwd(), "supabase", "readback", "20260903220000_despublicar_alvaro_dias_rn_homonimo.readback.sql"),
    "utf8",
  )
  for (const coluna of ["ano_eleicao", "total_arrecadado"]) {
    assert.ok(prover.includes(coluna), `a fixture nao declara ${coluna}`)
    assert.ok(readback.includes(coluna), `o readback nao consulta ${coluna}`)
  }
  // Os nomes inventados so podem sobreviver em comentario, nunca em SQL.
  const sql = readback
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
  assert.doesNotMatch(sql, /total_receitas/)
  assert.doesNotMatch(sql, /\bano\b\s+IN\b/)
})
