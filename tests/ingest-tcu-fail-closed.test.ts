import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const source = readFileSync(join(process.cwd(), "scripts", "lib", "ingest-tcu.ts"), "utf8")

describe("ingest TCU fail-closed", () => {
  it("usa o endpoint publico atual do CADIRREG via POST", () => {
    assert.match(
      source,
      /https:\/\/certidoes\.apps\.tcu\.gov\.br\/api\/publico\/responsaveis-contas-irregulares/,
    )
    assert.match(source, /method: "POST"/)
    assert.match(source, /body: JSON\.stringify\(\{ cpf \}\)/)
  })

  it("nao converte falha de fonte em lista vazia nem atualiza flags", () => {
    assert.match(source, /Promise<TCUInabilitado\[\] \| null>/)
    assert.match(source, /Promise<TCUCadirreg\[\] \| null>/)
    assert.match(source, /if \(!res\.ok\) return null/g)
    assert.match(source, /if \(!Array\.isArray\(data\)\) return null/g)
    assert.match(source, /if \(inabilitados === null \|\| cadirreg === null\)/)
    assert.match(source, /flags nao atualizadas/)
    assert.match(source, /results\.push\(result\)\s+continue/)
  })

  it("anexa link oficial do processo e nao contabiliza ponto recusado", () => {
    assert.match(source, /fontes: FonteTCU\[\]/)
    assert.match(source, /motivoRecusaDeFonte\(row\.gravidade, row\.fontes\)/)
    assert.match(source, /linkAcompanhamentoProcesso/)
    assert.match(source, /if \(gravado\)/)
    assert.match(source, /sem link publico de processo do TCU/)
  })
})
