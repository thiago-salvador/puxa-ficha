import assert from "node:assert/strict"
import test from "node:test"
import {
  buildAlertDigestEmail,
  buildAlertManageAccessEmail,
  buildAlertVerificationEmail,
} from "@/lib/alerts-shared"

/**
 * Item 18 da triagem pré-lançamento: o digest saía como parágrafo empilhado,
 * sem hierarquia e sem tratamento de modo escuro. Estes testes guardam o
 * contrato do template, não a estética: documento completo, esquema de cor
 * declarado, prévia da caixa de entrada, cartão por ficha e escape.
 */

const MANAGE = "https://puxaficha.com.br/alertas/acesso?manage=t"
const UNSUB = "https://puxaficha.com.br/alertas/acesso?manage=t&hash=cancelar-tudo"
const DELETE = "https://puxaficha.com.br/alertas/acesso?manage=t&hash=deletar-dados"
const VERIFY = "https://puxaficha.com.br/alertas/acesso?verify=v&manage=t"

function digest(items = 1) {
  return buildAlertDigestEmail({
    items: Array.from({ length: items }, (_, i) => ({
      candidateName: `Candidato ${i + 1}`,
      candidateMeta: "PSB · Governadora",
      changes: [{ title: "Nova notícia publicada", description: "G1" }],
    })),
    manageUrl: MANAGE,
    unsubscribeUrl: UNSUB,
  })
}

const TODOS = () => [
  digest(2).html,
  buildAlertVerificationEmail({
    candidateName: "Candidata Teste",
    verifyUrl: VERIFY,
    manageUrl: MANAGE,
    deleteDataUrl: DELETE,
  }).html,
  buildAlertManageAccessEmail({
    candidateName: "Candidata Teste",
    manageUrl: MANAGE,
    deleteDataUrl: DELETE,
  }).html,
]

test("os três emails entregam documento HTML completo, não fragmento de div", () => {
  for (const html of TODOS()) {
    assert.ok(html.startsWith("<!doctype html>"), "cliente de email precisa do documento inteiro")
    assert.match(html, /<html lang="pt-BR">/)
    assert.match(html, /<\/html>$/)
  }
})

test("os três emails declaram esquema de cor e trazem regra de modo escuro", () => {
  for (const html of TODOS()) {
    assert.match(html, /<meta name="color-scheme" content="light dark" \/>/)
    assert.match(html, /<meta name="supported-color-schemes" content="light dark" \/>/)
    assert.match(
      html,
      /@media \(prefers-color-scheme: dark\)/,
      "sem a media query, Apple Mail e Outlook do macOS ficam com o desenho claro",
    )
    assert.match(html, /\.pf-canvas \{ background-color: #0a0a0a !important; \}/)
  }
})

test("toda superfície declara cor de fundo e cor de texto", () => {
  // A inversão automática do Gmail escuro quebra justamente onde falta
  // declaração explícita, então nenhum bloco pode depender de herança.
  for (const html of TODOS()) {
    const superficies = html.match(/class="pf-surface[^"]*"/g) ?? []
    assert.ok(superficies.length >= 2, "cabeçalho, corpo e rodapé são superfícies declaradas")
    assert.ok(html.includes('bgcolor="#ffffff"'), "fundo claro explícito")
    assert.ok(html.includes("color:#0a0a0a"), "texto escuro explícito")
  }
})

test("os três emails trazem a prévia da caixa de entrada oculta no corpo", () => {
  for (const html of TODOS()) {
    assert.match(html, /<div style="display:none;max-height:0;overflow:hidden/)
  }
})

test("o CTA põe o padding no td, não no anchor", () => {
  // Contrato do Outlook do Windows, que renderiza via Word: padding em
  // elemento inline é ignorado, e mesmo com display:block o anchor não forma a
  // caixa clicável. Quem abre a área é a célula.
  for (const html of [
    buildAlertVerificationEmail({
      candidateName: "Candidata Teste",
      verifyUrl: VERIFY,
      manageUrl: MANAGE,
      deleteDataUrl: DELETE,
    }).html,
    buildAlertManageAccessEmail({
      candidateName: "Candidata Teste",
      manageUrl: MANAGE,
      deleteDataUrl: DELETE,
    }).html,
  ]) {
    const celula = html.match(/<td class="pf-invert"[^>]*style="([^"]*)"[^>]*>\s*<a [^>]*style="([^"]*)"/)
    assert.ok(celula, "o botão continua sendo td com anchor dentro")

    const [, estiloDaCelula, estiloDoAnchor] = celula
    assert.match(estiloDaCelula, /padding:14px 26px/, "a área clicável nasce do padding do td")
    assert.ok(
      !/padding/.test(estiloDoAnchor),
      "padding no anchor é exatamente o que o Word ignora",
    )
    assert.ok(
      !/display:(inline-)?block/.test(estiloDoAnchor),
      "display no anchor não substitui a caixa da célula",
    )
  }
})

test("digest vira um cartão por ficha, com heading e lista semânticos", () => {
  const html = digest(3).html

  const cartoes = html.match(/class="pf-card"/g) ?? []
  assert.equal(cartoes.length, 3, "um cartão por ficha acompanhada")
  assert.match(html, /PSB · Governadora/, "rótulo de partido e cargo continua publicado")

  // O defeito do item 18 era ausência de hierarquia, não a lista em si: a
  // estrutura de documento tem que sobreviver ao modo de leitura e ao leitor
  // de tela, não só ao olho.
  assert.equal((html.match(/<h1 /g) ?? []).length, 1, "um h1 por email")
  assert.equal((html.match(/<h2 /g) ?? []).length, 3, "nome de cada ficha é h2 sob o h1")
  assert.equal((html.match(/<ul /g) ?? []).length, 3, "uma lista de mudanças por ficha")
  assert.equal((html.match(/<li /g) ?? []).length, 3, "uma mudança por ficha nesta amostra")
  assert.ok(
    html.indexOf("<h1 ") < html.indexOf("<h2 "),
    "h2 não pode aparecer antes do h1 do documento",
  )
})

test("o último item da lista não deixa folga sobrando dentro do cartão", () => {
  const html = buildAlertDigestEmail({
    items: [
      {
        candidateName: "Candidata Teste",
        candidateMeta: "UP · Presidente",
        changes: [
          { title: "Primeira", description: null },
          { title: "Segunda", description: null },
        ],
      },
    ],
    manageUrl: MANAGE,
    unsubscribeUrl: UNSUB,
  }).html

  assert.equal((html.match(/margin:0 0 12px;padding-left:4px/g) ?? []).length, 1)
  assert.equal((html.match(/margin:0 0 0px;padding-left:4px/g) ?? []).length, 1)
})

test("digest resume o volume antes de listar, no singular e no plural", () => {
  assert.match(digest(1).html, /1 atualização na ficha que você acompanha\./)
  assert.match(digest(3).html, /3 atualizações em 3 fichas que você acompanha\./)
})

test("digest sem descrição não imprime linha vazia", () => {
  const html = buildAlertDigestEmail({
    items: [
      {
        candidateName: "Candidata Teste",
        candidateMeta: "UP · Presidente",
        changes: [{ title: "Patrimônio atualizado", description: null }],
      },
    ],
    manageUrl: MANAGE,
    unsubscribeUrl: UNSUB,
  }).html

  assert.match(html, /Patrimônio atualizado/)
  assert.equal(
    (html.match(/font-size:14px;line-height:21px/g) ?? []).length,
    0,
    "o bloco de descrição só existe quando há descrição",
  )
})

test("conteúdo vindo do banco continua escapado no novo template", () => {
  const html = buildAlertDigestEmail({
    items: [
      {
        candidateName: '<script>alert("x")</script>',
        candidateMeta: "PT & PCdoB",
        changes: [{ title: "<img src=x onerror=1>", description: "aspas \" e '" }],
      },
    ],
    manageUrl: MANAGE,
    unsubscribeUrl: UNSUB,
  }).html

  assert.ok(!html.includes("<script>"), "nome de candidato não pode injetar tag")
  assert.ok(!html.includes("<img src=x"), "título de mudança não pode injetar tag")
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /PT &amp; PCdoB/)
})

test("os links de gestão e de cancelamento sobrevivem ao novo rodapé", () => {
  const html = digest(1).html

  assert.ok(html.includes(`href="${MANAGE}"`) || html.includes(MANAGE.replaceAll("&", "&amp;")))
  assert.ok(html.includes(UNSUB.replaceAll("&", "&amp;")), "cancelamento é exigência de CAN-SPAM/LGPD")
  assert.match(html, /Cancelar todos os alertas/)
})

test("a versão em texto puro segue intacta para clientes sem HTML", () => {
  const { text } = digest(2)

  assert.match(text, /Gerenciar alertas: /)
  assert.match(text, /Cancelar todos os alertas: /)
  assert.match(text, /Candidato 1: PSB · Governadora/)
})
