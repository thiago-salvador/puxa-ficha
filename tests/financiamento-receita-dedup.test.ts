import assert from "node:assert/strict"
import test from "node:test"

import {
  financiamentoReceitaDedupKey,
  financiamentoReceitaSemanticFingerprint,
  isValidFinanciamentoReceiptId,
} from "../scripts/lib/financiamento-receita-dedup"

const identity = { ano: 2018, uf: "TO", sqCandidato: "270000629454" }

function dedupe(rows: Record<string, string>[], rowIdentity = identity): Record<string, string>[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = financiamentoReceitaDedupKey(row, rowIdentity)
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

test("deduplica par derivado do recibo UF/Brasil de 2012 e canoniza a data legada", () => {
  const rows = dedupe([
    {
      SQ_RECEITA: "2317102550AM000009",
      VR_RECEITA: "2050",
      DS_RECEITA: "RECEITA_ANONIMIZADA",
      "Data da receita": "28/09/12",
      "Data e hora": "15/05/201313:41:51",
      "Desc. Eleição": "Eleição Municipal 2012",
    },
    {
      SQ_RECEITA: "2317102550AM000009",
      VR_RECEITA: "2050",
      DS_RECEITA: "RECEITA_ANONIMIZADA",
      "Data da receita": "28/09/201200:00:00",
      "Data e hora": "06/07/201614:36:58",
      "Cód. Eleição": "47",
      "Desc. Eleição": "Eleição Municipal 2012 - exportação Brasil",
    },
  ], { ano: 2012, uf: "AM", sqCandidato: "40002550806" })
  assert.equal(rows.length, 1)
})

test("fixture anonimizada reproduz 3260 após dedup contra 6420 bruto", () => {
  // IDs, valores e datas são derivados do par oficial MA/Brasil de 2012;
  // descrição e dados pessoais foram substituídos por marcadores consistentes.
  const base = [
    ["0001608036MA000001", "500", "17/07/12"],
    ["0001608036MA000002", "1000", "17/07/12"],
    ["0001608036MA000003", "200", "17/07/12"],
    ["0001608036MA000005", "600", "23/07/12"],
    ["0001608036MA000007", "510", "13/08/12"],
    ["0001608036MA000008", "300", "22/08/12"],
    ["0001608036MA000009", "50", "03/10/12"],
  ].map(([receipt, amount, date], index) => ({
    SQ_RECEITA: receipt,
    VR_RECEITA: amount,
    DS_RECEITA: `RECEITA_ANONIMIZADA_${index + 1}`,
    "Data da receita": date,
    "Data e hora": "15/05/201313:41:51",
    "Desc. Eleição": "Eleição Municipal 2012",
  }))
  const brasilCopy = base.map((row) => ({
    ...row,
    "Data da receita": row["Data da receita"].replace(/\/(\d{2})$/, "/20$1") + "00:00:00",
    "Data e hora": "06/07/201614:36:58",
    "Desc. Eleição": "Eleição Municipal 2012 - exportação Brasil",
  }))
  const brasilOnly = ["0001608036MA000004", "0001608036MA000006"].map((receipt) => ({
    SQ_RECEITA: receipt,
    VR_RECEITA: "50",
    DS_RECEITA: "RECEITA_ANONIMIZADA_EXTRA",
    "Data da receita": "17/07/201200:00:00",
    "Data e hora": "06/07/201614:36:58",
    "Desc. Eleição": "Eleição Municipal 2012",
  }))
  const rows = [...base, ...brasilCopy, ...brasilOnly]
  assert.equal(rows.reduce((sum, row) => sum + Number(row.VR_RECEITA), 0), 6420)
  const deduped = dedupe(rows, { ano: 2012, uf: "MA", sqCandidato: "100002536212" })
  assert.equal(deduped.reduce((sum, row) => sum + Number(row.VR_RECEITA), 0), 3260)
})

test("preserva diferenças reais nos campos privados do doador", () => {
  const rows = dedupe([
    { SQ_RECEITA: "2317102550AM000009", VR_RECEITA: "2050", DS_RECEITA: "RECEITA_ANONIMIZADA", NM_DOADOR: "DOADOR_A" },
    { SQ_RECEITA: "2317102550AM000009", VR_RECEITA: "2050", DS_RECEITA: "RECEITA_ANONIMIZADA", NM_DOADOR: "DOADOR_B" },
  ], { ano: 2012, uf: "AM", sqCandidato: "40002550806" })
  assert.equal(rows.length, 2)
})

test("preserva datas de receita realmente diferentes", () => {
  const rows = dedupe([
    { SQ_RECEITA: "11962436", VR_RECEITA: "400", DS_RECEITA: "LONA", "Data da receita": "28/09/12" },
    { SQ_RECEITA: "11962436", VR_RECEITA: "400", DS_RECEITA: "LONA", "Data da receita": "29/09/12" },
  ], { ano: 2012, uf: "MA", sqCandidato: "100002536212" })
  assert.equal(rows.length, 2)
})

test("remove cópia exata entre dumps mesmo com campos de geração diferentes", () => {
  const rows = dedupe([
    { SQ_RECEITA: "11962436", VR_RECEITA: "400", DS_RECEITA: "LONA", DT_GERACAO: "01/10", HH_GERACAO: "10:00" },
    { SQ_RECEITA: "11962436", VR_RECEITA: "400", DS_RECEITA: "LONA", DT_GERACAO: "02/10", HH_GERACAO: "11:00" },
  ])
  assert.equal(rows.length, 1)
})

test("preserva mesmo SQ_RECEITA com valor diferente", () => {
  const rows = dedupe([
    { SQ_RECEITA: "11962436", VR_RECEITA: "400", DS_RECEITA: "LONA" },
    { SQ_RECEITA: "11962436", VR_RECEITA: "257.04", DS_RECEITA: "LONA" },
  ])
  assert.equal(rows.length, 2)
})

test("preserva mesmo SQ_RECEITA e valor com descrição diferente", () => {
  const rows = dedupe([
    { SQ_RECEITA: "11962438", VR_RECEITA: "1500", DS_RECEITA: "ADESIVO" },
    { SQ_RECEITA: "11962438", VR_RECEITA: "1500", DS_RECEITA: "BANNER" },
  ])
  assert.equal(rows.length, 2)
})

test("reproduz a cardinalidade dos recibos estimáveis de Eduardo Gomes 2018", () => {
  const sq11962436 = dedupe([
    { SQ_RECEITA: "11962436", VR_RECEITA: "400", DS_RECEITA: "LONAS" },
    { SQ_RECEITA: "11962436", VR_RECEITA: "257.04", DS_RECEITA: "LONAS" },
    { SQ_RECEITA: "11962436", VR_RECEITA: "340", DS_RECEITA: "ADESIVOS" },
    { SQ_RECEITA: "11962436", VR_RECEITA: "120.96", DS_RECEITA: "BANNER" },
    { SQ_RECEITA: "11962436", VR_RECEITA: "480", DS_RECEITA: "SANTINHOS" },
    { SQ_RECEITA: "11962436", VR_RECEITA: "480", DS_RECEITA: "SANTINHOS" },
  ])
  const sq11962438 = dedupe([
    { SQ_RECEITA: "11962438", VR_RECEITA: "1500", DS_RECEITA: "LONAS", DS_NATUREZA_RECURSO_ESTIMAVEL: "MATERIAL" },
    { SQ_RECEITA: "11962438", VR_RECEITA: "1250", DS_RECEITA: "ADESIVOS", DS_NATUREZA_RECURSO_ESTIMAVEL: "MATERIAL" },
    { SQ_RECEITA: "11962438", VR_RECEITA: "1270", DS_RECEITA: "BANNER", DS_NATUREZA_RECURSO_ESTIMAVEL: "MATERIAL" },
    { SQ_RECEITA: "11962438", VR_RECEITA: "135", DS_RECEITA: "SANTINHOS", DS_NATUREZA_RECURSO_ESTIMAVEL: "SERVIÇO" },
  ])
  assert.equal(sq11962436.length, 5)
  assert.equal(sq11962438.length, 4)
})

test("não colapsa linhas sem SQ_RECEITA válido", () => {
  for (const marker of ["", "0", "#NULO#", "#NULO", "#NE", "-1", "N/A"]) {
    const row = { SQ_RECEITA: marker, VR_RECEITA: "100", DS_RECEITA: "ITEM" }
    assert.equal(financiamentoReceitaDedupKey(row, identity), null)
    assert.equal(dedupe([row, { ...row }]).length, 2)
  }
})

test("trata marcadores TSE como recibo ausente e aceita alias de ID válido", () => {
  assert.equal(isValidFinanciamentoReceiptId("#NÚLO#"), false)
  const rows = dedupe([
    { SQ_RECEITA: "#NULO#", VR_RECEITA: "100", DS_RECEITA: "ITEM A" },
    { SQ_RECEITA: "#NE", VR_RECEITA: "100", DS_RECEITA: "ITEM B" },
    { SQ_RECEITA: "-1", VR_RECEITA: "100", DS_RECEITA: "ITEM C" },
  ])
  assert.equal(rows.length, 3)
  assert.ok(financiamentoReceitaDedupKey({ NR_RECIBO_DOACAO: "42", VR_RECEITA: "10" }, identity))
})

test("fingerprint é determinístico e não expõe campos privados", () => {
  const first = financiamentoReceitaSemanticFingerprint({ SQ_RECEITA: "1", VR_RECEITA: "10", NR_CPF_CNPJ_DOADOR: "privado", DT_GERACAO: "a" })
  const second = financiamentoReceitaSemanticFingerprint({ DT_GERACAO: "b", NR_CPF_CNPJ_DOADOR: "privado", VR_RECEITA: "10", SQ_RECEITA: "1" })
  assert.equal(first, second)
  assert.doesNotMatch(first, /privado/)
})
