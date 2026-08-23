/**
 * Análise de SUBSTÂNCIA de uma fonte, além do status HTTP.
 *
 * Por que existe: a auditoria de 2026-07-25 mostrou que "HTTP 200" não prova
 * nada sobre a afirmação publicada. Três buracos medidos nesta data:
 *
 *   1. `https://divulgacandcontas.tse.jus.br/divulga/` responde 200 e entrega
 *      46 caracteres de texto. É a casca do SPA do TSE. Passava no regex de
 *      caminho e no gate de gravidade, e sustentava uma claim de gravidade
 *      alta sobre o patrimônio de uma pessoa nomeada.
 *   2. `https://noticias.stf.jus.br/...` responde 200 com o texto completo na
 *      primeira requisição e 202 com corpo VAZIO nas seguintes. É limitador de
 *      taxa, não página morta. Um link-check ingênuo leria o 202 como 2xx e
 *      diria "viva"; um link-check paranoico leria corpo vazio e diria "morta".
 *      As duas leituras estão erradas.
 *   3. Vedação eleitoral. Em 2026-07-25, `agenciaminas.mg.gov.br` responde 503
 *      com "Em cumprimento à legislação eleitoral, este site encontra-se com as
 *      funcionalidades desativadas", e páginas de notícia de `goias.gov.br`
 *      respondem 200 com o mesmo aviso no lugar da matéria. São fontes
 *      legítimas fora do ar por lei, com data para voltar. Despublicar claim
 *      por causa disso seria trocar um erro por outro.
 *
 * Daí os três vereditos: `com_conteudo`, `sem_substancia` e `indisponivel`.
 * Nenhum deles é "morta": morte de URL continua sendo decidida pelo status
 * (404, 410, DNS inexistente) em scripts/link-check-pontos-atencao.ts.
 *
 * Todas as funções aqui são puras e sem rede, para poderem ser testadas com
 * corpo fixo em tests/fonte-substancia.test.ts.
 */

/** Veredito de substância de um corpo de resposta já baixado. */
import { stripAccents } from "@/lib/strip-accents"

export type SubstanciaVeredito = "com_conteudo" | "sem_substancia" | "indisponivel"

export interface SubstanciaAnalise {
  veredito: SubstanciaVeredito
  motivo: string
  caracteresUteis: number
}

export interface SubstanciaEntrada {
  httpStatus: number
  contentType: string | null
  corpo: string
  bytes: number
}

/**
 * Piso de texto útil para uma página HTML sustentar qualquer afirmação.
 *
 * Calibração medida em 2026-07-25 (caracteres de texto depois de remover
 * script, style, comentário e tags):
 *   46    casca do SPA do DivulgaCandContas
 *   217   `tse.jus.br/eleicoes/estatisticas/estatisticas-eleitorais` atrás do
 *         desafio anti-robô do F5
 *   227   `ba.gov.br` (aviso de navegador)
 *   614   página de bloqueio da Agência Minas
 *   2385  matéria do STF sobre a denúncia contra Sérgio Moro
 *   3599  matéria da Agência Brasil sobre a eleição de 2018 no RJ
 *   4651  matéria do Senado sobre a mesma eleição
 *   8175  matéria no portal antigo do STF
 *
 * 500 separa casca de matéria com folga dos dois lados. Páginas de bloqueio
 * mais falantes (a da Agência Minas passa de 500) são pegas pelos marcadores,
 * não pelo tamanho.
 */
export const TEXTO_MINIMO_UTIL = 500

/** Piso para corpo binário (PDF, ZIP, JSON de API). Abaixo disso é truncagem. */
export const BYTES_MINIMO_BINARIO = 1024

/**
 * Teto de tamanho para os marcadores anti-robô valerem.
 *
 * Página de desafio é curta por natureza (a do F5 no TSE tem 217 caracteres).
 * Matéria jurídica longa pode citar "acesso negado" ou "captcha" no corpo do
 * texto sem ser um bloqueio. Sem este teto, a checagem transformaria fonte boa
 * em alerta falso.
 */
export const LIMITE_PAGINA_DE_DESAFIO = 3000

/**
 * Domínios que só respondem conteúdo de forma intermitente e que, por isso,
 * NUNCA podem ser despublicados por decisão automática.
 *
 * `noticias.stf.jus.br`: medido em 2026-07-25. A primeira requisição depois de
 * um intervalo de folga devolve 200 com a matéria inteira; requisições
 * seguintes na mesma janela devolvem 202 com corpo vazio, mesmo espaçadas em
 * 20 segundos. O conteúdo existe e é oficial. O que falha é o robô, não a
 * fonte. Rota alternativa quando o valor literal é necessário: o portal antigo
 * (`portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=N`) serve parte
 * do acervo, mas nem todo `idConteudo` traz o corpo da matéria, então ele não
 * substitui a verificação humana.
 */
export const DOMINIOS_VERIFICACAO_MANUAL = ["noticias.stf.jus.br"] as const

/**
 * Marcadores de página que se declara de erro, lidos SÓ no `<title>` e no
 * primeiro `<h1>`.
 *
 * Medido em 2026-08-03: `https://revistaforum.com.br/404.html` entrega 623
 * caracteres de texto útil, ACIMA do piso de 500. Ou seja, site que sirva a
 * própria página de erro com HTTP 200 (soft 404) hoje passa como
 * `com_conteudo` e sustenta uma afirmação com uma tela que diz "não
 * encontrado".
 *
 * Lidos só no título e no h1 de propósito. Matéria sobre um processo pode citar
 * "404" ou "não encontrado" no meio do texto sem ser página de erro, e
 * transformar fonte boa em alerta é justamente o defeito que este arquivo
 * tenta evitar.
 */
const MARCADORES_CORPO_DE_ERRO: RegExp[] = [
  /^\s*(erro\s*)?(404|410)\s*$/,
  /\b(pagina|conteudo|noticia|materia) (nao|nao foi) (encontrad|localizad)/,
  /\bpage not found\b/,
  /\b(erro|error) (404|410)\b/,
  /\b404\b[^a-z0-9]{0,3}(nao encontrad|not found)/,
]

/** Marcadores de página desativada por legislação eleitoral. */
const MARCADORES_VEDACAO: RegExp[] = [
  /cumprimento (a|as) legislacao eleitoral/,
  /respeito (a|as) legislacao eleitoral/,
  /periodo de vedacao/,
  /(legislacao|periodo) eleitoral[^.]{0,120}(desativad|indisponivel|suspens|restabelec)/,
  /(desativad|indisponivel|suspens)[^.]{0,120}(legislacao|periodo) eleitoral/,
]

/** Marcadores de desafio anti-robô (WAF, captcha, verificação de navegador). */
const MARCADORES_ANTI_ROBO: RegExp[] = [
  /visitante humano/,
  /support id:/,
  /captcha/,
  /just a moment/,
  /attention required/,
  /(verificando seu navegador|checking your browser)/,
  /(acesso negado|access denied|forbidden)/,
]

/** Content-types cujo corpo não é HTML e não deve passar por strip de tags. */
// XML entrou em 2026-08-02. O endpoint oficial de dados abertos do Senado
// (legis.senado.leg.br/dadosabertos/...) responde `application/xml` com dado
// estruturado real, e sem esta linha o analisador tentava extrair texto de HTML,
// nao achava TEXTO_MÍNIMO_UTIL e devolvia `sem_substancia`, que e defeito REAL e
// derruba o gate. Fonte primaria de governo virava motivo de falha.
//
// `xhtml+xml` fica DE FORA de proposito: aquilo e pagina para ler, nao payload
// de dados, e deve continuar sendo julgado pelo texto extraído. Por isso o
// `(?!xhtml)` antes do ramo genérico `.*\+xml`.
const TIPOS_NAO_HTML =
  /^(application\/(pdf|zip|json|xml|.*\+json|(?!xhtml)[a-z0-9.-]*\+xml|octet-stream|vnd\.|msword)|text\/xml|image\/|audio\/|video\/|text\/csv)/i

/** Remove acento e caixa para o texto casar com os marcadores. */
function normalizarParaMarcador(texto: string): string {
  return stripAccents(texto)
    .toLowerCase()
}

/**
 * Texto que um leitor humano veria. Remove script, style, noscript, comentário
 * e tags, e colapsa espaço. Deliberadamente simples: o objetivo é medir ordem
 * de grandeza, não renderizar a página.
 */
export function extrairTextoUtil(html: string): string {
  // A tag de fechamento aceita qualquer coisa entre o nome e o `>`: `</script >`,
  // `</script\n>` e até `</script foo="bar">` são fechamentos válidos, porque o
  // parser de HTML ignora o que vem depois do nome numa end tag. Por isso o
  // `[^>]*` em vez de `\s*`. Sem isso o bloco não é removido, o corpo do script
  // entra na contagem de texto útil, e uma página sem conteúdo nenhum passaria no
  // piso de substância sustentando uma claim. Apontado pelo CodeQL
  // (js/bad-tag-filter).
  return html
    .replace(/<script[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style[^>]*>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript[^>]*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function pareceVedacaoEleitoral(texto: string): boolean {
  const alvo = normalizarParaMarcador(texto)
  return MARCADORES_VEDACAO.some((re) => re.test(alvo))
}

export function pareceDesafioAntiRobo(texto: string): boolean {
  const alvo = normalizarParaMarcador(texto)
  return MARCADORES_ANTI_ROBO.some((re) => re.test(alvo))
}

/**
 * Título e primeiro `<h1>` de um HTML, já normalizados. Vazio quando o corpo
 * não tem nenhum dos dois.
 */
function rotulosDoDocumento(html: string): string[] {
  const rotulos: string[] = []
  const titulo = /<title[^>]*>([\s\S]{0,300}?)<\/title[^>]*>/i.exec(html)
  const h1 = /<h1[^>]*>([\s\S]{0,300}?)<\/h1[^>]*>/i.exec(html)
  for (const achado of [titulo, h1]) {
    if (!achado?.[1]) continue
    const texto = extrairTextoUtil(achado[1])
    if (texto !== "") rotulos.push(normalizarParaMarcador(texto))
  }
  return rotulos
}

/**
 * A página se declara de erro no próprio título ou h1 (soft 404).
 *
 * Só olha rótulo, nunca o corpo inteiro. Ver `MARCADORES_CORPO_DE_ERRO`.
 */
export function pareceCorpoDeErro(html: string): boolean {
  return rotulosDoDocumento(html).some((rotulo) => MARCADORES_CORPO_DE_ERRO.some((re) => re.test(rotulo)))
}

/**
 * O corpo de uma resposta 404/410 é, na verdade, um bloqueio ou uma vedação
 * eleitoral disfarçada de "não existe".
 *
 * Existe porque `scripts/link-check-pontos-atencao.ts` decidia `morta` só pelo
 * status, sem nunca ler o corpo de um 404. WAF que responde 404 em vez de 403
 * (e portal que responde 404 durante a vedação) viravam morte, e morte é o
 * único veredito que autoriza despublicação.
 *
 * ATENÇÃO ao alcance real: no falso negativo medido em 2026-08-03
 * (`revistaforum.com.br`, 404 servido a sonda de datacenter para uma matéria
 * que existe), o corpo era a página de erro NORMAL do site, sem nenhum
 * marcador. Esta função não pega esse caso, e nada que leia só o corpo pegaria.
 * Quem separa aquele caso é a confirmação em execuções distintas, no script.
 */
export function corpoDeErroIndicaBloqueio(entrada: Omit<SubstanciaEntrada, "httpStatus">): {
  bloqueio: boolean
  motivo: string
} {
  const { contentType, corpo, bytes } = entrada

  // 404 com corpo vazio é a forma normal de muita API dizer "não existe".
  // Tratar isso como bloqueio seria dar anistia à morte de verdade.
  if (bytes === 0 || ehTipoNaoHtml(contentType)) {
    return { bloqueio: false, motivo: "" }
  }

  const texto = extrairTextoUtil(corpo)

  if (pareceVedacaoEleitoral(texto)) {
    return { bloqueio: true, motivo: "404 com aviso de legislacao eleitoral no corpo, nao e pagina inexistente" }
  }

  if (texto.length < LIMITE_PAGINA_DE_DESAFIO && pareceDesafioAntiRobo(texto)) {
    return { bloqueio: true, motivo: "404 com desafio anti-robo no corpo (WAF respondendo 404 em vez de 403)" }
  }

  return { bloqueio: false, motivo: "" }
}

export function ehTipoNaoHtml(contentType: string | null): boolean {
  return typeof contentType === "string" && TIPOS_NAO_HTML.test(contentType.trim())
}

export function dominioExigeVerificacaoManual(url: unknown): boolean {
  if (typeof url !== "string") return false
  let host: string
  try {
    host = new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return false
  }
  return DOMINIOS_VERIFICACAO_MANUAL.some((d) => host === d || host.endsWith(`.${d}`))
}

/**
 * Decide se o corpo baixado sustenta alguma coisa.
 *
 * A ordem das checagens é a ordem de força da evidência: bloqueio declarado
 * vence tamanho, e tamanho vence otimismo. Nunca devolve "morta": esta função
 * não opina sobre existência do recurso, só sobre o que veio no corpo.
 */
export function analisarSubstancia(entrada: SubstanciaEntrada): SubstanciaAnalise {
  const { httpStatus, contentType, corpo, bytes } = entrada

  if (bytes === 0) {
    return {
      veredito: "indisponivel",
      motivo: `HTTP ${httpStatus} com corpo vazio, tipico de limitador de taxa ou WAF`,
      caracteresUteis: 0,
    }
  }

  if (ehTipoNaoHtml(contentType)) {
    if (bytes < BYTES_MINIMO_BINARIO) {
      return {
        veredito: "sem_substancia",
        motivo: `corpo de ${bytes} bytes em ${contentType}, abaixo do minimo de ${BYTES_MINIMO_BINARIO}`,
        caracteresUteis: bytes,
      }
    }
    return {
      veredito: "com_conteudo",
      motivo: `${bytes} bytes de ${contentType}`,
      caracteresUteis: bytes,
    }
  }

  const texto = extrairTextoUtil(corpo)

  if (pareceVedacaoEleitoral(texto)) {
    return {
      veredito: "indisponivel",
      motivo: "pagina desativada por legislacao eleitoral, volta ao fim do periodo de vedacao",
      caracteresUteis: texto.length,
    }
  }

  if (texto.length < LIMITE_PAGINA_DE_DESAFIO && pareceDesafioAntiRobo(texto)) {
    return {
      veredito: "indisponivel",
      motivo: "desafio anti-robo no lugar do conteudo (WAF, captcha ou verificacao de navegador)",
      caracteresUteis: texto.length,
    }
  }

  // Soft 404: responde 2xx mas o próprio título ou h1 diz que não achou nada.
  // O teto de tamanho é o mesmo do desafio anti-robô, e pela mesma razão:
  // página de erro é curta (a da revistaforum tem 623 caracteres), matéria
  // longa que cite "não encontrado" no texto não pode ser derrubada por isso.
  if (texto.length < LIMITE_PAGINA_DE_DESAFIO && pareceCorpoDeErro(corpo)) {
    return {
      veredito: "sem_substancia",
      motivo: `pagina de erro servida com HTTP ${httpStatus} (soft 404), ${texto.length} caracteres`,
      caracteresUteis: texto.length,
    }
  }

  if (texto.length < TEXTO_MINIMO_UTIL) {
    return {
      veredito: "sem_substancia",
      motivo: `apenas ${texto.length} caracteres de texto util, minimo ${TEXTO_MINIMO_UTIL}`,
      caracteresUteis: texto.length,
    }
  }

  return {
    veredito: "com_conteudo",
    motivo: `${texto.length} caracteres de texto util`,
    caracteresUteis: texto.length,
  }
}
