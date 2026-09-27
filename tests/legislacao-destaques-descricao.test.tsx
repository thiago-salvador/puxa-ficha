import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { LegislationTabSection } from "../src/components/CandidatoProfileSections"
import { descricaoDestaquesParlamentares } from "../src/lib/legislacao-profile-groups"
import type { ProjetoLei } from "../src/lib/types"

function projeto(i: number, destaque = false): ProjetoLei {
  return {
    id: `pl-${i}`,
    candidato_id: "cand-1",
    tipo: "PL",
    numero: String(2200 + i),
    ano: 2026,
    ementa: `Institui a Política Nacional de segurança viária e saúde pública ${i}, e dá outras providências.`,
    tema: null,
    situacao: null,
    url_inteiro_teor: null,
    destaque,
    destaque_motivo: destaque ? "Relevância para a política de trânsito." : null,
    fonte: "Camara",
  }
}

function renderLegislacao(projetosLei: ProjetoLei[]): string {
  return renderToStaticMarkup(
    <LegislationTabSection
      projetosLei={projetosLei}
      legislacaoMandatoExecutivo={[]}
      votos={[]}
      cargoDisputado="Senador"
      hasLegislativeHistory
      suggestion={null}
    />,
  )
}

describe("descricaoDestaquesParlamentares", () => {
  it("lista sem item curado se apresenta como seleção automática", () => {
    const texto = descricaoDestaquesParlamentares([{ destaque: false }, { destaque: null }, {}])
    assert.match(texto, /^Seleção automática/)
    assert.match(texto, /Nenhum item desta lista passou por curadoria/)
    assert.doesNotMatch(texto, /destaques editoriais quando existirem/)
  })

  it("lista com item curado diz quantos são e que o resto é automático", () => {
    assert.match(descricaoDestaquesParlamentares([{ destaque: true }, { destaque: false }]), /^Seleção mista: 1 item marcado como destaque editorial aparece primeiro/)
    assert.match(descricaoDestaquesParlamentares([{ destaque: true }, { destaque: true }, {}]), /^Seleção mista: 2 itens marcados como destaque editorial aparecem primeiro/)
  })
})

// A sub-aba Destaques só existe com 100 itens ou mais no acervo
// (LEGISLATION_HIGHLIGHT_MINIMUM); por isso o fixture tem 110.
describe("aba Legislação, sub-aba Destaques", () => {
  it("sem projeto curado, a lista em destaque se declara seleção automática", () => {
    const html = renderLegislacao(Array.from({ length: 110 }, (_, i) => projeto(i)))
    assert.match(html, /data-pf-legislation-content="destaques"/)
    assert.match(html, /Seleção automática por sinais de política pública na ementa/)
    assert.doesNotMatch(html, /destaques editoriais quando existirem/)
  })

  it("com projeto curado, a lista diz que é mista", () => {
    const html = renderLegislacao([projeto(0, true), ...Array.from({ length: 109 }, (_, i) => projeto(i + 1))])
    assert.match(html, /Seleção mista: 1 item marcado como destaque editorial/)
  })
})
