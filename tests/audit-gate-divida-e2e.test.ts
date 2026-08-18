/**
 * End-to-end das quatro bordas fail-closed da dívida congelada.
 *
 * Roda o PROCESSO de verdade (`check-migrations-allowlist.ts`) contra uma árvore
 * de fixture apontada por `PF_AUDIT_RAIZ`, e afirma o código de saída. Teste de
 * unidade das funções puras não serviria aqui: o que falhava antes não era a
 * lógica de comparação, era o `continue` no laço dos recortes que dispensava a
 * dívida inteira de reprovar. Só o exit code prova que a borda está ligada.
 *
 * Fixture em vez de mutar `supabase/migrations/`: provar a borda mexendo na
 * árvore real deixaria migration de mentira no repositório se o teste quebrasse
 * no meio.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

import { descreve, impressaoDeViolacoes } from "../scripts/audit/check-migrations-allowlist"
import { lerPendingWrites } from "../scripts/audit/lib/pending-writes"

const CHECKER = resolve(import.meta.dirname, "..", "scripts", "audit", "check-migrations-allowlist.ts")

/** Nome que EXISTE no roster fechado DIVIDAS_CONGELADAS do checker. */
const DIVIDA_LEGITIMA = "marcadores-tse-residuais-20260808"

const MIGRATION_DIVIDA = `-- @write tabela=patrimonio slug=fulano campos=bens
UPDATE public.patrimonio p SET bens = '[]'::jsonb
  FROM public.candidatos c WHERE c.slug = 'fulano';
`

const MIGRATION_LIMPA = `-- @write tabela=candidatos slug=fulano campos=biografia
UPDATE public.candidatos SET biografia = 'x' WHERE slug = 'fulano';
`

const MIGRATION_LEGADA = `UPDATE public.candidatos SET biografia = 'legado' WHERE slug = 'fulano';
`

const ALLOWLIST_LIMPA = {
  coorte: ["fulano"],
  fora_por_construcao: { slugs: [] as string[] },
  entries: [{ tabela: "candidatos", slug: "fulano", campos: ["biografia"] }],
}

interface Arvore {
  raiz: string
  migrations: string
  audit: string
}

/**
 * Monta a árvore mínima que o modo completo lê: migrations, recortes, baseline e
 * uma allowlist. A dívida é congelada aqui pelo MESMO caminho da produção
 * (`descreve` + `impressaoDeViolacoes`), senão o teste provaria o congelamento
 * contra uma segunda implementação em vez de contra a que roda.
 */
function montarArvore(): Arvore {
  const raiz = mkdtempSync(join(tmpdir(), "pf-audit-"))
  const migrations = join(raiz, "supabase", "migrations")
  const audit = join(raiz, "scripts", "audit")
  mkdirSync(migrations, { recursive: true })
  mkdirSync(audit, { recursive: true })

  writeFileSync(join(migrations, "20260101000000_legado.sql"), MIGRATION_LEGADA)
  writeFileSync(join(migrations, "20260808035000_divida.sql"), MIGRATION_DIVIDA)
  writeFileSync(join(migrations, "20261201000000_limpo.sql"), MIGRATION_LIMPA)
  writeFileSync(join(audit, "allowlist-limpo.json"), JSON.stringify(ALLOWLIST_LIMPA, null, 2))

  const writesDaDivida = lerPendingWrites(migrations, "20260808030000", "20260808040000")
  const itens = writesDaDivida.map((w) => `write ${descreve(w)}`)

  escreverRecortes(audit, {
    recortes: [
      {
        nome: DIVIDA_LEGITIMA,
        desde: "20260808030000",
        ate: "20260808040000",
        allowlist: null,
        divida: {
          motivo: "fixture",
          congelado_em: "2026-08-09",
          arquivos: ["20260808035000_divida.sql"],
          violacoes_sha256: impressaoDeViolacoes(itens),
          violacoes: new Set(itens).size,
        },
      },
      {
        nome: "limpo",
        desde: "20261201000000",
        ate: "20261201000000",
        allowlist: "scripts/audit/allowlist-limpo.json",
        divida: null,
      },
    ],
    allowlists_sem_recorte: [],
  })

  writeFileSync(
    join(audit, "baseline-escritas-sem-anotacao.json"),
    JSON.stringify(
      {
        arquivos: {
          "20260101000000_legado.sql": {
            statements: 1,
            sha256: createHash("sha256").update(MIGRATION_LEGADA).digest("hex"),
          },
        },
      },
      null,
      2
    )
  )

  return { raiz, migrations, audit }
}

function escreverRecortes(audit: string, mapa: unknown): void {
  writeFileSync(join(audit, "recortes.json"), JSON.stringify(mapa, null, 2))
}

function lerRecortes(audit: string): {
  recortes: Record<string, unknown>[]
  allowlists_sem_recorte: unknown[]
} {
  return JSON.parse(readFileSync(join(audit, "recortes.json"), "utf8"))
}

function rodarGate(raiz: string): { status: number; saida: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", CHECKER], {
    env: { ...process.env, PF_AUDIT_RAIZ: raiz },
    encoding: "utf8",
  })
  return { status: r.status ?? -1, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` }
}

/** Cada caso monta a própria árvore e a remove, inclusive quando falha. */
function comArvore(cenario: (arvore: Arvore) => void): void {
  const arvore = montarArvore()
  try {
    cenario(arvore)
  } finally {
    rmSync(arvore.raiz, { recursive: true, force: true })
  }
}

test("e2e: a fixture intacta sai 0, senão os quatro casos abaixo não provam nada", () => {
  comArvore(({ raiz }) => {
    const { status, saida } = rodarGate(raiz)
    assert.equal(status, 0, saida)
    assert.match(saida, /OK: nenhuma escrita nova sem anotação/)
  })
})

test("e2e: recorte NOVO declarando divida sai 1, porque o roster é fechado", () => {
  comArvore(({ raiz, audit }) => {
    const mapa = lerRecortes(audit)
    mapa.recortes.push({
      nome: "divida-nova",
      desde: "20270101000000",
      ate: "20270101000000",
      allowlist: null,
      divida: {
        motivo: "escrita que não passa na allowlist tentando virar dívida",
        congelado_em: "2027-01-01",
        arquivos: [],
        violacoes_sha256: impressaoDeViolacoes([]),
        violacoes: 0,
      },
    })
    escreverRecortes(audit, mapa)

    const { status, saida } = rodarGate(raiz)
    assert.equal(status, 1, saida)
    assert.match(saida, /divida-nova: declara divida e não está no roster fechado/)
  })
})

test("e2e: arquivo NOVO dentro da janela de uma dívida sai 1", () => {
  comArvore(({ raiz, migrations }) => {
    // Mesma janela da dívida: sem esta borda, migration nova pegaria carona na
    // dispensa só por ter timestamp vizinho ao do débito histórico.
    writeFileSync(
      join(migrations, "20260808036000_carona.sql"),
      `-- @write tabela=candidatos slug=fulano campos=biografia
UPDATE public.candidatos SET biografia = 'carona' WHERE slug = 'fulano';
`
    )

    const { status, saida } = rodarGate(raiz)
    assert.equal(status, 1, saida)
    assert.match(saida, /20260808036000_carona\.sql entrou na janela de uma dívida congelada/)
  })
})

test("e2e: migration do baseline editada sai 1 pelo sha256, com a contagem intacta", () => {
  comArvore(({ raiz, migrations }) => {
    // A contagem de escritas órfãs continua 1. Só o conteúdo muda, que é o caso
    // que uma contagem sozinha nunca pegaria.
    writeFileSync(
      join(migrations, "20260101000000_legado.sql"),
      `UPDATE public.candidatos SET biografia = 'OUTRO ALVO' WHERE slug = 'sicrano';\n`
    )

    const { status, saida } = rodarGate(raiz)
    assert.equal(status, 1, saida)
    assert.match(saida, /20260101000000_legado\.sql[^\n]*sha256 diferente/)
  })
})

test("e2e: violação a mais dentro da dívida congelada sai 1", () => {
  comArvore(({ raiz, migrations }) => {
    // Arquivo já congelado, mesma janela, uma escrita declarada a mais. O
    // conjunto de arquivos não muda: só a impressão digital pega isto.
    writeFileSync(
      join(migrations, "20260808035000_divida.sql"),
      `${MIGRATION_DIVIDA}
-- @write tabela=patrimonio slug=fulano ano=2022 campos=fonte
UPDATE public.patrimonio p SET fonte = 'nova'
  FROM public.candidatos c WHERE c.slug = 'fulano';
`
    )

    const { status, saida } = rodarGate(raiz)
    assert.equal(status, 1, saida)
    assert.match(saida, /as violações mudaram/)
  })
})

test("e2e: tirar o bloco divida de um recorte do roster sai 1", () => {
  comArvore(({ raiz, audit }) => {
    // Fechar a dívida é tirar o nome do roster no código. Apagar o
    // congelamento do JSON seria apagar a medição e manter a dispensa.
    const mapa = lerRecortes(audit)
    const divida = mapa.recortes.find((r) => r.nome === DIVIDA_LEGITIMA)
    assert.ok(divida)
    divida.divida = null
    escreverRecortes(audit, mapa)

    const { status, saida } = rodarGate(raiz)
    assert.equal(status, 1, saida)
    assert.match(saida, /perdeu o bloco divida/)
  })
})

// --- correções da revisão do PR #149 --------------------------------------

/** `rodarGate` com argumentos, para exercitar o parser pelo processo real. */
function rodarComArgs(raiz: string, args: string[]): { status: number; saida: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", CHECKER, ...args], {
    env: { ...process.env, PF_AUDIT_RAIZ: raiz },
    encoding: "utf8",
  })
  return { status: r.status ?? -1, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` }
}

test("e2e: flags na forma com ESPAÇO saem 2, nunca caem no modo completo", () => {
  comArvore(({ raiz }) => {
    // Fail-open medido em 09/08/2026 e apontado na revisão do PR #149: os três
    // lookups voltavam undefined, o comando caía no modo completo e imprimia OK
    // com exit 0. Quem autorava um recorte novo lia verde sem ter conferido nada
    // do recorte dele.
    const { status, saida } = rodarComArgs(raiz, [
      "--allowlist",
      "scripts/audit/allowlist-limpo.json",
      "--desde",
      "20261201000000",
      "--ate",
      "20261201000000",
    ])

    assert.equal(status, 2, saida)
    assert.doesNotMatch(saida, /OK: nenhuma escrita nova sem anotação/, "não pode cair no modo completo")
    assert.match(saida, /--allowlist exige a forma --allowlist=valor/)
    assert.match(saida, /argumento posicional não reconhecido/)
  })
})

test("e2e: flag desconhecida e posicional solto saem 2", () => {
  comArvore(({ raiz }) => {
    const desconhecida = rodarComArgs(raiz, ["--janela=20260808"])
    assert.equal(desconhecida.status, 2, desconhecida.saida)
    assert.match(desconhecida.saida, /flag desconhecida: --janela/)

    const posicional = rodarComArgs(raiz, ["scripts/audit/allowlist-limpo.json"])
    assert.equal(posicional.status, 2, posicional.saida)
    assert.match(posicional.saida, /argumento posicional não reconhecido/)
  })
})

test("e2e: a forma com = segue funcionando, para a rigidez não virar bloqueio", () => {
  comArvore(({ raiz }) => {
    const { status, saida } = rodarComArgs(raiz, [
      "--allowlist=scripts/audit/allowlist-limpo.json",
      "--desde=20261201000000",
      "--ate=20261201000000",
    ])
    assert.equal(status, 0, saida)
    assert.match(saida, /OK: toda escrita declarada está dentro da allowlist/)
  })
})

test("e2e: recorte apontando para allowlist inexistente sai 1 com violação nomeada", () => {
  comArvore(({ raiz, audit }) => {
    // Antes: ENOENT com stack trace no readFileSync de conferirRecorte, sem
    // dizer QUAL recorte estava errado, e parecendo defeito do checker.
    const mapa = lerRecortes(audit)
    const limpo = mapa.recortes.find((r) => r.nome === "limpo")
    assert.ok(limpo)
    limpo.allowlist = "scripts/audit/allowlist-que-nao-existe.json"
    escreverRecortes(audit, mapa)

    const { status, saida } = rodarGate(raiz)
    assert.equal(status, 1, saida)
    assert.match(saida, /allowlist-que-nao-existe\.json, referenciada pelo\(s\) recorte\(s\) limpo, não existe no diretório/)
    assert.doesNotMatch(saida, /ENOENT/, "erro de mapa não pode sair como exceção de leitura")
    assert.doesNotMatch(saida, /at Object\.|at Module\./, "sem stack trace")
  })
})

test("e2e: dívida com allowlist e zero writes fica VERDE e imprime ALLOWLIST NÃO EXERCITADA", () => {
  comArvore(({ raiz, audit, migrations }) => {
    // Estado real de correcoes-claims-pos-factcheck e limpeza-familia-sem-mandato:
    // allowlist declarada, migration sem anotação, zero writes conferidos. É
    // dívida histórica, então não pode virar erro permanente, mas também não
    // pode passar como recorte coberto.
    writeFileSync(
      join(migrations, "20260808035000_divida.sql"),
      `UPDATE public.candidatos SET biografia = 'sem anotacao' WHERE slug = 'fulano';\n`
    )
    const conteudo = readFileSync(join(migrations, "20260808035000_divida.sql"), "utf8")

    // Allowlist PRÓPRIA: reusar a do recorte limpo trip o invariante de
    // "referenciada por mais de um recorte", que é o gate funcionando e não o
    // caso sob teste.
    writeFileSync(
      join(audit, "allowlist-divida.json"),
      JSON.stringify(ALLOWLIST_LIMPA, null, 2)
    )

    const mapa = lerRecortes(audit)
    const divida = mapa.recortes.find((r) => r.nome === DIVIDA_LEGITIMA)
    assert.ok(divida)
    divida.allowlist = "scripts/audit/allowlist-divida.json"
    // Sem @write, o único item é a escrita órfã do próprio arquivo.
    const itens = [
      "20260808035000_divida.sql:1: statement de escrita sem anotação @write -> UPDATE public.candidatos SET biografia = 'sem anotacao' WHERE slug = 'fulano';",
    ]
    divida.divida = {
      motivo: "fixture: autorização registrada e nunca conferida contra o SQL",
      congelado_em: "2026-08-09",
      arquivos: ["20260808035000_divida.sql"],
      violacoes_sha256: impressaoDeViolacoes(itens),
      violacoes: itens.length,
    }
    escreverRecortes(audit, mapa)

    const baseline = JSON.parse(readFileSync(join(audit, "baseline-escritas-sem-anotacao.json"), "utf8"))
    baseline.arquivos["20260808035000_divida.sql"] = {
      statements: 1,
      sha256: createHash("sha256").update(conteudo).digest("hex"),
    }
    writeFileSync(join(audit, "baseline-escritas-sem-anotacao.json"), JSON.stringify(baseline, null, 2))

    const { status, saida } = rodarGate(raiz)
    assert.equal(status, 0, saida)
    assert.match(saida, /ALLOWLIST NÃO EXERCITADA/)
    assert.match(saida, /OK: nenhuma escrita nova sem anotação/)
  })
})

// --- fail-open de janela vazia, achado na prova adversarial da base ---------

test("e2e: janela que não pega migration nenhuma sai 1, não OK", () => {
  comArvore(({ raiz }) => {
    // Segunda forma do mesmo fail-open. Com o parser estrito, `--allowlist=X
    // --desde=Y --ate=Y` bem escrito mas com PREFIXO errado devolvia
    // "0 migration(s) na janela" seguido de OK e exit 0. A janela é comparação
    // de prefixo de NOME DE ARQUIVO, não data, que é exatamente onde o erro de
    // digitação cai, e o autor lia verde sobre o recorte que queria provar.
    const { status, saida } = rodarComArgs(raiz, [
      "--allowlist=scripts/audit/allowlist-limpo.json",
      "--desde=20990101000000",
      "--ate=20990101000000",
    ])

    assert.equal(status, 1, saida)
    assert.doesNotMatch(saida, /^OK:/m, "janela vazia não pode sair OK")
    assert.match(saida, /não pega migration nenhuma/)
    assert.match(saida, /comparação de nome de arquivo e não data/)
  })
})

test("e2e: janela com migration mas sem write declarado sai 1 nomeando a escrita sem anotação", () => {
  comArvore(({ raiz }) => {
    // `20260101000000_legado.sql` tem UPDATE sem `-- @write`. A violação
    // concreta precisa vir na frente do guard genérico de allowlist não
    // exercitada, senão o diagnóstico pior esconde o melhor.
    const { status, saida } = rodarComArgs(raiz, [
      "--allowlist=scripts/audit/allowlist-limpo.json",
      "--desde=20260101000000",
      "--ate=20260101000000",
    ])

    assert.equal(status, 1, saida)
    assert.doesNotMatch(saida, /^OK:/m)
    assert.match(saida, /statement de escrita sem anotação @write/)
  })
})
