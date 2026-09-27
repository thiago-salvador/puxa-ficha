import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  encerraAtualizacao,
  naCoorteAtualizacao,
  notaAtualizacaoEncerrada,
  rotuloAtualizacaoEncerrada,
} from "../src/lib/coorte-atualizacao"
import {
  aplicarCoorteAtualizacao,
  carregarCoorteAtualizacao,
  coorteAtualizacaoDe,
  filtrarCoorteAtualizacao,
  isTabelaFaseAusente,
} from "../scripts/lib/coorte-atualizacao"
import { lerCandidaturasEncerradas, semEncerradasPorSlug, semEncerradasPorSq } from "../scripts/lib/data-freshness/coorte-atualizacao"
import { buildCoverageMatrix, lerEncerradasDoSnapshot, missingReceiptCells, blockingCells } from "../scripts/audit/audit-cobertura-fichas"
import { checkProcessosReceipts } from "../scripts/audit/check-processos-receipts"
import type { FaseEleitoral2026 } from "../src/lib/types"

describe("predicado da coorte de atualização", () => {
  it("sem data de encerramento a candidatura está na coorte (chave de segurança)", () => {
    assert.equal(naCoorteAtualizacao({ atualizacao_encerrada_em: null }), true)
    assert.equal(naCoorteAtualizacao({}), true)
    assert.equal(naCoorteAtualizacao({ atualizacao_encerrada_em: "2026-10-05" }), false)
  })

  it("regra do dono, genérica para os dois turnos", () => {
    const casos: Array<[string, Parameters<typeof encerraAtualizacao>[1], 1 | 2, boolean]> = [
      ["Senador", "eleito", 1, true],
      ["Senador", "nao_eleito", 1, true],
      ["Governador", "segundo_turno", 1, false],
      ["Governador", "eleito", 1, true],
      ["Presidente", "nao_eleito", 1, true],
      ["Governador", "nao_eleito", 2, true],
      ["Governador", "eleito", 2, true],
      ["Presidente", "fora_da_disputa", 1, true],
      ["Presidente", "em_disputa", 1, false],
    ]
    for (const [cargo, fase, turno, esperado] of casos) assert.equal(encerraAtualizacao(cargo, fase, turno), esperado, `${cargo} ${fase} ${turno}`)
  })

  it("nota pública neutra", () => {
    assert.equal(notaAtualizacaoEncerrada({ cargo_disputado: "Governador", fase_eleitoral: "nao_eleito", fase_turno: 1, atualizacao_encerrada_em: "2026-10-05" }),
      "Dados atualizados até 05/10/2026; a candidatura não segue na disputa.")
    assert.equal(notaAtualizacaoEncerrada({ cargo_disputado: "Senador", fase_eleitoral: "eleito", fase_turno: 1, atualizacao_encerrada_em: "2026-10-05" }),
      "Dados atualizados até 05/10/2026; eleito(a).")
    assert.equal(notaAtualizacaoEncerrada({ cargo_disputado: "Senador", fase_eleitoral: "fora_da_disputa", fase_turno: 1, atualizacao_encerrada_em: "2026-10-05" }),
      "Dados atualizados até 05/10/2026.")
    assert.equal(notaAtualizacaoEncerrada({ cargo_disputado: "Governador", fase_eleitoral: "segundo_turno", fase_turno: 1, atualizacao_encerrada_em: null }), null)
    assert.equal(rotuloAtualizacaoEncerrada("2026-10-05"), "atualização encerrada em 05/10")
  })

  it("nota do segundo turno recebe o formato real da view pública", () => {
    const viewRow: FaseEleitoral2026 = {
      fase_eleitoral: "eleito",
      fase_turno: 2,
      atualizacao_encerrada_em: "2026-10-26",
    }
    assert.equal(notaAtualizacaoEncerrada({ cargo_disputado: "Governador", ...viewRow }),
      "Dados atualizados até 26/10/2026; eleito(a) no segundo turno.")
    assert.equal(notaAtualizacaoEncerrada({ cargo_disputado: "Senador", ...viewRow }),
      "Dados atualizados até 26/10/2026; eleito(a).")
  })
})

describe("schema de fase e readbacks", () => {
  it("RLS limita anon às fichas publicadas", () => {
    const sql = readFileSync("supabase/migrations/20260927050000_candidaturas_fase_2026_schema.sql", "utf8")
    assert.match(sql, /CREATE POLICY candidaturas_fase_2026_public_read[\s\S]*?USING \(public\.is_public_candidate\(candidato_id\)\)/)
  })

  it("readback do rollback fixa UTC", () => {
    const sql = readFileSync("supabase/readback/20260927050000_candidaturas_fase_2026_schema.rollback.readback.sql", "utf8")
    assert.match(sql, /^BEGIN READ ONLY;\s*SET LOCAL TIME ZONE 'UTC';/)
  })
})

function clienteFake(resposta: { data?: unknown[]; error?: { code?: string; message: string } | null }) {
  const consultas: string[] = []
  const cadeia = {
    select() { return cadeia },
    not() { return Promise.resolve({ data: resposta.data ?? [], error: resposta.error ?? null }) },
  }
  return { consultas, client: { from(t: string) { consultas.push(t); return cadeia } } as never }
}

describe("carregador da coorte", () => {
  it("view ausente (antes da migration) vira coorte completa", async () => {
    const { client } = clienteFake({ error: { code: "PGRST205", message: "Could not find the table 'public.candidaturas_fase_2026_publico' in the schema cache" } })
    const coorte = await carregarCoorteAtualizacao(client)
    assert.equal(coorte.origem, "tabela_ausente")
    assert.equal(coorte.encerradas.size, 0)
    assert.equal(isTabelaFaseAusente({ code: "42P01", message: "x" }), true)
  })

  it("outro erro derruba a rotina (fail-closed)", async () => {
    const { client } = clienteFake({ error: { code: "57014", message: "statement timeout" } })
    await assert.rejects(carregarCoorteAtualizacao(client), /leitura de candidaturas_fase_2026_publico falhou/)
  })

  it("filtra por slug e por id e lê a view pública", async () => {
    const { client, consultas } = clienteFake({ data: [
      { candidato_id: "id-1", slug: "sen-eleito", fase_eleitoral: "eleito", fase_turno: 1, atualizacao_encerrada_em: "2026-10-05" },
    ] })
    const coorte = await carregarCoorteAtualizacao(client)
    assert.deepEqual(consultas, ["candidaturas_fase_2026_publico"])
    assert.deepEqual(filtrarCoorteAtualizacao([{ slug: "sen-eleito" }, { slug: "gov" }, { id: "id-1" }], coorte, "teste"), [{ slug: "gov" }])
  })

  it("sem coorte injetada, o filtro consulta a view e preserva fail-closed", async () => {
    const fechado = { candidato_id: "id-1", slug: "sen-eleito", fase_eleitoral: "eleito", fase_turno: 1, atualizacao_encerrada_em: "2026-10-05" }
    const { client, consultas } = clienteFake({ data: [fechado] })
    assert.deepEqual(await aplicarCoorteAtualizacao([{ slug: "sen-eleito" }, { slug: "gov" }], "teste", client), [{ slug: "gov" }])
    assert.deepEqual(consultas, ["candidaturas_fase_2026_publico"])

    const falha = clienteFake({ error: { code: "57014", message: "statement timeout" } })
    await assert.rejects(aplicarCoorteAtualizacao([{ slug: "gov" }], "teste", falha.client), /leitura de candidaturas_fase_2026_publico falhou/)
  })
})

describe("frescor e réguas tratam ficha congelada como encerrada", () => {
  it("data-freshness recorta os dois lados por SQ e por slug", () => {
    const recorte = lerCandidaturasEncerradas([{ candidato_id: "id-1", slug: "sen-eleito", atualizacao_encerrada_em: "2026-10-05", sq_candidatos: ["250000000001"] }])
    assert.deepEqual(semEncerradasPorSq([{ sq_candidato: "250000000001" }, { sq_candidato: "2" }], recorte), [{ sq_candidato: "2" }])
    assert.deepEqual(semEncerradasPorSlug([{ slug: "sen-eleito" }, { slug: "x" }], recorte), [{ slug: "x" }])
    assert.equal(lerCandidaturasEncerradas(undefined).itens.length, 0)
  })

  it("matriz de cobertura: célula aberta vira atualizacao_encerrada e sai do gate", () => {
    const perfis = [{ slug: "sen-eleito", cargo_disputado: "Senador" }, { slug: "sen-ativo", cargo_disputado: "Senador" }]
    const encerradas = lerEncerradasDoSnapshot([{ rows: [], atualizacao_encerrada: [{ slug: "sen-eleito", atualizacao_encerrada_em: "2026-10-05" }] }])
    const matriz = buildCoverageMatrix(perfis, [], {}, [], new Date(), encerradas)
    const congeladas = matriz.cells.filter((c) => c.slug === "sen-eleito" && c.aplicavel)
    assert.ok(congeladas.length > 0)
    assert.ok(congeladas.every((c) => c.estado === "atualizacao_encerrada" && c.motivo === "atualização encerrada em 05/10"))
    assert.equal(missingReceiptCells(matriz).some((c) => c.slug === "sen-eleito"), false)
    assert.equal(blockingCells(matriz).some((c) => c.slug === "sen-eleito"), false)
    assert.ok(missingReceiptCells(matriz).some((c) => c.slug === "sen-ativo"))
    assert.equal(buildCoverageMatrix(perfis).cells.some((c) => c.estado === "atualizacao_encerrada"), false)
  })

  it("recibos de processos: sem recibo ou vencido em ficha congelada não reprova", () => {
    const now = new Date("2026-10-20T12:00:00Z")
    const rows = [
      { candidate_id: "a", slug: "sen-eleito", atualizacao_encerrada_em: "2026-10-05" },
      { candidate_id: "b", slug: "gov-ativo" },
    ]
    const report = checkProcessosReceipts(rows, { now })
    assert.equal(report.summary.atualizacao_encerrada, 1)
    assert.deepEqual(report.missing_candidate_ids, ["b"])
    assert.equal(checkProcessosReceipts([rows[0]], { now }).ok, true)
  })

  it("coorteAtualizacaoDe ignora linha sem encerramento", () => {
    const c = coorteAtualizacaoDe([{ candidato_id: "x", slug: "gov-2t", fase_eleitoral: "segundo_turno", fase_turno: 1, atualizacao_encerrada_em: null as unknown as string }])
    assert.equal(c.encerradas.size, 0)
  })
})
