/**
 * Regras de substância de fonte (src/lib/fonte-substancia.ts).
 *
 * O que estes testes protegem: o veredito daqui decide se uma URL que responde
 * HTTP 200 conta como prova. Errar para o lado permissivo devolve o buraco da
 * etapa 5B (claim de gravidade alta sustentada por 46 caracteres de casca de
 * SPA). Errar para o lado agressivo faz o link-check gritar por fonte legítima
 * que está fora do ar por vedação eleitoral ou bloqueio de robô.
 *
 * Os corpos usados aqui são recortes do que foi realmente baixado em
 * 2026-07-25, não invenção: o aviso da Agência Minas, o desafio anti-robô do
 * F5 no portal do TSE e a casca do DivulgaCandContas.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  analisarSubstancia,
  BYTES_MINIMO_BINARIO,
  corpoDeErroIndicaBloqueio,
  DOMINIOS_VERIFICACAO_MANUAL,
  dominioExigeVerificacaoManual,
  ehTipoNaoHtml,
  extrairTextoNoscript,
  extrairTextoUtil,
  LIMITE_PAGINA_DE_DESAFIO,
  pareceCorpoDeErro,
  pareceDesafioAntiRobo,
  pareceVedacaoEleitoral,
  TEXTO_MINIMO_UTIL,
} from "../src/lib/fonte-substancia"

/** Corpo HTML cujo texto útil tem exatamente `n` caracteres. */
function paginaCom(n: number, frase = ""): string {
  let texto = frase ? `${frase} ` : ""
  while (texto.length < n) texto += "palavra do corpo "
  texto = texto.slice(0, n)
  // O último caractere não pode ser espaço: extrairTextoUtil apara as bordas.
  if (texto.endsWith(" ")) texto = `${texto.slice(0, -1)}x`
  // Sem <title>: o conteúdo da tag também é texto e desregularia a contagem.
  return `<html><head><style>.x{color:red}</style></head><body><p>${texto}</p><script>var a=1</script></body></html>`
}

function html(entrada: Partial<Parameters<typeof analisarSubstancia>[0]> & { corpo: string }) {
  return analisarSubstancia({
    httpStatus: 200,
    contentType: "text/html; charset=utf-8",
    bytes: Buffer.byteLength(entrada.corpo),
    ...entrada,
  })
}

describe("extrairTextoUtil", () => {
  it("descarta script, style, comentário e tags", () => {
    const corpo =
      "<html><head><style>a{b:c}</style><script>var x = '<p>fantasma</p>'</script></head>" +
      "<body><!-- oculto --><h1>Titulo</h1><p>Corpo da&nbsp;materia.</p></body></html>"
    assert.equal(extrairTextoUtil(corpo), "Titulo Corpo da materia.")
  })

  it("colapsa espaço e apara as bordas", () => {
    assert.equal(extrairTextoUtil("  <p>  a   \n  b  </p> "), "a b")
  })

  it("descarta bloco cuja tag de fechamento tem espaço antes do >", () => {
    // `</script >` é fechamento válido em HTML. Se a regex não tolerar o espaço,
    // o corpo do script vira texto útil e uma página vazia passa no piso de
    // substância, que é justamente o que o gate precisa barrar.
    const corpo =
      "<html><head><script>var x = 'a'.repeat(9000)</script ><style>a{b:c}</style >" +
      "<noscript>ative o javascript</noscript ></head><body><h1>Titulo</h1></body></html>"
    assert.equal(extrairTextoUtil(corpo), "Titulo")
  })

  it("descarta bloco cuja tag de fechamento traz lixo depois do nome", () => {
    // O parser de HTML ignora o que vem depois do nome numa end tag, então
    // `</script foo="bar">` e `</script\t\n x>` fecham o bloco do mesmo jeito.
    const corpo =
      '<html><head><script>conteudo que nao deve contar</script foo="bar">' +
      "<style>a{b:c}</style\t\n x></head><body><h1>Titulo</h1></body></html>"
    assert.equal(extrairTextoUtil(corpo), "Titulo")
  })
})

describe("extrairTextoNoscript", () => {
  it("preserva a mensagem de bloqueio sem transformar noscript em conteúdo", () => {
    const corpo =
      "<html><body><noscript><h1>JavaScript is disabled</h1>" +
      "In order to continue, we need to verify that you're not a robot.</noscript></body></html>"
    assert.equal(extrairTextoUtil(corpo), "")
    assert.equal(
      extrairTextoNoscript(corpo),
      "JavaScript is disabled In order to continue, we need to verify that you're not a robot.",
    )
  })
})

describe("pareceVedacaoEleitoral", () => {
  it("reconhece o aviso da Agência Minas mesmo com acento", () => {
    assert.equal(
      pareceVedacaoEleitoral(
        "Comunicado Em cumprimento à legislação eleitoral, este site encontra-se com as " +
          "funcionalidades desativadas, sendo restabelecidas após o término do período de vedação.",
      ),
      true,
    )
  })

  it("reconhece a variação de redação da EBC", () => {
    assert.equal(
      pareceVedacaoEleitoral("Em respeito à legislação eleitoral vigente, esta página está desativada temporariamente"),
      true,
    )
  })

  it("não confunde matéria que fala de eleição com página bloqueada", () => {
    assert.equal(
      pareceVedacaoEleitoral(
        "O TSE confirmou o indeferimento do registro de candidatura, decisão publicada durante o período eleitoral.",
      ),
      false,
    )
  })
})

describe("pareceDesafioAntiRobo", () => {
  it("reconhece o desafio do F5 que o portal do TSE serviu", () => {
    assert.equal(
      pareceDesafioAntiRobo(
        "Esta pergunta é para testar se você é um visitante humano e evitar a submissão " +
          "automatizada de robôs. Qual código aparece na imagem? Seu Support ID: 13552133409858234177.",
      ),
      true,
    )
  })

  it("reconhece as telas em inglês dos CDNs", () => {
    assert.equal(pareceDesafioAntiRobo("Just a moment... Checking your browser"), true)
    assert.equal(pareceDesafioAntiRobo("Attention Required! | Cloudflare"), true)
  })

  it("não dispara em texto comum", () => {
    assert.equal(pareceDesafioAntiRobo("A Primeira Turma recebeu a denúncia por unanimidade."), false)
  })
})

describe("ehTipoNaoHtml", () => {
  it("reconhece os tipos que não devem passar por strip de tags", () => {
    for (const tipo of ["application/pdf", "application/zip", "application/json; charset=utf-8", "text/csv"]) {
      assert.equal(ehTipoNaoHtml(tipo), true, tipo)
    }
  })

  it("HTML e nulo passam pelo caminho de texto", () => {
    assert.equal(ehTipoNaoHtml("text/html; charset=utf-8"), false)
    assert.equal(ehTipoNaoHtml(null), false)
  })
})

describe("dominioExigeVerificacaoManual", () => {
  it("a lista fica explícita: mudar o conjunto muda quem nunca é despublicado sozinho", () => {
    assert.deepEqual([...DOMINIOS_VERIFICACAO_MANUAL], ["noticias.stf.jus.br"])
  })

  it("cobre noticias.stf.jus.br e subdomínio", () => {
    assert.equal(dominioExigeVerificacaoManual("https://noticias.stf.jus.br/postsnoticias/x/"), true)
    assert.equal(dominioExigeVerificacaoManual("https://cache.noticias.stf.jus.br/a/b"), true)
  })

  it("não vale para o resto do STF nem para lixo", () => {
    assert.equal(dominioExigeVerificacaoManual("https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?x=1"), false)
    assert.equal(dominioExigeVerificacaoManual("nao e url"), false)
    assert.equal(dominioExigeVerificacaoManual(null), false)
  })
})

describe("analisarSubstancia", () => {
  it("corpo vazio com 2xx é indisponível, nunca morto nem vivo", () => {
    // Comportamento medido em noticias.stf.jus.br: 202 com zero byte.
    const r = analisarSubstancia({ httpStatus: 202, contentType: "text/html", corpo: "", bytes: 0 })
    assert.equal(r.veredito, "indisponivel")
    assert.match(r.motivo, /corpo vazio/)
  })

  it("casca de SPA que responde 200 é sem substância", () => {
    const r = html({ corpo: "<html><body><app-root>Divulgação de Candidaturas e Contas Eleitorais</app-root></body></html>" })
    assert.equal(r.veredito, "sem_substancia")
    assert.ok(r.caracteresUteis < TEXTO_MINIMO_UTIL)
  })

  it("página de vedação eleitoral longa é indisponível, não sem substância", () => {
    // A do goias.gov.br tem 2601 caracteres de navegação: passa no tamanho e
    // só é pega pelo marcador. Sem isso o link-check chamaria de saudável.
    const corpo =
      "<html><body><h1>COMUNICADO</h1><p>Em cumprimento à legislação eleitoral, este site " +
      "encontra-se com as funcionalidades desativadas.</p><p>" +
      "menu ".repeat(300) +
      "</p></body></html>"
    const r = html({ corpo })
    assert.equal(r.veredito, "indisponivel")
    assert.match(r.motivo, /legislacao eleitoral/)
  })

  it("desafio anti-robô é indisponível", () => {
    const r = html({
      corpo:
        "<html><body>Esta pergunta é para testar se você é um visitante humano. " +
        "Seu Support ID: 13552133409858234177.</body></html>",
    })
    assert.equal(r.veredito, "indisponivel")
    assert.match(r.motivo, /anti-robo/)
  })

  it("bloqueio real do Portal da Transparência em noscript é indisponível", () => {
    const corpo =
      "<html><head><title></title></head><body><noscript>" +
      "<h1>JavaScript is disabled</h1>In order to continue, we need to verify that you&#39;re not a robot. " +
      "This requires JavaScript. Enable JavaScript and then reload the page.</noscript></body></html>"
    const r = analisarSubstancia({
      httpStatus: 202,
      contentType: "text/html; charset=UTF-8",
      corpo,
      bytes: Buffer.byteLength(corpo),
    })
    assert.equal(r.veredito, "indisponivel")
    assert.match(r.motivo, /anti-robo/)
  })

  it("noscript genérico não absolve uma casca de SPA", () => {
    const corpo =
      "<html><body><app-root></app-root><noscript>JavaScript is disabled. Enable JavaScript to use this application.</noscript></body></html>"
    assert.equal(html({ corpo }).veredito, "sem_substancia")
  })

  it("matéria longa que cita 'acesso negado' no texto continua com conteúdo", () => {
    const corpo = paginaCom(LIMITE_PAGINA_DE_DESAFIO * 2, "o acórdão registrou acesso negado ao pedido")
    const r = html({ corpo })
    assert.equal(r.veredito, "com_conteudo")
  })

  it("a mesma frase numa página curta continua sendo tratada como bloqueio", () => {
    const r = html({ corpo: paginaCom(LIMITE_PAGINA_DE_DESAFIO - 100, "acesso negado") })
    assert.equal(r.veredito, "indisponivel")
  })

  it("página um caractere abaixo do piso é sem substância e um acima tem conteúdo", () => {
    assert.equal(html({ corpo: paginaCom(TEXTO_MINIMO_UTIL - 1) }).veredito, "sem_substancia")
    assert.equal(html({ corpo: paginaCom(TEXTO_MINIMO_UTIL + 1) }).veredito, "com_conteudo")
  })

  it("PDF é julgado por bytes, não por texto extraído", () => {
    const grande = analisarSubstancia({
      httpStatus: 200,
      contentType: "application/pdf",
      corpo: "%PDF-1.4 binario",
      bytes: BYTES_MINIMO_BINARIO * 40,
    })
    assert.equal(grande.veredito, "com_conteudo")

    const truncado = analisarSubstancia({
      httpStatus: 200,
      contentType: "application/pdf",
      corpo: "%PDF",
      bytes: 40,
    })
    assert.equal(truncado.veredito, "sem_substancia")
  })

  it("JSON de API oficial conta como conteúdo", () => {
    // É o caso das fontes novas de ronaldo-caiado: a consulta do
    // DivulgaCandContas devolve JSON, não HTML.
    const r = analisarSubstancia({
      httpStatus: 200,
      contentType: "application/json",
      corpo: '{"nomeCompleto":"RONALDO RAMOS CAIADO","totalDeBens":24874436.19}',
      bytes: 40000,
    })
    assert.equal(r.veredito, "com_conteudo")
  })
})

describe("dados abertos em XML nao sao defeito de fonte", () => {
  /**
   * Regressao encontrada em 2026-08-02 pelo run de link-check no CI: a claim
   * "Carreira politica" do Jorginho Mello citava
   * https://legis.senado.leg.br/dadosabertos/senador/5350/mandatos, endpoint
   * OFICIAL de dados abertos do Senado, que responde 200 com
   * `Content-Type: application/xml` e 2166 bytes de dado estruturado real.
   *
   * `TIPOS_NAO_HTML` cobria json e pdf mas nao xml, entao o analisador tentava
   * extrair texto de HTML, nao achava os 500 caracteres legiveis e devolvia
   * `sem_substancia`, que é defeito REAL e derruba o gate. Fonte primaria de
   * governo virava motivo de falha, e gate que reprova fonte boa é gate que
   * alguem silencia.
   */
  it("classifica application/xml como tipo nao-HTML", () => {
    assert.equal(ehTipoNaoHtml("application/xml"), true)
    assert.equal(ehTipoNaoHtml("application/xml; charset=UTF-8"), true)
    assert.equal(ehTipoNaoHtml("text/xml"), true)
    assert.equal(ehTipoNaoHtml("application/rss+xml"), true)
    assert.equal(ehTipoNaoHtml("application/atom+xml"), true)
  })

  it("NAO trata xhtml como binario: continua sendo pagina para analisar", () => {
    assert.equal(ehTipoNaoHtml("application/xhtml+xml"), false)
    assert.equal(ehTipoNaoHtml("text/html"), false)
  })

  it("o payload real do Senado passa como conteudo, nao como sem_substancia", () => {
    const corpoSenado = `<?xml version='1.0' encoding='UTF-8'?>
<MandatoParlamentar xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance'>
  <Parlamentar><CodigoParlamentar>5350</CodigoParlamentar></Parlamentar>
</MandatoParlamentar>`.repeat(12)
    const analise = analisarSubstancia({
      httpStatus: 200,
      contentType: "application/xml",
      corpo: corpoSenado,
      bytes: corpoSenado.length,
    })
    assert.equal(analise.veredito, "com_conteudo")
  })

  it("xml pequeno demais continua sendo sem_substancia", () => {
    const vazio = "<?xml version='1.0'?><vazio/>"
    const analise = analisarSubstancia({
      httpStatus: 200,
      contentType: "application/xml",
      corpo: vazio,
      bytes: vazio.length,
    })
    assert.equal(analise.veredito, "sem_substancia")
  })
})

/**
 * Bloqueio disfarçado de 404, e página de erro servida com 200 (2026-08-03).
 *
 * Os corpos aqui são recortes do que foi realmente baixado em 2026-08-03. O
 * `CORPO_404_REVISTAFORUM` é a página que `revistaforum.com.br/404.html` devolve
 * de verdade, medida em 623 caracteres úteis: ela é a prova de que existe
 * página de erro ACIMA do piso de 500, e é também o corpo exato que a sonda de
 * datacenter recebeu para uma matéria que estava viva.
 */
describe("bloqueio disfarcado de 404 e soft 404", () => {
  const CORPO_404_REVISTAFORUM = `<html><head><title>Revista Fórum</title></head><body>
    <h1>404</h1>
    <p>Lamentamos que a pagina que você procurou pode estar fora do ar</p>
    <a href="/">Voltar</a>
    <footer>Inspirada no Fórum Social Mundial, a Fórum foi lançada com a cobertura do primeiro
    evento, realizado em janeiro de 2001 em Porto Alegre. ${"Texto institucional de rodapé. ".repeat(14)}</footer>
    </body></html>`

  it("404 com desafio anti-robo no corpo e bloqueio, nao morte", () => {
    const corpo = "<html><body><h1>Attention Required!</h1><p>Support ID: 1234567890</p></body></html>"
    const r = corpoDeErroIndicaBloqueio({ contentType: "text/html", corpo, bytes: corpo.length })
    assert.equal(r.bloqueio, true)
  })

  it("404 com aviso de vedacao eleitoral e bloqueio, nao morte", () => {
    const corpo =
      "<html><body><p>Em cumprimento à legislação eleitoral, este site encontra-se com as funcionalidades desativadas.</p></body></html>"
    const r = corpoDeErroIndicaBloqueio({ contentType: "text/html", corpo, bytes: corpo.length })
    assert.equal(r.bloqueio, true)
  })

  it("404 de verdade NAO e tratado como bloqueio: a pagina real da revistaforum nao tem marcador", () => {
    // Este é o teste que impede o afrouxamento. O falso negativo de 03/08 veio
    // exatamente com este corpo, e mesmo assim ele não pode virar anistia: um
    // 404 verdadeiro tem o mesmo corpo, e quem separa os dois é a confirmação
    // em execuções distintas, no script, não uma regra sobre o corpo.
    const r = corpoDeErroIndicaBloqueio({
      contentType: "text/html",
      corpo: CORPO_404_REVISTAFORUM,
      bytes: CORPO_404_REVISTAFORUM.length,
    })
    assert.equal(r.bloqueio, false)
  })

  it("404 com corpo vazio continua morte: e a forma normal de API dizer que nao existe", () => {
    const r = corpoDeErroIndicaBloqueio({ contentType: "text/html", corpo: "", bytes: 0 })
    assert.equal(r.bloqueio, false)
  })

  it("pareceCorpoDeErro le titulo e h1, nao o corpo inteiro", () => {
    assert.equal(pareceCorpoDeErro("<h1>404</h1>"), true)
    assert.equal(pareceCorpoDeErro("<title>Página não encontrada</title>"), true)
    assert.equal(pareceCorpoDeErro("<title>Page Not Found</title>"), true)
    assert.equal(
      pareceCorpoDeErro("<title>STF julga recurso</title><p>O documento 404 não foi encontrado nos autos</p>"),
      false,
      "materia que cita 404 no meio do texto nao pode ser derrubada",
    )
  })

  it("soft 404: pagina de erro servida com HTTP 200 nao sustenta afirmacao", () => {
    // 623 caracteres úteis, ACIMA do piso de 500. Sem esta regra, este corpo
    // passava como `com_conteudo`.
    const analise = analisarSubstancia({
      httpStatus: 200,
      contentType: "text/html",
      corpo: CORPO_404_REVISTAFORUM,
      bytes: CORPO_404_REVISTAFORUM.length,
    })
    assert.ok(extrairTextoUtil(CORPO_404_REVISTAFORUM).length > 500, "o corpo passa do piso de tamanho")
    assert.equal(analise.veredito, "sem_substancia")
    assert.match(analise.motivo, /soft 404/)
  })

  it("materia longa que mencione 'nao encontrado' segue com_conteudo", () => {
    const materia = `<html><head><title>Justiça manda soltar réu</title></head><body><h1>Justiça manda soltar réu</h1>
      <p>${"O relator afirmou que o documento não foi encontrado nos autos do processo. ".repeat(60)}</p>
      </body></html>`
    const analise = analisarSubstancia({
      httpStatus: 200,
      contentType: "text/html",
      corpo: materia,
      bytes: materia.length,
    })
    assert.equal(analise.veredito, "com_conteudo")
  })
})
