import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

test("lote fechado de textos tem 188 alvos únicos e SQL operacional completo", () => {
  const file = "scripts/audit/dados-textos-julgamento-20260905.json"
  assert.ok(existsSync(file), "manifesto estático fechado ausente")
  const targets = JSON.parse(readFileSync(file, "utf8")) as Array<{ tabela: string; id: string; antes: string; depois: string }>
  assert.equal(targets.length, 188)
  assert.equal(new Set(targets.map(x => `${x.tabela}:${x.id}`)).size, 188)
  assert.equal(targets.filter(x => x.tabela === "candidatos").length, 63)
  assert.equal(targets.filter(x => x.tabela === "historico_politico").length, 125)
  assert.ok(targets.every(x => x.antes !== x.depois))
  for (const path of ["supabase/migrations/20260905150000_corrigir_textos_julgamento.sql", "supabase/rollback/20260905150000_corrigir_textos_julgamento.rollback.sql", "supabase/readback/20260905150000_corrigir_textos_julgamento.readback.sql", "supabase/readback/20260905150000_corrigir_textos_julgamento.rollback.readback.sql"]) {
    assert.ok(existsSync(path), path)
  }
})

test("manifesto, digest, UPDATEs literais e únicas transformações permanecem alinhados", () => {
  const targets = JSON.parse(readFileSync("scripts/audit/dados-textos-julgamento-20260905.json", "utf8")) as Array<{ tabela: string; id: string; slug: string; antes: string; depois: string }>
  const sql = readFileSync("supabase/migrations/20260905150000_corrigir_textos_julgamento.sql", "utf8")
  const raw = sql.match(/\$manifesto\$([\s\S]*?)\$manifesto\$/)?.[1]
  assert.equal(raw, JSON.stringify(targets))
  assert.equal(createHash("sha256").update(raw!).digest("hex"), "1209862f1302a68e22890aee146f86efae9ce8f707ad84775ed18d7d1dffc8ac")
  assert.equal((sql.match(/UPDATE public\.(?:candidatos|historico_politico) SET/g) ?? []).length, 188)
  assert.doesNotMatch(sql, /SET ultima_atualizacao|SET situacao_candidatura|SET publicavel/)
  assert.equal(targets.some(x => x.slug === "cadu-xavier" && x.tabela === "candidatos"), false)
  for (const target of targets) {
    const field = target.tabela === "candidatos" ? "biografia" : "observacoes"
    const quote = (s: string) => `'${s.replaceAll("'", "''")}'`
    assert.ok(sql.includes(`UPDATE public.${target.tabela} SET ${field}=${quote(target.depois)} WHERE id='${target.id}'::uuid AND ${field}=${quote(target.antes)};`))
    const expected = target.antes
      .replace(" e aguarda julgamento; registro pendente não equivale a candidatura deferida.", ".")
      .replace("O pedido de registro consta na base oficial de candidaturas do TSE e aguarda julgamento.", "O pedido de registro consta na base oficial de candidaturas do TSE.")
      .replace("Candidatura registrada no TSE 2026; situação: registrada, aguardando julgamento.", "Candidatura registrada no TSE 2026.")
      .replace("Candidatura: #NULO (TSE 2010)", "Candidatura: (TSE 2010)")
    assert.equal(target.depois, expected, target.id)
  }
})
