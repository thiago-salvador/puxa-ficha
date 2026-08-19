import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8")
}

const SUPERFICIES_PUBLICAS = [
  "src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx",
  "src/app/(site)/preview/candidato/[slug]/page.tsx",
  "src/components/CandidatoCard.tsx",
  "src/components/ComparadorPanel.tsx",
  "src/components/EmbedWidget.tsx",
] as const

describe("formação pública nas superfícies do site", () => {
  it("só imprime formação via formacaoPublicaDe, nunca grau ou instituição crus", () => {
    for (const rel of SUPERFICIES_PUBLICAS) {
      const src = readSource(rel)
      assert.match(src, /formacaoPublicaDe/, `${rel} precisa passar por formacaoPublicaDe`)
      assert.doesNotMatch(
        src,
        /\{ficha\.formacao\}/,
        `${rel} não pode interpolar ficha.formacao cru`,
      )
      assert.doesNotMatch(
        src,
        /\{candidato\.formacao\}/,
        `${rel} não pode interpolar candidato.formacao cru`,
      )
      assert.doesNotMatch(
        src,
        /\{ficha\.formacao_instituicao\}/,
        `${rel} não pode interpolar ficha.formacao_instituicao crua`,
      )
      assert.doesNotMatch(
        src,
        /\{candidato\.formacao_instituicao\}/,
        `${rel} não pode interpolar candidato.formacao_instituicao crua`,
      )
    }
  })
})
