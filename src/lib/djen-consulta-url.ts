/**
 * Portal humano do DJEN. A API `comunicaapi.pje.jus.br` continua sendo a
 * coleta; `url_fonte` pública aponta para a consulta, não para o JSON.
 */

const DJEN_CONSULTA_ORIGEM = "https://comunica.pje.jus.br"
const DJEN_CONSULTA_CAMINHO = "/consulta"
const DJEN_API_ORIGEM = "https://comunicaapi.pje.jus.br"
const DJEN_API_CAMINHO = "/api/v1/comunicacao"
const DJEN_CONSULTA_HOST = new URL(DJEN_CONSULTA_ORIGEM).hostname
const DJEN_API_HOST = new URL(DJEN_API_ORIGEM).hostname

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
    url.hostname === DJEN_API_HOST &&
    url.pathname === DJEN_API_CAMINHO
  const consultaOk =
    ehHttpsSemCredencial(url) &&
    url.hostname === DJEN_CONSULTA_HOST &&
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

function cnjComDigitoValido(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  if (!/^\d{20}$/.test(raw) && !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(raw)) return null
  const digits = cnjSomenteDigitos(raw)
  const check = 98 - Number(BigInt(`${digits.slice(0, 7)}${digits.slice(9)}00`) % BigInt(97))
  return Number(digits.slice(7, 9)) === check ? digits : null
}

const STF_PORTAL_HOST = "portal.stf.jus.br"
const STF_LISTAR_PROCESSOS = "/processos/listarProcessos.asp"

/**
 * Processo do STF identificado por classe e número (ex.: "HC 201965"), sem CNJ na
 * própria linha. Só vale a consulta oficial do portal com a mesma classe e o mesmo
 * número na URL; notícia, raiz do portal e outro host continuam fora.
 */
function urlStfPorClasseENumero(raw: string, numeroProcesso: unknown): string | null {
  if (typeof numeroProcesso !== "string") return null
  const match = /^([A-Za-z]{1,6})\s*(\d{1,7})$/.exec(numeroProcesso.trim())
  if (!match) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== STF_PORTAL_HOST) return null
    if (url.username || url.password || url.hash) return null
    if (url.pathname !== STF_LISTAR_PROCESSOS) return null
    if (url.searchParams.get("classe")?.toUpperCase() !== match[1].toUpperCase()) return null
    if (url.searchParams.get("numeroProcesso") !== match[2]) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Só a URL que contém o CNJ exato sustenta a linha de forma automática. */
export function urlFonteJudicialEspecifica(raw: unknown, numeroProcesso: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const stf = urlStfPorClasseENumero(raw, numeroProcesso)
  if (stf) return stf
  const cnj = cnjComDigitoValido(numeroProcesso)
  if (!cnj) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== "https:" || !url.hostname.toLowerCase().endsWith(".jus.br")) return null
    if (url.username || url.password || url.hash) return null
    if (url.hostname === DJEN_CONSULTA_HOST || url.hostname === DJEN_API_HOST) {
      try {
        urlConsultaDjenDeFonte(url.toString(), String(numeroProcesso))
        return url.toString()
      } catch {
        return null
      }
    }
    if (url.pathname === "/") return null
    const location = decodeURIComponent(`${url.pathname}${url.search}`)
    const exactDigits = new RegExp(`(?:^|\\D)${cnj}(?:$|\\D)`)
    if (!location.includes(String(numeroProcesso)) && !exactDigits.test(location)) return null
    return url.toString()
  } catch {
    return null
  }
}

function urlEhPlanilhaOuJson(valor: string): boolean {
  try {
    const url = new URL(valor)
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()
    if (host === DJEN_API_HOST) return true
    if (host === "sheets.google.com") return true
    if (host === "docs.google.com" && path.includes("/spreadsheets/")) return true
    return [".json", ".csv", ".xlsx", ".xls"].some((ext) => path.endsWith(ext))
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

export type FonteProcessoNivel = "oficial" | "em_confirmacao"

/**
 * Linhas que não entram nem com o selo: identidade não confirmada ou histórico
 * de homônimo. Cada id aqui precisa de motivo registrado na curadoria.
 */
const PROCESSOS_FORA_DO_SELO = new Set<string>([
  "ba7781b9-c002-4a43-9797-7a06dfc9bf1a", // homônimo já registrado nesta ficha
  "7f300862-39ed-49fd-9bbb-9decee7e6b13", // partes intimadas no DJEN não incluem a candidata
  "6d93a421-403d-401d-a6ad-a50b03970b81", // lista paginada de comunicados; não identifica o processo
])

/**
 * Linhas fora do site por decisão editorial, mesmo com fonte judicial oficial:
 * segredo de justiça ou natureza que não cabe na ficha. Reversível, sem escrita
 * no banco e sem e-mail. Cada id precisa de decisão nominal registrada.
 */
export const PROCESSOS_OCULTOS_POR_DECISAO = new Set<string>([
  "dd836992-ab4c-45fd-bc04-8b7b5b1750ac", // segredo de justiça no DJEN desde 29/09/2023 (execução de ANPP); Mesa L8
  "28f8ea67-c429-4cf5-af59-cf8c15f215d8", // sem número nem fonte; ano, tribunal e denúncia não batem com o episódio de 2018 em Boa Vista (RR)
])

/**
 * Linhas em que a candidatura figura só como autoridade pública, em razão do
 * cargo (autoridade coatora ou impetrada em mandado de segurança, interpelada
 * na função, ré em ação contra ato de governo), sem pedido contra ela em nome
 * próprio. Não são processo da pessoa: saem da lista e também da contagem de
 * omitidos, porque não falta fonte a elas. Papel conferido no polo oficial do
 * DJEN. Ação popular, improbidade e ação civil com pedido pessoal continuam
 * públicas. Chave: id da linha; valor: CNJ e ficha.
 */
export const PROCESSOS_FORA_POR_PAPEL_DE_AUTORIDADE = new Map<string, { cnj: string; slug: string }>([
  // autoridade pelo cargo, sem pedido pessoal
  ["f0c18c70-3ef3-49c3-81a8-05883346aa99", { cnj: "7012498-62.2024.8.22.0007", slug: "adailton-furia" }],
  ["14e47010-de83-4509-aa2d-0e1481135d35", { cnj: "8010425-71.2019.8.05.0000", slug: "acm-neto" }],
  ["8fd380e5-0dbe-45ce-abae-9fee31189182", { cnj: "0800961-87.2024.8.12.0055", slug: "eduardo-riedel" }],
  ["2df0597d-484a-4e7e-a380-296729380a32", { cnj: "8024632-65.2025.8.05.0000", slug: "jeronimo" }],
  ["c03f8a17-779b-4981-8915-fee2d145f3a5", { cnj: "5005429-52.2026.8.24.0018", slug: "joao-rodrigues" }],
  ["14b9c8f8-f145-45cb-bb73-88b646891111", { cnj: "0761204-26.2023.8.18.0000", slug: "rafael-fonteles" }],
  ["7be54170-90cc-434e-95ac-6a7bdc48e845", { cnj: "0715972-30.2021.8.01.0001", slug: "tiao-bocalom" }],
  ["900fb4c3-d1dd-4dd3-ae68-2fa36a1e09dc", { cnj: "1000302-66.2022.8.11.0096", slug: "tse-2026-110002551966" }],
  ["1230143d-0566-42ac-bb57-65d9d9af7e51", { cnj: "1010174-52.2024.8.26.0053", slug: "tarcisio-gov-sp" }],
])

export function processoForaPorPapelDeAutoridade(id: string | null | undefined): boolean {
  return Boolean(id && PROCESSOS_FORA_POR_PAPEL_DE_AUTORIDADE.has(id))
}

/** Quantas linhas da ficha saíram por papel de autoridade (para descontar dos omitidos). */
export function processosForaPorPapelDeAutoridadeDaFicha(slug: string): number {
  let total = 0
  for (const linha of PROCESSOS_FORA_POR_PAPEL_DE_AUTORIDADE.values()) if (linha.slug === slug) total += 1
  return total
}

/**
 * "oficial": fonte judicial específica prova o processo.
 * "em_confirmacao": há página específica (imprensa ou portal oficial genérico),
 * mas a fonte judicial do próprio processo ainda não foi localizada; a ficha
 * mostra a linha com selo em vez de escondê-la.
 * null: sem fonte específica publicável; a linha fica fora e entra na contagem
 * de omitidos (salvo papel de autoridade, que não conta como omitida).
 */
export function nivelFonteProcesso(
  processo: { id?: string | null; numero_processo: string | null; url_fonte?: string | null },
): FonteProcessoNivel | null {
  if (processo.id && PROCESSOS_OCULTOS_POR_DECISAO.has(processo.id)) return null
  if (processoForaPorPapelDeAutoridade(processo.id)) return null
  if (urlFonteJudicialEspecifica(processo.url_fonte, processo.numero_processo)) return "oficial"
  if (processo.id && PROCESSOS_FORA_DO_SELO.has(processo.id)) return null
  const fonte = processo.url_fonte?.trim()
  if (!fonte || !urlFrontPublicavel(fonte)) return null
  try {
    const url = new URL(fonte)
    if (url.username || url.password) return null
    // Página específica: com query (id do documento) ou com um segmento longo
    // (slug de matéria, acórdão). Raiz e portal genérico ("/Processos",
    // "/cpopg/open.do") não ligam a linha a nada.
    const segmentos = url.pathname.split("/").filter(Boolean)
    if (!url.search && !segmentos.some((segmento) => segmento.length >= 12)) return null
  } catch {
    return null
  }
  return "em_confirmacao"
}

/**
 * Destino clicável do processo no front: portal humano do DJEN ou artigo.
 * Nunca devolve a API JSON, planilha ou arquivo de dados.
 */
export function urlPublicaDoProcesso(
  processo: { numero_processo: string | null; url_fonte?: string | null; fonte_nivel?: FonteProcessoNivel | null },
): string | null {
  const fonte = processo.url_fonte?.trim() || ""
  const numero = processo.numero_processo?.trim() || ""

  // Em confirmação, o link é a própria fonte registrada, não uma busca vazia no DJEN.
  if (processo.fonte_nivel === "em_confirmacao") return fonte ? urlFrontPublicavel(fonte) : null

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
