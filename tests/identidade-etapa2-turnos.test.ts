import assert from "node:assert/strict"
import { it } from "node:test"

import {
  classificarIdentidade,
  colapsarLinhasPorTurno,
  type LinhaTse,
} from "../scripts/lib/identidade-etapa2-classificador"

type LinhaComTurno = LinhaTse & { NR_TURNO: string }

const base: LinhaComTurno = {
  SQ_CANDIDATO: "990000000001",
  NM_CANDIDATO: "FULANA DE TAL",
  NM_URNA_CANDIDATO: "FULANA",
  DS_CARGO: "GOVERNADOR",
  SG_UF: "AC",
  SG_PARTIDO: "XX",
  NR_CANDIDATO: "11",
  DT_NASCIMENTO: "01/01/1970",
  NR_TURNO: "1",
}

const perfil = { slug: "fulana", nome_completo: "Fulana de Tal", nome_urna: "Fulana", cargo_disputado: "Governador", estado: "AC" }
const fontesCom = (todas: LinhaTse[]) => ({ todas, sqComComplemento: new Set<string>(), redesPorSq: new Map<string, number>() })

it("colapsa as linhas de 1º e 2º turno da mesma candidatura numa só", () => {
  const linhas = [base, { ...base, NR_TURNO: "2" }]
  const colapsadas = colapsarLinhasPorTurno(linhas)
  assert.equal(colapsadas.length, 1)
  assert.equal(colapsadas[0]!.NR_TURNO, "1")
})

it("casamento exato com duas linhas de turno continua match_fresco depois do colapso", () => {
  const linhas = [base, { ...base, NR_TURNO: "2" }]
  assert.notEqual(classificarIdentidade(perfil, fontesCom(linhas)).classe, "match_fresco")
  const resultado = classificarIdentidade(perfil, fontesCom(colapsarLinhasPorTurno(linhas)))
  assert.equal(resultado.classe, "match_fresco")
  assert.deepEqual(resultado.chave, { type: "SQ_CANDIDATO", value: base.SQ_CANDIDATO })
})

it("não colapsa quando as linhas do mesmo SQ divergem em campo de identidade", () => {
  for (const campo of ["NM_CANDIDATO", "NM_URNA_CANDIDATO", "DS_CARGO", "SG_UF", "SG_PARTIDO", "NR_CANDIDATO", "DT_NASCIMENTO"] as const) {
    const linhas = [base, { ...base, NR_TURNO: "2", [campo]: "OUTRO" }]
    assert.equal(colapsarLinhasPorTurno(linhas).length, 2, campo)
  }
})

it("não junta candidaturas diferentes, mesmo com nome igual", () => {
  const homonimo = { ...base, SQ_CANDIDATO: "990000000002" }
  const colapsadas = colapsarLinhasPorTurno([base, homonimo])
  assert.equal(colapsadas.length, 2)
  assert.equal(classificarIdentidade(perfil, fontesCom(colapsadas)).classe, "ambiguo")
})
