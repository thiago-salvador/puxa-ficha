import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao"
import { parsePendingWrites } from "../scripts/audit/lib/pending-writes"
import {
  escritasSemAnotacao,
  violacoesDeAllowlist,
} from "../scripts/audit/check-migrations-allowlist"
import { buildPatrimonioEleicoes } from "../src/lib/public-profile-dto"
import type { PatrimonioEleicaoPublico } from "../src/lib/public-profile-dto"
import { MoneyTabSection } from "../src/components/CandidatoProfileSections"
import type { Patrimonio } from "../src/lib/types"

/**
 * Patrimonio do `cabo-daciolo` em 2006 e 2008, os dois anos que a ficha exibia
 * como `nao_coletado`.
 *
 * ## O achado que este arquivo existe para travar
 *
 * Os dois anos parecem o mesmo caso e nao sao. Em 2008 o TSE nao tem registro
 * nenhum de bens para o SQ 14144 em RJ, e o registro de candidatura marca
 * `ST_DECLARAR_BENS = 'N'`: e ausencia de declaracao. Em 2006 o pacote
 * `bem_candidato_2006` TRAZ um registro, e o registro diz "Nenhum bem a
 * declarar", R$ 0,00: e declaracao de patrimonio zero.
 *
 * A diferenca nao e semantica de bastidor, ela muda a frase da tela. O estado
 * `vazio_confirmado` faz o componente escrever que o pacote oficial "nao traz
 * registros para este candidato". Para 2008 e verdade. Para 2006 seria mentira
 * sobre a fonte. O ultimo teste deste arquivo e o que prova isso: ele monta o
 * modelamento ERRADO de proposito e mostra a frase falsa aparecendo.
 *
 * ## O que este arquivo NAO prova, e onde a prova mora
 *
 * Asserção sobre TEXTO de SQL nao julga comportamento de guard. A prova de
 * comportamento e `scripts/audit/provar-migration-daciolo.sh`
 * (`npm run audit:daciolo:provar`), que roda nove ramos da forward e do rollback
 * contra Postgres 17 de verdade, e foi verificada VERMELHA contra uma mutacao
 * que afrouxava a guarda do rollback. O ultimo teste da primeira secao impede o
 * harness de sumir em silencio e levar a prova junto.
 */

const ARQUIVO = "20260810094000_daciolo_patrimonio_2006_2008.sql"
const REPO = join(import.meta.dirname, "..")
const SQL = readFileSync(join(REPO, "supabase/migrations", ARQUIVO), "utf8")
const ROLLBACK = readFileSync(
  join(REPO, "supabase/rollback", ARQUIVO.replace(/\.sql$/, ".rollback.sql")),
  "utf8",
)
const ALLOWLIST = JSON.parse(
  readFileSync(join(REPO, "scripts/audit/allowlist-daciolo-patrimonio-20260810.json"), "utf8"),
)
const SEED = JSON.parse(readFileSync(join(REPO, "data/candidatos.json"), "utf8")) as Array<{
  slug: string
  ids?: { tse_sq_candidato?: Record<string, string> }
}>

const URL_BENS_2008 =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2008.zip"
const URL_BENS_2018 =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip"
const FRASE_AUSENCIA = "não traz registros para este candidato"

describe("migration do patrimonio 2006/2008 do cabo-daciolo", () => {
  test("cada ano vai para a tabela que corresponde ao que a fonte diz", () => {
    const writes = parsePendingWrites(SQL, ARQUIVO)
    assert.equal(writes.length, 2, "a migration escreve exatamente duas vezes")

    const de2006 = writes.find((w) => w.ano === 2006)
    const de2008 = writes.find((w) => w.ano === 2008)
    assert.ok(de2006 && de2008, "faltou a escrita de um dos dois anos")

    // O par (ano, tabela) e o achado inteiro: inverter isto faz a ficha afirmar
    // sobre a fonte o oposto do que a fonte diz.
    assert.equal(de2006.tabela, "patrimonio", "2006 tem declaracao, entao e patrimonio publicado")
    assert.equal(
      de2008.tabela,
      "patrimonio_ausencia_oficial",
      "2008 nao tem declaracao, entao e ausencia oficial",
    )
    assert.equal(de2006.slug, "cabo-daciolo")
    assert.equal(de2008.slug, "cabo-daciolo")
  })

  test("2006 entra com valor zero e com o bem literal que o TSE registrou", () => {
    assert.match(SQL, /SELECT c\.id, 2006, 0\.00,/, "2006 precisa entrar com valor_total zero")
    assert.match(
      SQL,
      /"descricao":"Nenhum bem a declarar","valor":0/,
      "o bem literal do TSE nao pode ser resumido a um total: sem ele o card de R\\$ 0,00 nao diz o que a fonte disse",
    )
    // Pos-condicao de conteudo dentro do proprio SQL, e nao so a contagem.
    assert.match(SQL, /v_descricao IS DISTINCT FROM 'Nenhum bem a declarar'/)
  })

  test("2008 entra com o SQ, a fonte e a data da verificacao", () => {
    assert.match(SQL, /SELECT c\.id, 2008, '14144'/)
    assert.ok(SQL.includes(URL_BENS_2008), "a ausencia precisa apontar o pacote conferido")
    assert.match(SQL, /'2026-08-10T19:00:00Z'::timestamptz/)
    assert.match(SQL, /ST_DECLARAR_BENS/, "o detalhe tem de citar a coluna que prova a ausencia")
  })

  test("os guards abortam em vez de virar no-op silencioso", () => {
    // Nenhum dos dois INSERT pode carregar `NOT EXISTS`: alvo divergente
    // virando no-op bem-sucedido grava a versao no ledger dizendo que o dado
    // entrou quando ele nao entrou. A conferencia e sobre o STATEMENT, nao
    // sobre o arquivo: o cabecalho explica por que o padrao foi recusado, e
    // prosa nao e SQL que roda.
    for (const write of parsePendingWrites(SQL, ARQUIVO)) {
      assert.doesNotMatch(
        write.statement,
        /NOT EXISTS/i,
        `${write.tabela}: escrita com o padrao de no-op silencioso`,
      )
    }
    assert.match(SQL, /cardinalidade % \(esperado exatamente 1\)/)
    assert.match(SQL, /ja existe\(m\) % linha\(s\) de patrimonio em 2006/)
    assert.match(SQL, /ja existe ausencia oficial registrada em 2008/)
    // O cruzamento invertido tem guard proprio nos dois sentidos.
    assert.match(SQL, /2006 esta registrado como AUSENCIA oficial/)
    assert.match(SQL, /2008 tem patrimonio publicado/)
    // Nao-dano nos tres anos que ja estavam fechados.
    assert.ok(SQL.includes("280000602500"), "a ausencia de 2018 precisa ser conferida intacta")
  })

  test("o rollback so desfaz o que a forward deixou, e aborta diante de curadoria posterior", () => {
    assert.match(ROLLBACK, /ABORTADO para nao destruir curadoria posterior/)
    assert.match(ROLLBACK, /p\.bens -> 0 ->> 'descricao' = 'Nenhum bem a declarar'/)
    assert.match(ROLLBACK, /a\.execucao = 'R1-daciolo-2006-2008-20260810'/)
    assert.equal(escritasSemAnotacao(ROLLBACK).length, 0, "escrita do rollback sem anotacao @write")
  })

  test("toda escrita esta anotada e dentro da allowlist do recorte", () => {
    assert.deepEqual(escritasSemAnotacao(SQL), [])
    assert.deepEqual(violacoesDeAllowlist(parsePendingWrites(SQL, ARQUIVO), ALLOWLIST), [])
    assert.deepEqual(ALLOWLIST.coorte, ["cabo-daciolo"])
  })

  test("a classificacao e a falha de replay estao medidas, nao supostas", () => {
    const classificada = classificarMigration(ARQUIVO, SQL)
    assert.equal(classificada.classe, "curadoria")
    assert.equal(classificada.mista, false, "a migration nao carrega DDL junto com dado de ficha")
    assert.equal(
      classificada.replay,
      "quebra_sem_guard",
      "abortar em banco vazio e deliberado, e por isso ela entra nos dois manifestos",
    )

    const quebras = JSON.parse(
      readFileSync(join(REPO, "scripts/audit/quebras-previstas.json"), "utf8"),
    ) as { quebras: string[] }
    assert.ok(quebras.quebras.includes(ARQUIVO))

    const falhas = JSON.parse(
      readFileSync(join(REPO, "scripts/audit/falhas-replay-linear.json"), "utf8"),
    ) as { falhas: string[] }
    assert.ok(
      falhas.falhas.includes(ARQUIVO),
      "medido em 10/08/2026: aborta com cardinalidade 0 no replay linear em banco vazio",
    )
  })

  test("o harness da prova executavel existe e esta ligado a um comando", () => {
    const harness = readFileSync(join(REPO, "scripts/audit/provar-migration-daciolo.sh"), "utf8")
    assert.match(harness, /postgres:17@sha256:[a-f0-9]{64}/, "a imagem tem de estar presa a digest")
    assert.match(harness, /cruzamento invertido/, "o ramo adversarial do achado nao pode sumir")
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    assert.equal(pkg.scripts["audit:daciolo:provar"], "bash scripts/audit/provar-migration-daciolo.sh")
  })

  test("o seed ganha os SQ de 2006 e 2008, que eram a causa da nao-coleta", () => {
    const daciolo = SEED.find((entry) => entry.slug === "cabo-daciolo")
    assert.ok(daciolo, "o slug cabo-daciolo sumiu do seed")
    assert.equal(daciolo.ids?.tse_sq_candidato?.["2006"], "12132")
    assert.equal(daciolo.ids?.tse_sq_candidato?.["2008"], "14144")
  })
})

/* ─── Contrato de exibicao ──────────────────────── */

const PATRIMONIO_DEPOIS: Patrimonio[] = [
  {
    id: "pat-2006",
    candidato_id: "cabo-daciolo",
    ano_eleicao: 2006,
    valor_total: 0,
    bens: [{ tipo: "Outros bens e direitos", descricao: "Nenhum bem a declarar", valor: 0 }],
  },
  {
    id: "pat-2014",
    candidato_id: "cabo-daciolo",
    ano_eleicao: 2014,
    valor_total: 40_000,
    bens: [{ tipo: "Veículo automotor terrestre", descricao: "VERSA NISSAN 2013", valor: 40_000 }],
  },
  {
    id: "pat-2022",
    candidato_id: "cabo-daciolo",
    ano_eleicao: 2022,
    valor_total: 64_650,
    bens: [{ tipo: "OUTROS BENS E DIREITOS", descricao: "CAVALO MANGA LARGA", valor: 64_650 }],
  },
]

const AUSENCIAS_DEPOIS = [
  { ano_eleicao: 2008, fonte_url: URL_BENS_2008, verificado_em: "2026-08-10T19:00:00Z" },
  { ano_eleicao: 2018, fonte_url: URL_BENS_2018, verificado_em: "2026-08-07T18:27:03.374Z" },
]

/** As candidaturas do TSE que a ficha ja reconhecia antes desta migration. */
const HISTORICO = [
  { periodo_inicio: 2006, proveniencia: "tse", cargo: "Deputado Estadual", eleito_por: null },
  { periodo_inicio: 2008, proveniencia: "tse", cargo: "Vereador", eleito_por: null },
  { periodo_inicio: 2014, proveniencia: "tse", cargo: "Deputado Federal", eleito_por: "voto direto" },
  { periodo_inicio: 2018, proveniencia: "tse", cargo: "Presidente", eleito_por: null },
  { periodo_inicio: 2022, proveniencia: "tse", cargo: "Senador", eleito_por: null },
]

function renderMoneyTab(
  eleicoes: PatrimonioEleicaoPublico[],
  patrimonio: Patrimonio[] = PATRIMONIO_DEPOIS,
  highlightTimelineRef: string | null = null,
) {
  return renderToStaticMarkup(
    <MoneyTabSection
      patrimonio={patrimonio}
      financiamento={[]}
      historico={[]}
      gastos={[]}
      historicoLength={HISTORICO.length}
      suggestion={null}
      patrimonioEleicoes={eleicoes}
      highlightTimelineRef={highlightTimelineRef}
    />,
  )
}

describe("contrato de exibicao dos dois anos", () => {
  test("o DTO separa a declaracao de zero da ausencia de declaracao", () => {
    const eleicoes = buildPatrimonioEleicoes(PATRIMONIO_DEPOIS, AUSENCIAS_DEPOIS, HISTORICO)
    const porAno = new Map(eleicoes.map((e) => [e.ano, e]))

    assert.equal(porAno.get(2006)?.estado, "publicado", "2006 declarou zero, e declaracao e publicada")
    assert.equal(porAno.get(2008)?.estado, "vazio_confirmado", "2008 nao declarou: ausencia oficial")
    assert.equal(porAno.get(2008)?.fonte_url, URL_BENS_2008)
    assert.equal(porAno.get(2008)?.verificado_em, "2026-08-10T19:00:00Z")
    assert.equal(porAno.get(2018)?.estado, "vazio_confirmado", "2018 continua como estava")
    assert.equal(porAno.get(2014)?.estado, "publicado")
    assert.equal(porAno.get(2022)?.estado, "publicado")
    assert.equal(
      eleicoes.filter((e) => e.estado === "nao_coletado").length,
      0,
      "nenhum ano do daciolo sobra como coleta pendente",
    )
  })

  test("2006 aparece como declaracao de R$ 0,00, com o bem literal do TSE", () => {
    const eleicoes = buildPatrimonioEleicoes(PATRIMONIO_DEPOIS, AUSENCIAS_DEPOIS, HISTORICO)
    const html = renderMoneyTab(eleicoes, PATRIMONIO_DEPOIS, "patrimonio-pat-2006")

    // `formatBRL` do projeto nao imprime centavos: 2022 sai "R$ 64.650" e o
    // card de 2006 sai "R$ 0". Zero e um valor exibivel como qualquer outro, e
    // e o valor que o TSE registrou.
    assert.match(
      html,
      /font-bold tabular-nums tracking-tight text-foreground sm:text-\[28px\]">R\$(&nbsp;|\s)0</,
      "o card de 2006 precisa mostrar o total declarado",
    )
    assert.ok(
      html.includes("Nenhum bem a declarar"),
      "sem o bem literal, o card de zero nao diz o que a fonte disse",
    )
    // 2006 e patrimonio publicado, entao NAO pode aparecer na lista de eleicoes
    // sem dado, que e onde mora a frase de ausencia.
    assert.ok(
      !html.includes('data-pf-patrimonio-eleicao="2006"'),
      "2006 nao pode cair na lista de eleicoes sem dado publicado",
    )
  })

  test("2008 aparece como ausencia de declaracao, com fonte e data", () => {
    const eleicoes = buildPatrimonioEleicoes(PATRIMONIO_DEPOIS, AUSENCIAS_DEPOIS, HISTORICO)
    const html = renderMoneyTab(eleicoes)

    assert.ok(html.includes('data-pf-patrimonio-eleicao="2008"'))
    assert.ok(html.includes('data-pf-patrimonio-eleicao-estado="vazio_confirmado"'))
    assert.ok(
      html.includes(`Sem bens declarados ao TSE em 2008. O pacote oficial de bens desta eleição foi conferido e ${FRASE_AUSENCIA}`),
      "a frase de ausencia so e verdadeira em 2008, e ela precisa estar la",
    )
    assert.ok(html.includes(URL_BENS_2008), "a ausencia sem fonte oficial e afirmacao sem endereco")
    assert.ok(html.includes("Verificado em 10/08/2026"))
    assert.ok(
      !html.includes("A coleta de bens da eleição de 2008 ainda não foi realizada"),
      "2008 deixou de ser coleta pendente",
    )
  })

  test("modelar 2006 como ausencia faria a pagina mentir sobre a fonte", () => {
    // O contrato existente DA CONTA da diferenca, e este teste e a prova de que
    // ele so da conta porque a migration escolheu a tabela certa. Aqui o
    // modelamento errado e montado de proposito: 2006 sem linha em `patrimonio`
    // e com linha de ausencia oficial.
    const semODe2006 = PATRIMONIO_DEPOIS.filter((row) => row.ano_eleicao !== 2006)
    const eleicoesErradas = buildPatrimonioEleicoes(
      semODe2006,
      [{ ano_eleicao: 2006, fonte_url: URL_BENS_2008, verificado_em: "2026-08-10T19:00:00Z" }, ...AUSENCIAS_DEPOIS],
      HISTORICO,
    )
    const htmlErrado = renderMoneyTab(eleicoesErradas, semODe2006)

    assert.ok(
      htmlErrado.includes(`Sem bens declarados ao TSE em 2006. O pacote oficial de bens desta eleição foi conferido e ${FRASE_AUSENCIA}`),
      "e esta e a frase falsa: o pacote bem_candidato_2006 TRAZ um registro para o SQ 12132 em RJ",
    )
    assert.ok(
      !htmlErrado.includes("Nenhum bem a declarar"),
      "no modelamento errado a declaracao que existe some da tela",
    )
  })
})
