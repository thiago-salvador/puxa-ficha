import test, { describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { classificarVotacao } from "../scripts/lib/votacao-classificacao"

const MIGRATIONS = join(import.meta.dirname, "..", "supabase", "migrations")
const ROLLBACKS = join(import.meta.dirname, "..", "supabase", "rollback")
const DATASET = readFileSync(
  join(MIGRATIONS, "20260810090200_votacoes_chave_dataset_v2.sql"),
  "utf8"
)
const DESPUBLICACAO = readFileSync(
  join(MIGRATIONS, "20260810090100_despublicar_votacoes_chave_defeituosas.sql"),
  "utf8"
)
const DDL = readFileSync(
  join(MIGRATIONS, "20260810090000_votacoes_chave_chave_por_votacao.sql"),
  "utf8"
)

/**
 * As 12 matérias que entram, das 13 aprovadas em 10/08/2026, com a descrição OFICIAL da votação
 * lida na Câmara Dados Abertos. A descrição oficial não fica na migration (lá
 * está o texto editorial), então ela mora aqui: é contra ela que o teste prova
 * que nenhuma delas é procedimental e que o placar bate com o limiar editorial.
 */
const APROVADAS: Array<{
  votacaoId: string
  sim: number
  nao: number
  descricaoOficial: string
}> = [
  { votacaoId: "14493-503", sim: 323, nao: 155, descricaoOficial: "Aprovada a Emenda Aglutinativa nº 16. Sim: 323; não: 155; abstenção: 2; total: 480." },
  { votacaoId: "2123843-93", sim: 373, nao: 50, descricaoOficial: "Aprovada, em segundo turno, a Proposta de Emenda à Constituição n° 304, de 2017. Sim: 373; não: 50; abstenção: 6; Total: 429." },
  { votacaoId: "340812-195", sim: 221, nao: 167, descricaoOficial: "Aprovado o Substitutivo adotado pela Mesa Diretora ao Projeto de Resolução nº 8 de 2007. Sim: 221; não: 167; abstenção: 1; total: 388." },
  { votacaoId: "2270800-135", sim: 353, nao: 134, descricaoOficial: "Aprovado, em primeiro turno, o Substitutivo Reformulado à Proposta de Emenda à Constituição nº 3, de 2021, adotado pelo Relator da Comissão Especial. Sim: 353; Não: 134; Abstenção: 1; Total: 488." },
  { votacaoId: "2515648-44", sim: 383, nao: 98, descricaoOficial: "Aprovado o Substitutivo ao Projeto de Decreto Legislativo nº 214, de 2025, adotado pelo relator da Comissão de Constituição e Justiça e de Cidadania. Sim: 383; Não: 98; Total: 481." },
  { votacaoId: "2351506-122", sim: 368, nao: 96, descricaoOficial: "Aprovada, em segundo turno, a Proposta de Emenda à Constituição n° 5, de 2023. Sim: 368; Não: 96; Abstenção: 7; Total: 471." },
  { votacaoId: "2383019-54", sim: 270, nao: 207, descricaoOficial: "Aprovado o Substitutivo ao Projeto de Lei Complementar nº 177, de 2023, adotado pelo relator da Comissão de Finanças e Tributação. Sim: 270; Não: 207; Abstenção: 1; Total: 478." },
  { votacaoId: "2473389-58", sim: 318, nao: 149, descricaoOficial: "Aprovado o Substitutivo ao Projeto de Lei Complementar nº 210, de 2024, adotado pelo relator da Comissão Especial. Sim: 318; Não: 149; Total: 467." },
  { votacaoId: "2494565-52", sim: 315, nao: 143, descricaoOficial: "Aprovado o parecer da Comissão de Constituição e Justiça e de Cidadania à Sustação de Andamento de Ação Penal nº 1, de 2025, pela sustação do andamento da Ação Penal. . Sim: 315; Não: 143; Abstenção: 4; Total: 462." },
  { votacaoId: "2430143-140", sim: 324, nao: 123, descricaoOficial: "Aprovados os dispositivos do Substitutivo do Senado Federal ao Projeto de Lei Complementar nº 68, de 2024, com parecer pela aprovação. Sim: 324; Não: 123; Abstenção: 3; Total: 450." },
  { votacaoId: "2409076-34", sim: 370, nao: 77, descricaoOficial: "Aprovado o Projeto de Lei Complementar nº 243, de 2023. Sim: 370; não: 77; abstenção: 4; total: 451." },
  { votacaoId: "2324721-94", sim: 309, nao: 131, descricaoOficial: "Aprovado o Projeto de Lei nº 1.366, de 2022. Sim: 309; não: 131; abstenção: 2; total: 442." },
]

/** As 6 linhas despublicadas e os pares de cada uma, medidos no banco em 10/08/2026. */
const DESPUBLICADAS: Array<[string, number]> = [
  ["a7c70604-5116-4545-a2a4-a00a7761af43", 20],
  ["9c1f05a7-fe8d-4c45-8827-ca23d029b1a0", 20],
  ["b2aa93fb-faa1-423c-bae7-70ea6ff35fe0", 27],
  ["a539c15d-20a0-4e55-876b-a7bbba7ef0d2", 8],
  ["d652e083-aa23-4df9-a66f-433816d330cc", 12],
  ["86e0edac-52a5-44fe-b699-1c09aaf42a32", 13],
]

const LIMIAR_MINORIA = 0.1

describe("dataset editorial v2 de votações-chave (item 7)", () => {
  test("a migration insere exatamente as 12 matérias que produzem voto", () => {
    const ids = [...DATASET.matchAll(/-- @write tabela=votacoes_chave ref=([\w-]+)/g)].map((m) => m[1])
    assert.deepEqual(ids, APROVADAS.map((a) => a.votacaoId))
    assert.equal(ids.length, 12)
  })

  test("toda linha declara fonte camara e o próprio votacao_id_api", () => {
    for (const { votacaoId } of APROVADAS) {
      assert.ok(
        DATASET.includes(`'camara', '${votacaoId}'`),
        `${votacaoId} precisa entrar com fonte camara e a chave literal`
      )
    }
  })

  /**
   * O gate que impede a repetição do defeito do PL das Fake News: nenhuma
   * pode ser procedimental na descrição OFICIAL da fonte.
   */
  test("nenhuma das 12 é procedimental na fonte", () => {
    for (const { votacaoId, descricaoOficial } of APROVADAS) {
      const r = classificarVotacao(descricaoOficial)
      assert.notEqual(
        r.classificacao,
        "procedimental",
        `${votacaoId} classificou como procedimental por ${r.regra}`
      )
    }
  })

  test("toda votação respeita o limiar editorial de 10% de minoria", () => {
    for (const { votacaoId, sim, nao } of APROVADAS) {
      const minoria = Math.min(sim, nao) / (sim + nao)
      assert.ok(
        minoria >= LIMIAR_MINORIA,
        `${votacaoId} tem minoria de ${(minoria * 100).toFixed(1)}%, abaixo do limiar`
      )
    }
  })

  /**
   * As duas retiradas pela régua de unanimidade não podem voltar por descuido:
   * a cassação de Eduardo Cunha (450x10) e a jornada de 36 horas (472x22).
   */
  test("as matérias retiradas pela régua de unanimidade continuam fora", () => {
    for (const [placar, id] of [
      ["450x10, cassação de Eduardo Cunha", "2025146-115"],
      ["472x22, jornada de 36 horas", "2233802-424"],
    ]) {
      assert.ok(!DATASET.includes(id), `${placar} (${id}) não pode estar no dataset`)
    }
  })

  test("as 3 matérias PENDENTES continuam fora", () => {
    for (const id of ["373327-143", "2080604-354", "2088280-73"]) {
      assert.ok(!DATASET.includes(id), `${id} está pendente e não pode entrar`)
    }
  })
})

describe("semântica pública do voto (item 7)", () => {
  /**
   * Nas duas, um rótulo sem o verbo faria o leitor entender o voto ao contrário.
   * O que se aprovou no caso Temer foi o parecer pelo INDEFERIMENTO.
   */
  /**
   * A matéria saiu do dataset por medição, não por juízo: o endpoint
   * /votacoes/2143164-138/votos devolve `dados: []`, então ela não atribui voto
   * a candidato nenhum. A regra de semântica fica guardada para quando voltar:
   * se o id reaparecer numa migration, a descrição TEM de dizer que SIM barra a
   * abertura do processo, porque o que se aprovou foi o parecer pelo
   * indeferimento.
   */
  test("Temer está fora, e a regra de semântica dele continua guardada", () => {
    const declarada = /-- @write tabela=votacoes_chave ref=2143164-138/.test(DATASET)
    if (!declarada) {
      assert.match(DATASET, /RETIRADA ANTES DE APLICAR/, "a saída precisa estar documentada no arquivo")
      assert.match(DATASET, /SIM barra a abertura do\n-- processo criminal/, "a regra de rótulo tem de ficar registrada")
      return
    }
    assert.match(trechoDaMateria("2143164-138"), /SIM barra a abertura do processo criminal/)
  })

  test("SAP 1/2025 deixa explícito que SIM suspende a ação penal", () => {
    const linha = trechoDaMateria("2494565-52")
    assert.match(linha, /SIM suspende o andamento da ação penal/)
  })

  test("toda matéria diz o que SIM significa", () => {
    for (const { votacaoId } of APROVADAS) {
      assert.match(
        trechoDaMateria(votacaoId),
        /\bSIM\b/,
        `${votacaoId} não declara o sentido do voto SIM`
      )
    }
  })

  test("nenhuma descrição promete conteúdo que a ementa oficial não tem", () => {
    // O Decreto 12.466/2025 é nomeado e não descrito: a ementa oficial do
    // PDL 214/2025 não diz do que ele trata, e a rodada anterior desta frente
    // chegou a chamá-lo de "decreto do IOF" sem ter medido isso.
    const linha = trechoDaMateria("2515648-44")
    assert.match(linha, /Decreto nº 12\.466, de 22 de maio de 2025/)
    assert.ok(!/IOF/i.test(linha), "não afirmar do que o decreto trata sem fonte")
  })
})

describe("despublicação das linhas defeituosas (item 7)", () => {
  test("apaga exatamente as 6 linhas medidas, votos antes de votações", () => {
    for (const [uuid] of DESPUBLICADAS) {
      assert.ok(
        DESPUBLICACAO.includes(`delete from public.votos_candidato where votacao_id = '${uuid}'`),
        `faltou apagar os pares de ${uuid}`
      )
      assert.ok(
        DESPUBLICACAO.includes(`delete from public.votacoes_chave where id = '${uuid}'`),
        `faltou apagar a linha ${uuid}`
      )
      assert.ok(
        DESPUBLICACAO.indexOf(`votos_candidato where votacao_id = '${uuid}'`) <
          DESPUBLICACAO.indexOf(`votacoes_chave where id = '${uuid}'`),
        `${uuid}: votos têm de ser apagados antes da votação, por causa da referência`
      )
    }
  })

  test("os 100 pares estão declarados linha a linha", () => {
    const total = DESPUBLICADAS.reduce((acc, [, n]) => acc + n, 0)
    assert.equal(total, 100)
    for (const [uuid, pares] of DESPUBLICADAS) {
      assert.ok(
        DESPUBLICACAO.includes(`'${uuid}';  -- `) && DESPUBLICACAO.includes(`${pares} pares`),
        `${uuid} precisa declarar os ${pares} pares no comentário`
      )
    }
  })

  test("toda escrita tem anotação @write, 12 no total", () => {
    const writes = DESPUBLICACAO.match(/-- @write /g) ?? []
    assert.equal(writes.length, 12)
    const deletes = DESPUBLICACAO.match(/^delete from/gm) ?? []
    assert.equal(deletes.length, 12, "cada delete precisa da própria anotação")
  })
})

describe("chave composta (item 7)", () => {
  test("o DDL cria fonte, votacao_id_api e o índice único", () => {
    assert.match(DDL, /add column if not exists fonte text/)
    assert.match(DDL, /add column if not exists votacao_id_api text/)
    assert.match(DDL, /create unique index if not exists votacoes_chave_fonte_votacao_id_api_key/)
    assert.match(DDL, /on public\.votacoes_chave \(fonte, votacao_id_api\)/)
  })

  test("fonte e id ficam ambos ausentes ou formam uma chave suportada", () => {
    assert.match(DDL, /add constraint votacoes_chave_fonte_id_consistentes_check/i)
    assert.match(DDL, /fonte is null and votacao_id_api is null/i)
    assert.match(DDL, /fonte in \('camara', 'senado'\)/i)
    assert.match(DDL, /btrim\(votacao_id_api\) <> ''/i)
    assert.match(DDL, /where fonte is not null and votacao_id_api is not null/i)
  })

  /**
   * A checagem é por ANOTAÇÃO no início da linha, não pela string solta: a
   * própria prosa do arquivo explica por que ele não carrega `@write`, e um
   * `includes` reprovaria o comentário que documenta a ausência.
   */
  test("o DDL não escreve dado, então não carrega anotação @write", () => {
    assert.ok(!/^\s*--\s*@write\b/m.test(DDL), "DDL não pode declarar escrita")
    assert.ok(!/^\s*(insert|update|delete)\s/im.test(DDL), "DDL não pode conter DML")
  })
})

describe("atomicidade de migration e rollback", () => {
  test("migrations de dados não encerram a transação externa do aplicador", () => {
    for (const [nome, sql] of [
      ["despublicação", DESPUBLICACAO],
      ["dataset v2", DATASET],
    ] as const) {
      assert.doesNotMatch(sql, /^begin;\s*$/m, `${nome} não pode abrir transação própria`)
      assert.doesNotMatch(sql, /^commit;\s*$/m, `${nome} não pode fechar transação própria`)
    }
  })

  test("rollbacks executáveis removem o próprio ledger na mesma transação externa", () => {
    const rollbacks = {
      "20260810085000": "lula_2018_registro_indeferido_eleito_por",
      "20260810090000": "votacoes_chave_chave_por_votacao",
      "20260810090200": "votacoes_chave_dataset_v2",
      "20260810094000": "daciolo_patrimonio_2006_2008",
    } as const
    for (const [versao, sufixo] of Object.entries(rollbacks)) {
      const sql = readFileSync(join(ROLLBACKS, `${versao}_${sufixo}.rollback.sql`), "utf8")
      assert.doesNotMatch(sql, /^begin;\s*$/m)
      assert.doesNotMatch(sql, /^commit;\s*$/m)
      assert.match(sql, new RegExp(`DELETE FROM supabase_migrations\\.schema_migrations[\\s\\S]*${versao}`, "i"))
    }
  })
})

function trechoDaMateria(votacaoId: string): string {
  const marca = `ref=${votacaoId} `
  const ini = DATASET.indexOf(marca)
  assert.notEqual(ini, -1, `matéria ${votacaoId} não encontrada`)
  const fim = DATASET.indexOf(");", ini)
  return DATASET.slice(ini, fim)
}
