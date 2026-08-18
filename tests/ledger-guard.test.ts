import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parsearVersoesRemotas } from "../scripts/audit/check-ledger-vs-repo"
import {
  RETIDAS_PADRAO,
  compararLedgerComRepo,
  versaoDoArquivo,
} from "../scripts/audit/lib/ledger-guard"

/**
 * O invariante tem três regras, e a razão de ser três em vez de "diff vazio" é
 * que migration pendente é estado normal: um gate de diff vazio derrubaria todo
 * PR que cria uma migration.
 *
 *   R1  só-remota            -> SEMPRE falha
 *   R2  só-local retroativa  -> falha, salvo allowlist das retidas
 *   R3  só-local futura      -> passa
 *
 * Tudo aqui roda com listas em memória, sem banco e sem rede.
 */

function arquivo(versao: string, slug = "migration_qualquer"): string {
  return `${versao}_${slug}.sql`
}

describe("ledger-guard: as três regras do invariante", () => {
  it("R1: versão no ledger sem arquivo no repo sempre reprova", () => {
    const r = compararLedgerComRepo(
      ["20260101000000", "20260102000000"],
      [arquivo("20260101000000")],
    )

    assert.equal(r.violacoes.length, 1)
    assert.equal(r.violacoes[0].regra, "R1")
    assert.equal(r.violacoes[0].versao, "20260102000000")
    assert.equal(r.violacoes[0].arquivo, undefined)
  })

  it("R2: só-local retroativa fora da allowlist reprova", () => {
    const r = compararLedgerComRepo(
      ["20260101000000", "20260103000000"],
      [arquivo("20260101000000"), arquivo("20260102000000", "esquecida"), arquivo("20260103000000")],
    )

    assert.equal(r.violacoes.length, 1)
    assert.equal(r.violacoes[0].regra, "R2")
    assert.equal(r.violacoes[0].versao, "20260102000000")
    assert.equal(r.violacoes[0].arquivo, "20260102000000_esquecida.sql")
    assert.match(r.violacoes[0].detalhe, /20260103000000/)
  })

  it("R3: só-local futura passa, porque é migration pendente normal", () => {
    const r = compararLedgerComRepo(
      ["20260101000000"],
      [arquivo("20260101000000"), arquivo("20260104000000", "pendente_do_pr")],
    )

    assert.deepEqual(r.violacoes, [])
    assert.deepEqual(r.pendentesFuturas, ["20260104000000_pendente_do_pr.sql"])
  })

  it("R2 é dispensada para as retidas, e só para elas", () => {
    const topo = "20260808032540"
    const locais = [...RETIDAS_PADRAO.map((v) => arquivo(v, "retida")), arquivo(topo, "aplicada")]

    const r = compararLedgerComRepo([topo], locais)

    assert.deepEqual(r.violacoes, [])
    assert.equal(r.retidasIgnoradas.length, RETIDAS_PADRAO.length)

    // A mesma lista, com uma retroativa a mais que não está na allowlist.
    const comIntrusa = compararLedgerComRepo([topo], [...locais, arquivo("20260807059999", "intrusa")])
    assert.equal(comIntrusa.violacoes.length, 1)
    assert.equal(comIntrusa.violacoes[0].versao, "20260807059999")
  })

  it("ledger vazio não inventa retroatividade: tudo vira pendente", () => {
    const r = compararLedgerComRepo([], [arquivo("20200101000000", "primeira")])

    assert.deepEqual(r.violacoes, [])
    assert.deepEqual(r.pendentesFuturas, ["20200101000000_primeira.sql"])
    assert.equal(r.topoDoLedger, undefined)
  })
})

/**
 * Snapshot do estado real de 08/08/2026, antes e depois da correção. Fixture
 * fixa de propósito: o repo muda, o registro do incidente não.
 *
 * Antes: 20260808010000_marcadores_tse_residuais_patrimonio.sql existia no repo,
 * e a MESMA migration constava do ledger como 20260808032540, porque foi
 * aplicada via `apply_migration` do MCP, que carimba timestamp próprio em vez de
 * usar o nome do arquivo. Duas violações saem daí: a versão do ledger sem
 * arquivo (R1) e o arquivo órfão, agora retroativo (R2).
 *
 * Depois: o arquivo foi renomeado para a versão com que foi aplicada. Sobram só
 * as cinco retidas, que a allowlist tolera.
 */
const LEDGER_08_08 = [
  "20260807054000",
  "20260807180000",
  "20260807181000",
  "20260807182000",
  "20260807183000",
  "20260807184000",
  "20260807185000",
  "20260808032540",
]

const REPO_APLICADAS_08_08 = [
  arquivo("20260807054000", "neutralizar_historico_judicial_sem_merito"),
  arquivo("20260807180000", "backfill_candidaturas_oficiais_trajetoria"),
  arquivo("20260807181000", "patrimonio_ausencia_oficial"),
  arquivo("20260807182000", "backfill_patrimonio_oficial_2006_2024"),
  arquivo("20260807183000", "backfill_patrimonio_oficial_2026_snapshot"),
  arquivo("20260807184000", "remover_patrimonio_homonimo_jarbas_soares"),
  arquivo("20260807185000", "renato_gomes_remove_reincidencia_homonimo"),
]

const RETIDAS_COMO_ARQUIVO = [
  arquivo("20260807050000", "a2_money_reconciled_194_profiles"),
  arquivo("20260807051000", "b1_project_official_urls"),
  arquivo("20260807052000", "b2_current_profiles_tse_2026"),
  arquivo("20260807052500", "a1_guilherme_fonseca_identity_fill"),
  arquivo("20260807053000", "hide_no_mandate_attention_points"),
]

describe("ledger-guard: o caso real de 08/08/2026", () => {
  it("antes da correção, acusa a divergência do apply_migration", () => {
    const r = compararLedgerComRepo(LEDGER_08_08, [
      ...REPO_APLICADAS_08_08,
      ...RETIDAS_COMO_ARQUIVO,
      arquivo("20260808010000", "marcadores_tse_residuais_patrimonio"),
    ])

    assert.deepEqual(
      r.violacoes.map((v) => `${v.regra} ${v.versao}`),
      ["R1 20260808032540", "R2 20260808010000"],
    )
    // As cinco retidas continuam toleradas mesmo no cenário quebrado: o gate
    // acusa a divergência real, não a divergência deliberada.
    assert.equal(r.retidasIgnoradas.length, 5)
  })

  it("depois da correção, só sobram as cinco retidas e o gate fica verde", () => {
    const r = compararLedgerComRepo(LEDGER_08_08, [
      ...REPO_APLICADAS_08_08,
      ...RETIDAS_COMO_ARQUIVO,
      arquivo("20260808032540", "marcadores_tse_residuais_patrimonio"),
    ])

    assert.deepEqual(r.violacoes, [])
    assert.deepEqual(r.retidasIgnoradas, RETIDAS_COMO_ARQUIVO)
    assert.deepEqual(r.pendentesFuturas, [])
  })
})

describe("ledger-guard: entrada malformada não passa como verde", () => {
  it("lista remota vazia é erro, não 'nenhuma migration aplicada'", () => {
    assert.throws(() => parsearVersoesRemotas("\n  \n"), /vazia/)
  })

  it("linha fora do formato de 14 dígitos é erro", () => {
    assert.throws(
      () => parsearVersoesRemotas("20260101000000\npsql: error: connection failed"),
      /malformada/,
    )
  })

  it("aceita a saída de psql -Atq, com espaço e linha final sobrando", () => {
    assert.deepEqual(parsearVersoesRemotas("20260101000000\n 20260102000000 \n"), [
      "20260101000000",
      "20260102000000",
    ])
  })

  it("arquivo com nome fora do padrão vira violação, não silêncio", () => {
    assert.equal(versaoDoArquivo("sem_timestamp.sql"), undefined)
    const r = compararLedgerComRepo(["20260101000000"], [
      arquivo("20260101000000"),
      "sem_timestamp.sql",
    ])
    assert.equal(r.violacoes.length, 1)
    assert.match(r.violacoes[0].detalhe, /fora do padrão/)
  })

  it("versão duplicada em dois arquivos vira violação", () => {
    const r = compararLedgerComRepo(
      ["20260101000000"],
      [arquivo("20260101000000", "a"), arquivo("20260101000000", "b")],
    )
    assert.equal(r.violacoes.length, 1)
    assert.match(r.violacoes[0].detalhe, /duplicada/)
  })
})
