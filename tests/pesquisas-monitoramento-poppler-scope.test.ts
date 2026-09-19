import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

/**
 * O workflow instala `poppler-utils` sob condicao, por UF, e o roteamento real
 * dos PDFs mora em `extrairDocumentoRealTime`. Em 17/09/2026 RS e MS ganharam
 * caminho de PDF sem que a condicao fosse atualizada, e o RS reprovou com
 * "spawnSync pdftotext ENOENT" no run 35447213619 do monitor. As duas listas
 * sao escritas em arquivos diferentes, entao so um teste as mantem casadas.
 */
test("a condicao de poppler-utils cobre toda UF com caminho de PDF", () => {
  const roteador = readFileSync("scripts/lib/pesquisas-monitoramento-realtime-pdf.ts", "utf8")
  const workflow = readFileSync(".github/workflows/pesquisas-monitoramento.yml", "utf8")

  const ufsNoCodigo = [...roteador.matchAll(/registrationId === "([A-Z]{2})-\d{5}\/2026"/g)].map((match) => match[1])
  assert.ok(ufsNoCodigo.length > 0, "nenhum registro de PDF encontrado no roteador; o teste ficaria cego")

  const passo = workflow.split("Preparar leitura dos relatórios públicos em PDF")[2] ?? ""
  const condicao = passo.split("\n").find((linha) => linha.trim().startsWith("if:")) ?? ""
  assert.ok(condicao.includes("real-time-big-data-estaduais-2026"), "passo de PDF do job de coleta nao encontrado")

  const ausentes = [...new Set(ufsNoCodigo)].filter((uf) => !condicao.includes(`matrix.target.uf == '${uf}'`))
  assert.deepEqual(
    ausentes,
    [],
    `UF com caminho de PDF fora da condicao de poppler-utils: ${ausentes.join(", ")}. ` +
      "Sem poppler o adaptador falha com spawnSync pdftotext ENOENT e a pesquisa vira extraction_incomplete.",
  )
})
