import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MoneyTabSection } from "../src/components/MoneyTabSection"
import type { TransparenciaFamiliaPublico } from "../src/lib/types"

function renderTransparencia(transparencia: TransparenciaFamiliaPublico[]) {
  return renderToStaticMarkup(
    <MoneyTabSection
      patrimonio={[]}
      financiamento={[]}
      historico={[]}
      gastos={[]}
      transparencia={transparencia}
      gastosExecutivo={[]}
      historicoLength={0}
      suggestion={null}
    />,
  )
}

test("UI mostra data e escopo em consulta CGU positiva", () => {
  const html = renderTransparencia([{
    familia: "cartoes",
    resultado: "encontrado",
    volume: 1,
    paginas: 2,
    endpoint: "https://portaldatransparencia.gov.br/api-de-dados/cartoes",
    fonte: "Portal da Transparência",
    executado_em: "2026-09-15T12:00:00.000Z",
    cobertura: "dados_presentes_escopo_verificado",
    registros: [{ id: 1, data: "21/06/2024", data_fim: null, valor: 12.5, orgao: "Órgão", unidade: null, categoria: "Cartão", descricao: "Loja" }],
  }])
  assert.match(html, /1 registro\(s\); escopo consultado verificado/)
  assert.match(html, /Consulta realizada em/)
  assert.match(html, /páginas 1 a 2/)
  assert.match(html, /api-de-dados\/cartoes/)
})

test("UI mostra data e escopo em vazio CGU", () => {
  const html = renderTransparencia([{
    familia: "contratos",
    resultado: "vazio_confirmado",
    volume: 0,
    paginas: 1,
    endpoint: "https://portaldatransparencia.gov.br/api-de-dados/contratos/cpf-cnpj",
    fonte: "Portal da Transparência",
    executado_em: "2026-09-15T12:00:00.000Z",
    cobertura: "vazio_escopo_verificado",
    registros: [],
  }])
  assert.match(html, /Nenhum registro retornado neste escopo/)
  assert.match(html, /páginas 1 a 1/)
  assert.match(html, /contratos\/cpf-cnpj/)
})
