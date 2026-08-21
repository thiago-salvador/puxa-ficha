/**
 * Portal humano do DJEN. A API `comunicaapi.pje.jus.br` continua sendo a
 * coleta; `url_fonte` pública aponta para a consulta, não para o JSON.
 */

const DJEN_CONSULTA_ORIGEM = "https://comunica.pje.jus.br"
const DJEN_CONSULTA_CAMINHO = "/consulta"
const DJEN_API_ORIGEM = "https://comunicaapi.pje.jus.br"
const DJEN_API_CAMINHO = "/api/v1/comunicacao"

function cnjSomenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "")
}

export function urlConsultaDjenPorCnj(numero: string): string {
  const digitos = cnjSomenteDigitos(numero)
  if (!/^\d{20}$/.test(digitos)) {
    throw new Error(`CNJ invalido para URL de consulta DJEN: ${numero}`)
  }
  return `${DJEN_CONSULTA_ORIGEM}${DJEN_CONSULTA_CAMINHO}?numeroProcesso=${digitos}`
}

function numeroProcessoDaUrl(url: URL): string | null {
  const valores = url.searchParams.getAll("numeroProcesso")
  if (valores.length !== 1) return null
  const digitos = cnjSomenteDigitos(valores[0])
  return /^\d{20}$/.test(digitos) ? digitos : null
}

function ehHttpsSemCredencial(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.hash === ""
  )
}

/** Aceita API ou portal como prova do CNJ e devolve a URL humana. */
export function urlConsultaDjenDeFonte(valor: string, numeroCnj: string): string {
  const esperado = cnjSomenteDigitos(numeroCnj)
  if (!/^\d{20}$/.test(esperado)) {
    throw new Error(`${numeroCnj}: CNJ invalido`)
  }
  let url: URL
  try {
    url = new URL(valor)
  } catch {
    throw new Error(`${numeroCnj}: URL do Comunica PJe invalida`)
  }
  const encontrado = numeroProcessoDaUrl(url)
  const apiOk =
    ehHttpsSemCredencial(url) &&
    url.hostname === "comunicaapi.pje.jus.br" &&
    url.pathname === DJEN_API_CAMINHO
  const consultaOk =
    ehHttpsSemCredencial(url) &&
    url.hostname === "comunica.pje.jus.br" &&
    url.pathname === DJEN_CONSULTA_CAMINHO
  if (!encontrado || encontrado !== esperado || (!apiOk && !consultaOk)) {
    throw new Error(`${numeroCnj}: URL do Comunica PJe nao prova o proprio CNJ`)
  }
  return urlConsultaDjenPorCnj(esperado)
}

export function urlFonteEPortalJudiciario(valor: string | null | undefined): boolean {
  if (!valor) return false
  try {
    const url = new URL(valor)
    return url.protocol === "https:" && url.hostname.toLowerCase().endsWith(".jus.br")
  } catch {
    return false
  }
}

function urlEhPlanilhaOuJson(valor: string): boolean {
  try {
    const url = new URL(valor)
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()
    if (host === "comunicaapi.pje.jus.br") return true
    if (host === "sheets.google.com") return true
    if (host === "docs.google.com" && path.includes("/spreadsheets/")) return true
    return /\.(json|csv|xlsx|xls)$/.test(path)
  } catch {
    return true
  }
}

function urlFrontPublicavel(valor: string): string | null {
  try {
    const url = new URL(valor)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (urlEhPlanilhaOuJson(valor)) return null
    return valor
  } catch {
    return null
  }
}

/**
 * Destino clicável do processo no front: portal humano do DJEN ou artigo.
 * Nunca devolve a API JSON, planilha ou arquivo de dados.
 */
export function urlPublicaDoProcesso(
  processo: Pick<{ numero_processo: string | null; url_fonte?: string | null }, "numero_processo" | "url_fonte">,
): string | null {
  const fonte = processo.url_fonte?.trim() || ""
  const numero = processo.numero_processo?.trim() || ""

  if (numero) {
    if (fonte) {
      try {
        return urlConsultaDjenDeFonte(fonte, numero)
      } catch {
        // fonte não é o Comunica PJe deste CNJ
      }
    }
    try {
      return urlConsultaDjenPorCnj(numero)
    } catch {
      // CNJ inválido; cai na fonte humana se houver
    }
  } else if (fonte) {
    try {
      const cnjNaUrl = numeroProcessoDaUrl(new URL(fonte))
      if (cnjNaUrl) return urlConsultaDjenDeFonte(fonte, cnjNaUrl)
    } catch {
      // ignore
    }
  }

  return fonte ? urlFrontPublicavel(fonte) : null
}
