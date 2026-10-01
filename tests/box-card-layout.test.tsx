import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { buildBoxCard, buildBoxCardJsx, planBoxCardLayout } from "@/lib/box-card"
import type { BoxCardModel } from "@/lib/box-card-model"

const longCandidateNames = ["Ana Maria da Conceição Nogueira", "Benedito Augusto de Souza Filho", "Carolina de Oliveira Menezes", "Daniel dos Santos Albuquerque"]
const originalUrls = Array.from({ length: 6 }, (_, index) =>
  `https://dados${index + 1}.example.gov.br/consultas/publicas/eleicoes/2026/candidatos/declaracoes/registro/${"detalhe-".repeat(18)}${index + 1}.html`,
)

const stressFixture: BoxCardModel = {
  kind: "comparador",
  title: "Comparação de patrimônio público por candidaturas selecionadas",
  key: "fixture-alfa~fixture-beta~fixture-gama~fixture-delta",
  identity: longCandidateNames.join(" × "),
  rows: Array.from({ length: 12 }, (_, index) => ({
    label: `Categoria de despesa pública com nome comprido ${String(index + 1).padStart(2, "0")} e contexto complementar`,
    value: "R$ 1.250.000,00 (valor declarado na fonte oficial)",
    detail: `Detalhamento complementar da linha ${index + 1}: ${"texto contextual longo sem corte. ".repeat(4)}`,
  })),
  warnings: [
    `A cobertura deste recorte é parcial e pode deixar registros de fora; confira a documentação da fonte antes de interpretar os valores. ${"O aviso deve permanecer inteiro. ".repeat(2)}`,
    `Alguns registros podem estar ausentes porque a fonte ainda está atualizando o conjunto consultado. ${"A informação não pode sumir do card. ".repeat(2)}`,
  ],
  sources: originalUrls.map((url, index) => ({
    label: `Fonte oficial de dados eleitorais da candidatura ${index + 1}`,
    url,
    collectedAt: "2026-09-30T18:25:00.000Z",
  })),
  deepLink: "/comparar?c1=fixture-alfa&c2=fixture-beta&c3=fixture-gama&c4=fixture-delta&eixo=patrimonio#box-comparador",
  revision: "stress-fixture-v1",
}

function pngDimensions(data: Uint8Array): { width: number; height: number } {
  assert.equal(Buffer.from(data.slice(0, 8)).toString("hex"), "89504e470d0a1a0a")
  return {
    width: new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(16),
    height: new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(20),
  }
}

test("long names, rows, sources, URLs, and coverage warnings fit without dropping warnings or reordering rows", async () => {
  const artifactDir = resolve(process.cwd(), "output/box-sharing/png")
  await mkdir(artifactDir, { recursive: true })

  for (const format of ["feed", "story"] as const) {
    const plan = planBoxCardLayout(stressFixture, format)
    assert.ok(plan.estimatedHeight <= plan.availableHeight, `${format}: ${plan.estimatedHeight} > ${plan.availableHeight}`)
    assert.ok(plan.rows.length > 0)
    assert.ok(plan.hiddenRows > 0)
    assert.ok(plan.sources.length > 0)
    assert.ok(plan.hiddenSources > 0)
    assert.deepEqual(plan.rows, stressFixture.rows.slice(0, plan.rows.length))
    assert.deepEqual(plan.sources, stressFixture.sources.slice(0, plan.sources.length))

    const markup = renderToStaticMarkup(buildBoxCardJsx(stressFixture, format))
    assert.ok(markup.includes(stressFixture.identity))
    for (const warning of stressFixture.warnings) assert.ok(markup.includes(warning))
    assert.ok(markup.includes(`+${plan.hiddenRows} itens no site`))
    assert.ok(markup.includes(`+${plan.hiddenSources} fontes no site`))
    // A URL pode quebrar em qualquer separador, mas precisa sair inteira e na ordem.
    const text = markup.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&")
    for (const source of plan.sources) assert.ok(text.includes(source.url), source.url)
    for (const [index] of stressFixture.sources.slice(plan.sources.length).entries()) {
      const hiddenIndex = plan.sources.length + index + 1
      assert.ok(!markup.includes(`${hiddenIndex}.html`))
    }

    const response = await buildBoxCard(stressFixture, format)
    const bytes = new Uint8Array(await response.arrayBuffer())
    assert.deepEqual(pngDimensions(bytes), format === "feed" ? { width: 1080, height: 1350 } : { width: 1080, height: 1920 })
    await writeFile(resolve(artifactDir, `stress-${format}.png`), bytes)
  }
})

test("missing source footer states the provenance gap and keeps the candidate page backlink", () => {
  const withoutSources: BoxCardModel = {
    ...stressFixture,
    kind: "cargos-mandatos",
    title: "Cargos e mandatos",
    key: "ana-silva",
    identity: "Ana Silva",
    rows: [{ label: "Mandato", value: "Deputada Federal" }],
    warnings: [],
    sources: [],
    deepLink: "/candidato/ana-silva?tab=trajetoria#box-cargos-mandatos",
    revision: "missing-source-fixture-v1",
  }

  for (const format of ["feed", "story"] as const) {
    const plan = planBoxCardLayout(withoutSources, format)
    const markup = renderToStaticMarkup(buildBoxCardJsx(withoutSources, format))
    const visibleText = markup.replace(/<[^>]*>/g, "").replaceAll("&amp;", "&")
    assert.ok(plan.estimatedHeight <= plan.availableHeight)
    assert.ok(markup.includes("Fonte original e data de coleta não informadas na base."))
    assert.ok(visibleText.includes("puxaficha.com.br/candidato/ana-silva?tab=trajetoria#box-cargos-mandatos"))
  }
})

test("card de box identifica o candidato: foto, nome e partido no topo; iniciais sem foto", () => {
  const withSubject = {
    ...stressFixture,
    kind: "evolucao-patrimonial-resumo" as const,
    subjects: [{ name: "Candidata Exemplo", meta: "PX · Deputado Federal · SP", photoUrl: "/candidates/x.jpg" }],
    notes: ["Dado mais recente disponível: eleição de 2026."],
  }
  for (const format of ["feed", "story"] as const) {
    const plan = planBoxCardLayout(withSubject, format)
    assert.equal(planBoxCardLayout({ ...withSubject, rows: withSubject.rows.slice(0, 2), warnings: [], sources: withSubject.sources.slice(0, 1) }, format).compact, false)
    assert.ok(plan.estimatedHeight <= plan.availableHeight, `${format}: ${plan.estimatedHeight} > ${plan.availableHeight}`)
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    const withPhoto = renderToStaticMarkup(buildBoxCardJsx(withSubject, format, [photo]))
    assert.ok(withPhoto.includes("Candidata Exemplo"))
    assert.ok(withPhoto.includes("PX · Deputado Federal · SP"))
    assert.ok(withPhoto.includes(photo))
    // Conteúdo extremo cai no modo compacto: a nota neutra sai, os alertas nunca.
    assert.equal(withPhoto.includes("Dado mais recente disponível: eleição de 2026."), !plan.compact)
    for (const warning of withSubject.warnings) assert.ok(withPhoto.includes(warning))
    const withoutPhoto = renderToStaticMarkup(buildBoxCardJsx(withSubject, format, [null]))
    assert.ok(withoutPhoto.includes(">CE<"))
  }
})
