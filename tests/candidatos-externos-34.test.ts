import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

type Row = {
  ordem: number
  titular: string
  uf: string
  cargo: string
  partido_lista: string
  vice_lista: string
  desfecho: string
  origem_decisao?: string
  origem_coorte?: string
  vice_vigente?: string
  divergencia_chapa?: {
    vice_lista_original: string
    vice_vigente: string
  }
  fontes?: Array<{ url?: string }>
  evidencias?: Array<{ url?: string; trecho_exato?: string }>
}

const DIR = join(process.cwd(), "QA/evidencias/2026-08-13-candidatos-externos")
const derivacao = JSON.parse(readFileSync(join(DIR, "derivacao-206.json"), "utf8")) as {
  records: Array<{
    ordem: number
    base_category: string
    bucket: string
    perfil_slug_oficial?: string
  }>
}
const coorte = JSON.parse(readFileSync(join(DIR, "coorte-34.json"), "utf8")) as {
  records: Array<{
    ordem: number
    titular: string
    uf: string
    cargo: string
    partido_lista: string
    vice_lista: string
  }>
}
const ledger = JSON.parse(readFileSync(join(DIR, "desfechos-34.json"), "utf8")) as {
  metadata: { contagem_desfechos: Record<string, number> }
  records: Row[]
}

test("ledger dos 34 nomes fecha o denominador sem lacuna silenciosa", () => {
  assert.equal(derivacao.records.length, 206)
  assert.equal(
    derivacao.records.filter((row) => row.base_category === "base_unmatched").length,
    46,
  )
  assert.equal(
    derivacao.records.filter((row) => row.bucket === "novo_perfil_oficial_na_lista_11").length,
    11,
  )
  assert.equal(
    derivacao.records.filter((row) => row.bucket === "excluida_papel_de_vice").length,
    1,
  )
  assert.equal(
    derivacao.records.filter((row) => row.bucket === "coorte_residual_34").length,
    34,
  )
  assert.equal(coorte.records.length, 34)
  assert.equal(ledger.records.length, 34)
  assert.deepEqual(
    ledger.records.map((row) => row.ordem),
    coorte.records.map((row) => row.ordem),
  )
  const decisoesPorOrdem = new Map(ledger.records.map((row) => [row.ordem, row]))
  for (const row of coorte.records) {
    const decisao = decisoesPorOrdem.get(row.ordem)
    assert.ok(decisao)
    assert.deepEqual(
      {
        titular: decisao.titular,
        uf: decisao.uf,
        cargo: decisao.cargo,
        partido_lista: decisao.partido_lista,
        vice_lista: decisao.vice_lista,
      },
      {
        titular: row.titular,
        uf: row.uf,
        cargo: row.cargo,
        partido_lista: row.partido_lista,
        vice_lista: row.vice_lista,
      },
    )
  }
  assert.deepEqual(
    derivacao.records
      .filter((row) => row.bucket === "coorte_residual_34")
      .map((row) => row.ordem),
    coorte.records.map((row) => row.ordem),
  )
  assert.deepEqual(ledger.metadata.contagem_desfechos, {
    confirmado_fora_snapshot: 30,
    quarentena_identidade: 2,
    resolvido_no_snapshot: 2,
  })

  const snapshot = JSON.parse(
    readFileSync(join(process.cwd(), "data/chapas-2026-tse-20260812.json"), "utf8"),
  ) as {
    chapas: Array<{
      titular: { perfil_slug: string | null; vinculo_perfil_status: string }
    }>
  }
  const oficiaisNovos = snapshot.chapas
    .filter((chapa) => chapa.titular.vinculo_perfil_status === "novo_perfil_oficial")
    .map((chapa) => chapa.titular.perfil_slug)
    .filter((slug): slug is string => Boolean(slug))
    .sort()
  const oficiaisNovosNaLista = derivacao.records
    .filter((row) => row.bucket === "novo_perfil_oficial_na_lista_11")
    .map((row) => row.perfil_slug_oficial)
    .filter((slug): slug is string => Boolean(slug))
    .sort()
  assert.deepEqual(oficiaisNovosNaLista, oficiaisNovos.filter((slug) => slug !== "pedro-brito"))
})

test("toda conclusão nominal tem fonte e trecho literal ligados", () => {
  for (const row of ledger.records) {
    assert.equal(
      row.origem_coorte,
      "lista_independente_12_08_cruzada_com_base_e_snapshot",
    )
    const urls = new Set((row.fontes ?? []).map((fonte) => fonte.url))
    assert.ok(urls.size > 0, `${row.ordem} ${row.titular}: sem fonte`)
    assert.ok((row.evidencias ?? []).length > 0, `${row.ordem} ${row.titular}: sem evidência`)
    for (const evidence of row.evidencias ?? []) {
      assert.ok(urls.has(evidence.url), `${row.ordem}: evidência aponta para fonte ausente`)
      assert.ok(evidence.trecho_exato?.trim(), `${row.ordem}: trecho literal vazio`)
    }
  }
})

test("snapshot oficial só sobrepõe pesquisa com decisão explicitamente marcada", () => {
  const oficiais = ledger.records.filter((row) => row.desfecho === "resolvido_no_snapshot")
  assert.deepEqual(
    oficiais.map((row) => row.ordem),
    [59, 120],
  )
  assert.ok(
    oficiais.every((row) => row.origem_decisao === "snapshot_tse_e_chave_independente"),
  )

  const cadu = ledger.records.find((row) => row.ordem === 156)
  assert.ok(cadu)
  assert.equal(cadu.desfecho, "quarentena_identidade")
  assert.equal(cadu.origem_decisao, "snapshot_tse_e_chave_independente")

  const huggo = ledger.records.find((row) => row.ordem === 45)
  assert.ok(huggo)
  assert.equal(huggo.desfecho, "quarentena_identidade")
  assert.equal(huggo.origem_decisao, "snapshot_tse_e_chave_independente")

  const roscoe = ledger.records.find((row) => row.ordem === 82)
  assert.ok(roscoe)
  assert.equal(roscoe.vice_vigente, "Ellen Miziara")
  assert.equal(
    roscoe.divergencia_chapa?.vice_lista_original,
    "Charlles Thomacelli Evangelista",
  )

  const oficiaisText = readFileSync(join(DIR, "registros-oficiais-5.json"), "utf8")
  assert.doesNotMatch(oficiaisText, /NR_CPF_CANDIDATO|"CPF"/)
  const oficiaisJson = JSON.parse(oficiaisText) as {
    records: Array<{ SQ_CANDIDATO: string }>
  }
  assert.deepEqual(
    oficiaisJson.records.map((row) => row.SQ_CANDIDATO).sort(),
    ["170002541258", "200002534001", "270002546368", "60002540417", "70002535930"],
  )
})
