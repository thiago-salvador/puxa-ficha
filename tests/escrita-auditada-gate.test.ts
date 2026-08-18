import assert from "node:assert/strict"
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, it } from "node:test"

import {
  PADRAO_PIPELINE_DE_COLETA,
  RECORTES_AUDITADOS,
  TABELAS_DE_ESTADO_DE_FERRAMENTA,
  analisarFonte,
  arquivosInadimplentes,
  auditarRepositorio,
  varrerEscritas,
} from "../scripts/audit/lib/escrita-auditada-gate"
import { FONTES } from "../scripts/lib/coleta-log"

/**
 * O gate da issue #131.
 *
 * `Settings/WORKFLOWS.md` manda registrar toda escrita desde 04/08 e nada nunca
 * conferiu. Este arquivo é a conferência, e a parte mais importante dele não é
 * o caso positivo: é o NEGATIVO. Um gate que só é exercitado por código que já
 * está certo não prova nada, porque um gate quebrado passa exatamente igual. Por
 * isso todo fixture conforme aqui é quebrado de propósito em seguida, e o teste
 * exige que o gate acuse a quebra.
 */

const raiz = process.cwd()
const fixtures = join(raiz, "tests/fixtures/escrita-auditada")
const scriptsDir = join(raiz, "scripts")

function fixture(nome: string): string {
  return readFileSync(join(fixtures, `${nome}.ts.txt`), "utf8")
}

// ---------------------------------------------------------------------------
// 1. Detecção, arquivo a arquivo
// ---------------------------------------------------------------------------

describe("analisarFonte acusa escrita de produção sem helper", () => {
  it("pega update e delete diretos, com tabela e linha", () => {
    const achados = analisarFonte("x.ts", fixture("inadimplente-escrita-direta"))
    const inadimplentes = achados.filter((a) => !a.auditada && !a.isencao)

    assert.equal(inadimplentes.length, 2)
    assert.deepEqual(
      inadimplentes.map((a) => `${a.verbo} ${a.alvo}`),
      ["update candidatos", "delete pontos_atencao"],
    )
    assert.ok(
      inadimplentes.every((a) => a.linha > 0),
      "sem número de linha o achado não é acionável",
    )
  })

  it("pega alvo resolvido por variável, que é o caso 1 da issue #131", () => {
    const achados = analisarFonte("x.ts", fixture("inadimplente-alvo-dinamico"))
    const inadimplentes = achados.filter((a) => !a.auditada && !a.isencao)

    assert.equal(inadimplentes.length, 1)
    assert.equal(inadimplentes[0].alvoResolvido, false)
    assert.match(
      inadimplentes[0].alvo,
      /^<dinamico:/,
      "o gate precisa dizer que não resolveu o alvo, em vez de fingir que resolveu",
    )
  })
})

describe("analisarFonte não acusa o que não é escrita em produção", () => {
  it("aceita a escrita que passa pelo helper", () => {
    const achados = analisarFonte("x.ts", fixture("conforme-helper"))

    assert.equal(achados.length, 2, "as duas escritas continuam sendo vistas")
    assert.ok(
      achados.every((a) => a.auditada),
      "escrita dentro de escreverAuditado() não pode ser tratada como inadimplente",
    )
  })

  it("ignora crypto.update, Map.delete, Array.from, comentário e string", () => {
    const achados = analisarFonte("x.ts", fixture("falso-positivo-verbos-homonimos"))
    assert.deepEqual(
      achados,
      [],
      "o repositório tem 14 sítios desta forma; acusá-los é como se desliga um gate",
    )
  })

  it("isenta tabela temporária e client fora de produção, com o motivo declarado", () => {
    const achados = analisarFonte("x.ts", fixture("isento-temporaria-e-local"))

    assert.equal(achados.length, 3)
    assert.deepEqual(
      achados.map((a) => a.isencao),
      ["tabela-temporaria", "tabela-temporaria", "cliente-fora-de-producao"],
    )
    assert.equal(
      achados.filter((a) => !a.isencao).length,
      0,
      "nenhuma delas é escrita na produção que serve a superfície pública",
    )
  })

  it("a isenção por nome de client é ancorada, não substring solta", () => {
    // A versão solta casava qualquer ocorrência de `local`/`mock` no meio do
    // identificador, e um client de produção com nome infeliz passava a nunca
    // ser reportado: gate verde com escrita real sem trilha, que é o modo de
    // falha que ele existe para impedir.
    //
    // A fronteira é deliberada, não acidental. `supabaseLocal` continua isento,
    // porque o sufixo camelCase É a declaração de que aquele client é o local.
    // O que deixou de valer é a palavra aparecendo por acaso dentro de outra.
    const isento = (nome: string) =>
      analisarFonte(
        "x.ts",
        `await ${nome}.from("candidatos").update({ a: 1 })\n`,
      )[0]?.isencao === "cliente-fora-de-producao"

    for (const nome of ["localSupabase", "supabaseLocal", "testClient", "mockSupabase", "supabase_test"]) {
      assert.ok(isento(nome), `${nome} declara ser client fora de produção`)
    }

    for (const nome of ["clienteLocalizado", "mockeavelSupabase", "supabase"]) {
      assert.ok(!isento(nome), `${nome} não declara nada: tem de ser reportado`)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. O gate quebrando de propósito
// ---------------------------------------------------------------------------

describe("o gate reprova de fato quando o fixture conforme é quebrado", () => {
  const conforme = fixture("conforme-helper")

  it("tirar a chamada do helper, mantendo o import, faz o gate acusar", () => {
    const quebrado = conforme.replace(/escreverAuditado\(/g, "executarSemTrilha(")

    assert.match(quebrado, /import \{ escreverAuditado \}/, "o import continua no arquivo")
    assert.equal(
      analisarFonte("x.ts", conforme).filter((a) => !a.auditada).length,
      0,
      "controle: antes da quebra o gate passa",
    )
    const acusados = analisarFonte("x.ts", quebrado).filter((a) => !a.auditada && !a.isencao)
    assert.equal(
      acusados.length,
      2,
      "importar o helper e não chamá-lo tem que reprovar; senão o gate mede import, não escrita",
    )
  })

  it("trocar a tabela temporária por tabela de produção faz o gate acusar", () => {
    const isento = fixture("isento-temporaria-e-local")
    const quebrado = isento.replace(/tmp_marcadores_recalculados/g, "candidatos")

    const acusados = analisarFonte("x.ts", quebrado).filter((a) => !a.auditada && !a.isencao)
    assert.deepEqual(
      acusados.map((a) => `${a.verbo} ${a.alvo}`),
      ["insert candidatos"],
      "a isenção é do alvo temporário, não do arquivo",
    )
  })
})

// ---------------------------------------------------------------------------
// 3. Varredura de diretório, que é como o gate roda de verdade
// ---------------------------------------------------------------------------

describe("varrerEscritas sobre um diretório", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-escrita-"))

  after(() => rmSync(dir, { recursive: true, force: true }))

  mkdirSync(join(dir, "lib"), { recursive: true })
  for (const nome of readdirSync(fixtures)) {
    cpSync(join(fixtures, nome), join(dir, nome.replace(/\.ts\.txt$/, ".ts")))
  }
  // Um módulo de pipeline dentro da classe isenta, para provar que a isenção por
  // padrão de caminho funciona na varredura, e não só na teoria.
  writeFileSync(
    join(dir, "lib/ingest-fake.ts"),
    'import { supabase } from "./supabase"\n' +
      'export async function ingest() {\n' +
      '  await supabase.from("candidatos").upsert([])\n' +
      "}\n",
  )

  const resultado = varrerEscritas(dir, {
    excecoes: [],
    excecoesPorPadrao: [PADRAO_PIPELINE_DE_COLETA],
  })

  it("lê os arquivos e separa inadimplente, auditada e isenta", () => {
    assert.equal(resultado.arquivosLidos, 6)
    assert.deepEqual(arquivosInadimplentes(resultado), [
      "inadimplente-alvo-dinamico.ts",
      "inadimplente-escrita-direta.ts",
    ])
    assert.equal(resultado.auditadas.length, 2)
    assert.equal(resultado.isentas.length, 3)
  })

  it("a isenção por padrão de caminho vale na varredura", () => {
    assert.ok(
      !arquivosInadimplentes(resultado).includes("lib/ingest-fake.ts"),
      "lib/ingest-*.ts está isento pela classe do pipeline",
    )
    const semPadrao = varrerEscritas(dir, { excecoes: [] })
    assert.ok(
      arquivosInadimplentes(semPadrao).includes("lib/ingest-fake.ts"),
      "sem o padrão, o mesmo arquivo aparece: a isenção é a política, não uma falha de leitura",
    )
  })
})

// ---------------------------------------------------------------------------
// 4. O repositório de verdade
// ---------------------------------------------------------------------------

describe("o repositório contra a política declarada", () => {
  const auditoria = auditarRepositorio(raiz)

  it("a varredura leu os dois recortes (guarda contra gate cego)", () => {
    assert.ok(
      auditoria.arquivosLidos > 200,
      `só ${auditoria.arquivosLidos} arquivos lidos em scripts/ e src/`,
    )
  })

  it("nenhum arquivo escreve em produção fora do helper", () => {
    assert.deepEqual(
      auditoria.inadimplentes.map((a) => a.arquivo),
      [],
      "escrita sem trilha é exatamente a issue #131 acontecendo de novo. " +
        "Use escreverAuditado() de scripts/lib/escrita-auditada.ts, " +
        "ou declare a exceção com motivo em RECORTES_AUDITADOS.",
    )
  })

  it("nenhuma exceção declarada ficou obsoleta", () => {
    assert.deepEqual(
      auditoria.excecoesObsoletas.map((e) => e.arquivo),
      [],
      "estes arquivos já não escrevem direto: tire da lista, senão ela passa a mentir",
    )
  })

  it("a conta fecha: acusado é exceção declarada, e vice-versa", () => {
    const declarados = RECORTES_AUDITADOS.flatMap((r) =>
      r.excecoes.map((e) => `${r.diretorio}/${e.arquivo}`),
    ).sort()
    const acusadosNomeados = auditoria.excecoesConfirmadas
      .map((a) => a.arquivo)
      .filter((a) => declarados.includes(a))
      .sort()

    assert.deepEqual(acusadosNomeados, declarados)
    assert.ok(
      auditoria.excecoesConfirmadas.length > declarados.length,
      "o resto dos acusados é a classe do pipeline de coleta, isenta por padrão de caminho",
    )
  })

  it("toda exceção declarada tem motivo legível", () => {
    for (const recorte of RECORTES_AUDITADOS) {
      for (const excecao of [...recorte.excecoes, ...(recorte.excecoesPorPadrao ?? [])]) {
        assert.ok(
          excecao.motivo.trim().length > 30,
          `exceção sem motivo legível em ${recorte.diretorio}: lista sem motivo vira allowlist eterna`,
        )
      }
    }
    for (const tabela of TABELAS_DE_ESTADO_DE_FERRAMENTA) {
      assert.ok(tabela.motivo.trim().length > 30, `${tabela.tabela} sem motivo legível`)
    }
  })

  it("a escrita auditada existe de fato, e não só a ausência de inadimplente", () => {
    // Zero inadimplente com zero escrita auditada seria o mesmo resultado de um
    // gate que parou de enxergar escrita nenhuma.
    assert.ok(
      auditoria.auditadas >= 20,
      `só ${auditoria.auditadas} escrita(s) dentro de escreverAuditado(): o helper sumiu do repositório?`,
    )
  })
})

describe("as duas metades da trilha não estão numa allowlist", () => {
  // A isenção de coleta-log.ts e escrita-auditada.ts vem de TODA escrita dos
  // dois apontar para coleta_log, e é conferida lendo os arquivos. Num nome em
  // lista, um INSERT em tabela de domínio acrescentado ali ficaria invisível.
  for (const arquivo of ["lib/coleta-log.ts", "lib/escrita-auditada.ts"]) {
    it(`${arquivo} é isento por escrever só na trilha, não por estar numa lista`, () => {
      const achados = analisarFonte(arquivo, readFileSync(join(scriptsDir, arquivo), "utf8"))
      assert.ok(achados.length > 0, "sem nenhuma escrita vista, a conferência não prova nada")
      assert.deepEqual(
        [...new Set(achados.map((a) => a.isencao))],
        ["trilha"],
        "toda escrita destes dois arquivos tem que ser em coleta_log",
      )
    })
  }
})

describe("tabela isenta por ser estado de ferramenta não pode estar na superfície pública", () => {
  const api = readFileSync(join(raiz, "src/lib/api.ts"), "utf8")

  for (const { tabela } of TABELAS_DE_ESTADO_DE_FERRAMENTA) {
    it(`${tabela} não aparece em src/lib/api.ts`, () => {
      assert.ok(
        !api.includes(tabela),
        `${tabela} está isenta por não ser estado publicado, mas src/lib/api.ts a lê: a isenção caiu`,
      )
    })
  }
})

describe("a isenção do cron de notícias é verificada, não confiada", () => {
  const rota = readFileSync(join(raiz, "src/app/api/news/refresh/route.ts"), "utf8")

  it("a rota continua gravando a própria trilha em coleta_log", () => {
    assert.match(
      rota,
      /\.from\("coleta_log"\)/,
      "a exceção da rota se apoia na trilha própria dela; sem essa escrita, a exceção caiu",
    )
  })

  it("o source que ela declara é um FONTES conhecido", () => {
    const fontes = [...rota.matchAll(/fonte:\s*"([^"]+)"/g)].map((m) => m[1])
    assert.ok(fontes.length > 0, "a rota não declara fonte nenhuma em coleta_log")
    for (const fonte of fontes) {
      assert.ok(fonte in FONTES, `rota de notícias declara fonte "${fonte}" fora de FONTES`)
    }
  })
})

describe("a isenção do pipeline de coleta é verificada, não confiada", () => {
  const libDir = join(scriptsDir, "lib")
  const isentos = readdirSync(libDir)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => PADRAO_PIPELINE_DE_COLETA.test(`lib/${f}`))

  it("a classe isenta é exatamente ingest-*/enrich-* de scripts/lib", () => {
    const esperado = readdirSync(libDir).filter(
      (f) => (f.startsWith("ingest-") || f.startsWith("enrich-")) && f.endsWith(".ts"),
    )
    assert.deepEqual(isentos.sort(), esperado.sort())
    assert.ok(isentos.length >= 20, `esperava 20+ módulos de pipeline, achei ${isentos.length}`)
  })

  it("todo módulo isento declara um source que FONTES conhece", () => {
    for (const arquivo of isentos) {
      const src = readFileSync(join(libDir, arquivo), "utf8")
      const sources = [...src.matchAll(/source:\s*"([^"]+)",\s*\n\s*candidato:/g)].map((m) => m[1])
      assert.ok(
        sources.length > 0,
        `${arquivo} está isento como pipeline e não declara source: a isenção não se sustenta`,
      )
      for (const source of sources) {
        assert.ok(
          source in FONTES,
          `${arquivo} declara source "${source}" fora de FONTES: ingest-all.ts registraria a trilha com escopo errado`,
        )
      }
    }
  })
})

describe("a costura de teste do helper não vaza para scripts", () => {
  it("nenhum script menciona __escreverAuditadoComSumidouro", () => {
    const suspeitos: string[] = []
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir, { withFileTypes: true })) {
        if (nome.name === "node_modules") continue
        const caminho = join(dir, nome.name)
        if (nome.isDirectory()) varrer(caminho)
        else if (nome.name.endsWith(".ts") && nome.name !== "escrita-auditada.ts") {
          if (readFileSync(caminho, "utf8").includes("__escreverAuditadoComSumidouro")) {
            suspeitos.push(caminho)
          }
        }
      }
    }
    varrer(scriptsDir)
    assert.deepEqual(
      suspeitos,
      [],
      "injetar sumidouro fora do teste é escrever sem trilha por dentro do helper",
    )
  })
})
