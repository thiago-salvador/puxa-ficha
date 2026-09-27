import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { nivelFonteProcesso, urlFonteJudicialEspecifica, urlPublicaDoProcesso } from "../src/lib/djen-consulta-url"
import { processoFonteLabel } from "../src/lib/processos-display"

const STF_HC = "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=HC&numeroProcesso=201965"

describe("STF por classe e número", () => {
  it("aceita a consulta oficial com a mesma classe e número", () => {
    assert.equal(urlFonteJudicialEspecifica(STF_HC, "HC 201965"), STF_HC)
    assert.equal(urlFonteJudicialEspecifica(STF_HC, "hc201965"), STF_HC)
  })

  it("rejeita notícia, raiz, outro host e número divergente", () => {
    assert.equal(urlFonteJudicialEspecifica("https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=1", "HC 201965"), null)
    assert.equal(urlFonteJudicialEspecifica("https://portal.stf.jus.br/", "HC 201965"), null)
    assert.equal(urlFonteJudicialEspecifica("https://stf.example.com/processos/listarProcessos.asp?classe=HC&numeroProcesso=201965", "HC 201965"), null)
    assert.equal(urlFonteJudicialEspecifica(STF_HC.replace("201965", "201966"), "HC 201965"), null)
    assert.equal(urlFonteJudicialEspecifica(STF_HC.replace("classe=HC", "classe=RE"), "HC 201965"), null)
    assert.equal(urlFonteJudicialEspecifica(STF_HC.replace("https:", "http:"), "HC 201965"), null)
  })
})

describe("nivelFonteProcesso", () => {
  it("fonte judicial específica é oficial", () => {
    assert.equal(nivelFonteProcesso({ numero_processo: "HC 201965", url_fonte: STF_HC }), "oficial")
  })

  it("página específica sem prova judicial entra em confirmação", () => {
    const imprensa = { numero_processo: null, url_fonte: "https://g1.globo.com/politica/noticia/2026/08/13/materia.ghtml" }
    assert.equal(nivelFonteProcesso(imprensa), "em_confirmacao")
    assert.equal(nivelFonteProcesso({ numero_processo: "0048408-11.2014.8.07.0018", url_fonte: "https://www.tjdft.jus.br/institucional/imprensa/noticias/2026/junho/x" }), "em_confirmacao")
  })

  it("sem link, raiz de site, arquivo de dados ou linha bloqueada fica fora", () => {
    assert.equal(nivelFonteProcesso({ numero_processo: null, url_fonte: null }), null)
    assert.equal(nivelFonteProcesso({ numero_processo: null, url_fonte: "https://revistacenarium.com.br" }), null)
    assert.equal(nivelFonteProcesso({ numero_processo: null, url_fonte: "https://exemplo.org/dados.csv" }), null)
    assert.equal(nivelFonteProcesso({ numero_processo: null, url_fonte: "ftp://exemplo.org/materia" }), null)
    assert.equal(nivelFonteProcesso({ numero_processo: "0173030-12.2015.8.06.0001", url_fonte: "https://esaj.tjce.jus.br/cpopg/open.do" }), null)
    assert.equal(nivelFonteProcesso({ numero_processo: null, url_fonte: "https://www.tjsp.jus.br/Processos" }), null)
    assert.equal(
      nivelFonteProcesso({ id: "ba7781b9-c002-4a43-9797-7a06dfc9bf1a", numero_processo: null, url_fonte: "https://revistacenarium.com.br/materia" }),
      null,
    )
  })

  it("em confirmação linka a própria fonte, não a busca vazia do DJEN", () => {
    const row = { numero_processo: "0607928-52.2022.6.26.0000", url_fonte: "https://noticias.uol.com.br/politica/materia.htm", fonte_nivel: "em_confirmacao" as const }
    assert.equal(urlPublicaDoProcesso(row), row.url_fonte)
    assert.match(urlPublicaDoProcesso({ ...row, fonte_nivel: null }) ?? "", /comunica\.pje\.jus\.br/)
  })

  it("rótulo da fonte não chama imprensa de oficial", () => {
    assert.equal(processoFonteLabel({ status: "em_andamento", url_fonte: "https://g1.globo.com/x", fonte_nivel: "em_confirmacao" }), "Fonte jornalística")
    assert.equal(processoFonteLabel({ status: "em_andamento", url_fonte: "https://www.tjdft.jus.br/x", fonte_nivel: "em_confirmacao" }), "Página do tribunal")
    assert.equal(processoFonteLabel({ status: "em_andamento", url_fonte: "https://pesquisa.apps.tcu.gov.br/x", fonte_nivel: "em_confirmacao" }), "Página oficial")
  })
})
