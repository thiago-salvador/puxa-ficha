import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { parseArquivoUol, parseBuscaAfp, trechosAfp, trechosUol, urlArquivoUol, urlBuscaAfp, urlProximaUol } from "../scripts/lib/checagens-fontes-diretas"

const fixture = (name: string) => readFileSync(new URL("./fixtures/checagens-coleta/" + name, import.meta.url), "utf8")
const UOL = fixture("uol-confere-arquivo.html")
const AFP = fixture("afp-checamos-search-lula.html")
const AFP_CAIADO = fixture("afp-checamos-search-caiado.html")
const AFP_ZERO = fixture("afp-checamos-search-zero.html")
const UOL_PAGE_2 = fixture("uol-confere-pagina-2.json")
const UOL_PAGE_32 = fixture("uol-confere-pagina-32.json")
const UOL_FINAL = fixture("uol-confere-pagina-final.json")
const UOL_ARTICLE = fixture("uol-confere-artigo.html")
const AFP_ARTICLE = fixture("afp-checamos-artigo.html")

describe("fontes diretas UOL Confere e AFP Checamos", () => {
  it("decodifica entidades em uma passagem e remove scripts de caixa variada", () => {
    const pagina = UOL.replace(/(<h3\b[^>]*class=["'][^"']*thumb-title[^"']*["'][^>]*>)[\s\S]*?(<\/h3>)/i,
      "$1Teste &amp;#39; seguro <SCRIPT>conteúdo injetado</SCRIPT >$2")
    assert.notEqual(pagina, UOL)
    const titulo = parseArquivoUol(pagina).itens.find((item) => item.titulo.startsWith("Teste"))?.titulo
    assert.equal(titulo, "Teste &#39; seguro")
  })

  it("constrói a URL canônica de arquivo do UOL e extrai o cursor publicado", () => {
    assert.equal(urlArquivoUol(), "https://noticias.uol.com.br/confere/")
    const page = parseArquivoUol(UOL)
    assert.equal(page.hasNext, true)
    assert.equal(page.cursor, "0001H931U11N")
    assert.equal(page.request.busca && (page.request.busca as { params: { repository: string } }).params.repository, "mix2")
    assert.equal(page.pageSize, 12)
    assert.equal(page.brutos, 11)
    assert.equal(page.itens.length, 8)
    assert.ok(page.itens.every((item) => item.fonte === "UOL Confere" && item.link.includes("/confere/ultimas-noticias/")))
    assert.ok(page.itens.every((item) => item.corpo?.url === item.link))
    const nextUrl = new URL(urlProximaUol(page.request))
    assert.equal(nextUrl.origin + nextUrl.pathname, "https://noticias.uol.com.br/service/")
    assert.equal(nextUrl.searchParams.get("loadComponent"), "results-index")
    assert.equal(nextUrl.searchParams.get("configPath"), "noticias/noticias.confere")
    assert.equal(nextUrl.searchParams.get("json"), "")
    assert.deepEqual(JSON.parse(nextUrl.searchParams.get("data") ?? ""), page.request)
  })

  it("consome página 2 do endpoint UOL sem perder cursor ou integridade do lote", () => {
    const page = parseArquivoUol(UOL_PAGE_2)
    assert.equal(page.brutos, 12)
    assert.equal(page.itens.length, 10)
    assert.equal(page.cursor, "0001H931U23N")
    assert.equal(page.hasNext, true)
    assert.ok(page.itens.every((item) => item.link.startsWith("https://noticias.uol.com.br/confere/")))
    assert.throws(() => parseArquivoUol(JSON.stringify({ type: "results-index", body: "" })), /sem controle de paginação/)
    assert.throws(() => urlProximaUol({ hasNext: true }), /fora do arquivo nativo/)
  })

  it("reconhece os links .htm do arquivo UOL a partir da página 32", () => {
    const page = parseArquivoUol(UOL_PAGE_32)
    assert.equal(page.brutos, 12)
    assert.equal(page.itens.length, 12)
    assert.ok(page.itens.every((item) => item.link.endsWith(".htm")))
    assert.equal(page.cursor, "0001H931U383N")
  })

  it("encerra o arquivo UOL apenas com última página curta e íntegra", () => {
    const page = parseArquivoUol(UOL_FINAL)
    assert.equal(page.brutos, 9)
    assert.equal(page.itens.length, 9)
    assert.equal(page.hasNext, false)
    assert.ok(page.itens.some((item) => item.link.includes("/uol-confere-moraes-")))
    const truncada = UOL_FINAL.replace(/<a\b[^>]*>[\s\S]*?<\/a>/i, "")
    assert.throws(() => parseArquivoUol(truncada), /última página truncada/)
  })

  it("extrai apenas parágrafos da matéria UOL e AFP", () => {
    const uol = trechosUol(UOL_ARTICLE)
    assert.ok(uol && uol.length > 2)
    assert.ok(uol.some((p) => p.includes("Flávio Bolsonaro")))
    assert.equal(trechosUol("<article data-v-d559f1f7><div class=\"body-container\">nav</div></article>"), null)
    const afp = trechosAfp(AFP_ARTICLE)
    assert.ok(afp && afp.length > 2)
    assert.ok(afp.some((p) => p.includes("Flávio Bolsonaro")))
    assert.equal(trechosAfp("<article class=\"node--view-mode-full\"><div class=\"wrapper-body\">menu</div></article>"), null)
  })

  it("falha fechado quando a listagem UOL perde seus sinais de lote ou cursor", () => {
    assert.throws(() => parseArquivoUol(UOL.replace("UOL Confere - UOL Notícias", "Acesso negado")), /título canônico/)
    assert.throws(() => parseArquivoUol(UOL.replace("0001H931U11N", "")), /continuação sem cursor/)
    assert.throws(() => parseArquivoUol(UOL.replace("78333", "99999")), /fora do arquivo nativo/)
    assert.throws(() => parseArquivoUol(UOL.replace(/<a href="https:\/\/noticias\.uol\.com\.br\/(?:confere|comprova)\/ultimas-noticias\/[^"]+">[\s\S]*?<\/a>/g, "")), /sem cards/)
  })

  it("constrói busca AFP com query codificada e página Drupal", () => {
    assert.equal(urlBuscaAfp("Lula"), "https://checamos.afp.com/fact-checking-search-results?search_api_fulltext=Lula")
    assert.equal(urlBuscaAfp("João Silva", 2), "https://checamos.afp.com/fact-checking-search-results?search_api_fulltext=Jo%C3%A3o+Silva&page=2")
    assert.throws(() => urlBuscaAfp("Lula", -1), /página AFP inválida/)
  })

  it("valida total, tamanho de página, domínio e link da próxima página AFP", () => {
    const page = parseBuscaAfp(AFP, "Lula")
    assert.equal(page.total, 1116)
    assert.equal(page.pagina, 0)
    assert.equal(page.proxima, 1)
    assert.equal(page.brutos, 20)
    assert.ok(page.itens.every((item) => item.fonte === "AFP Checamos" && new URL(item.link).hostname === "checamos.afp.com"))
    assert.ok(page.itens.every((item) => item.data_publicacao?.startsWith("2026-09-")))
  })

  it("inclui URL legada AFP no domínio oficial e confere as seis matérias", () => {
    const page = parseBuscaAfp(AFP_CAIADO, "Ronaldo Caiado")
    assert.equal(page.total, 6)
    assert.equal(page.brutos, 6)
    assert.ok(page.itens.some((item) => item.link.endsWith("/o-jornal-hoje-nao-noticiou-investigacao-de-uma-ordem-de-bolsonaro-para-executar-lazaro-barbosa")))
    const semLegado = AFP_CAIADO.replace(/<a\b(?=[^>]*href="https:\/\/checamos\.afp\.com\/o-jornal-hoje-nao-noticiou-investigacao-de-uma-ordem-de-bolsonaro-para-executar-lazaro-barbosa")[\s\S]*?<\/a>/i, "")
    assert.throws(() => parseBuscaAfp(semLegado, "Ronaldo Caiado"), /leitura parcial/)
  })

  it("recusa busca AFP de termo diferente, página truncada e paginação ausente", () => {
    assert.throws(() => parseBuscaAfp(AFP, "Bolsonaro"), /eco do termo/)
    assert.throws(() => parseBuscaAfp(AFP.replace(/<article>[\s\S]*?<\/article>/, ""), "Lula"), /leitura parcial/)
    assert.throws(() => parseBuscaAfp(AFP.replace(/<a href="\?search_api_fulltext=Lula&amp;page=1"[^>]*>Próxima<\/a>/, ""), "Lula"), /sem próxima página/)
    assert.throws(() => parseBuscaAfp(AFP, "Lula", 1), /cursor de página inválido/)
  })

  it("aceita zero AFP somente com formulário e contador explícitos", () => {
    const zero = "<html><head><title>Search | Checamos</title></head><body><input name=\"search_api_fulltext\" value=\"Pessoa Inexistente\"/><p>Resultado 0</p><div class=\"view-content\"></div></body></html>"
    const parsed = parseBuscaAfp(zero, "Pessoa Inexistente")
    assert.equal(parsed.total, 0)
    assert.equal(parsed.brutos, 0)
    assert.equal(parsed.proxima, null)
    const zeroReal = parseBuscaAfp(AFP_ZERO, "Sandro Alex")
    assert.equal(zeroReal.total, 0)
    assert.equal(zeroReal.brutos, 0)
    assert.equal(zeroReal.proxima, null)
    assert.throws(() => parseBuscaAfp(AFP_ZERO, "Sandro Alex", 1), /terminou antes/)
  })
})
