import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { gerar } from "../scripts/audit/gerar-trajetoria-resultados"

test("gerador de trajetória proíbe match por nome e exige fontes locais", () => {
  const source = readFileSync(
    join(import.meta.dirname, "..", "scripts", "audit", "gerar-trajetoria-resultados.ts"),
    "utf8",
  )
  assert.match(source, /SQ_CANDIDATO/)
  assert.match(source, /NR_CPF_CANDIDATO/)
  assert.match(source, /DS_SIT_TOT_TURNO/)
  assert.doesNotMatch(source, /NM_CANDIDATO/)
  assert.doesNotMatch(source, /createClient|SUPABASE|fetch\(/)
})

test("gerador preserva texto adicional e trata 2º turno como não final", () => {
  const source = readFileSync(
    join(import.meta.dirname, "..", "scripts", "audit", "gerar-trajetoria-resultados.ts"),
    "utf8",
  )
  assert.match(source, /Resultado da candidatura:/)
  assert.match(source, /item\.resultado !== "2º TURNO"/)
  assert.match(source, /pendente_sem_resultado_final/)
  assert.match(source, /DS_SIT_TOT_TURNO=\$\{item\.resultado/)
})

test("gerador resolve linha planejada sem id usando identidade estável da candidatura", async () => {
  const dir = mkdtempSync(join(tmpdir(), "puxa-ficha-trajetoria-"))
  const tseDir = join(dir, "tse")
  const anoDir = join(tseDir, "2010")
  mkdirSync(anoDir, { recursive: true })
  const historico = join(dir, "historico.json")
  const candidatos = join(dir, "candidatos.json")
  const plano = join(dir, "plano.json")
  const output = join(dir, "output.json")

  try {
    writeFileSync(historico, "[]\n")
    writeFileSync(candidatos, `${JSON.stringify([{ id: "c1", slug: "candidata", cpf: null }])}\n`)
    writeFileSync(plano, `${JSON.stringify({
      inserts: {
        historico_politico: [{
          candidato_id: "c1",
          tipo_evento: "candidatura",
          periodo_inicio: 2010,
          observacoes: "SQ_CANDIDATO=1234",
          cargo: "Presidente",
        }],
      },
    })}\n`)
    writeFileSync(
      join(anoDir, "consulta_cand_2010_BRASIL.csv"),
      "SQ_CANDIDATO;NR_CPF_CANDIDATO;DS_CARGO;NR_TURNO;DS_SIT_TOT_TURNO\n1234;;PRESIDENTE;1;NAO ELEITO\n",
    )

    const rows = await gerar([
      "--historico", historico,
      "--candidatos", candidatos,
      "--tse-dir", tseDir,
      "--output", output,
      "--plano-carga", plano,
      "--ciclo", "2026",
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, null)
    assert.equal(rows[0].candidato_id, "c1")
    assert.equal(rows[0].resultado_tse, "NÃO ELEITO")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
