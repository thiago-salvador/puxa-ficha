/**
 * Diagnóstico agregado da coleta judicial por candidato.
 *
 * O repositório é público e o log do Actions também: este módulo só guarda
 * contagens por tipo de falha e por fonte (DJEN, DataJud por tribunal, TSE).
 * Nunca guarda nome, CPF, número de processo, slug ou URL com parâmetro; a
 * URL entra apenas para derivar o rótulo da fonte e é descartada.
 */

export const TIPOS_FALHA_COLETA = [
  "limite_de_taxa",
  "bloqueio_http",
  "fonte_indisponivel",
  "tempo_esgotado",
  "dns",
  "rede",
  "resposta_invalida",
  "identidade_tse",
  "preflight_banco",
  "checkpoint",
  "erro_codigo",
  "outro",
] as const

export type TipoFalhaColeta = (typeof TIPOS_FALHA_COLETA)[number]

export const DISJUNTOR_ABERTO = "disjuntor aberto: respostas 429/5xx seguidas da fonte oficial"

const FONTE_VALIDA = /^(?:DJEN(?::inventario)?|DataJud(?::[A-Z0-9]{2,12}|:chave)?|TSE|outra|desconhecida)$/
const CHAVE_RESPOSTA_VALIDA = /^(?:[1-5]\d\d|tempo_esgotado|dns|rede)$/
const CLASSIFICACOES = ["encontrado", "vazio_confirmado", "bloqueado", "erro"] as const

/** Rótulo público da fonte a partir da URL; query e caminho pessoal nunca saem daqui. */
export function fonteDaUrl(url: string | null | undefined): string {
  if (!url) return "desconhecida"
  let alvo: URL
  try { alvo = new URL(url) } catch { return "desconhecida" }
  switch (alvo.hostname) {
    case "comunicaapi.pje.jus.br":
      return alvo.pathname === "/api/v1/comunicacao/tribunal" ? "DJEN:inventario" : "DJEN"
    case "api-publica.datajud.cnj.jus.br": {
      const alias = alvo.pathname.match(/^\/api_publica_([a-z0-9]{2,12})\//)?.[1]
      return alias ? `DataJud:${alias.toUpperCase()}` : "DataJud"
    }
    case "datajud-wiki.cnj.jus.br":
      return "DataJud:chave"
    case "cdn.tse.jus.br":
      return "TSE"
    default:
      return "outra"
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

function codigoDaCausa(erro: unknown): string {
  const causa = erro instanceof Error ? (erro as Error & { cause?: unknown }).cause : undefined
  const codigo = causa && typeof causa === "object" ? (causa as { code?: unknown }).code : undefined
  return typeof codigo === "string" ? codigo : ""
}

/** Status HTTP e fonte citados na mensagem de erro, sem reter a URL. */
export function origemDoErro(erro: unknown): { fonte: string; status: number | null } {
  const mensagem = mensagemDe(erro)
  const url = mensagem.match(/https?:\/\/[^\s"'<>)]+/)?.[0]
  const status = mensagem.match(/\bHTTP (\d{3})\b/)?.[1]
  let fonte = fonteDaUrl(url)
  if (fonte === "desconhecida") {
    if (/\bDataJud\b/.test(mensagem)) fonte = "DataJud"
    else if (/\bDJEN\b/.test(mensagem)) fonte = "DJEN"
    else if (/consulta_cand|\bTSE\b/.test(mensagem)) fonte = "TSE"
  }
  return { fonte, status: status ? Number(status) : null }
}

/**
 * Classificação fechada da falha, lida pelo workflow sem grep de log.
 * A ordem importa: o sinal mais específico (limite, bloqueio, rede) vence o
 * nome da fonte, para que "HTTP 403 em <DJEN>" não vire indisponibilidade.
 */
export function classificarFalhaColeta(erro: unknown): TipoFalhaColeta {
  const mensagem = mensagemDe(erro)
  const codigo = codigoDaCausa(erro)
  const nome = erro instanceof Error ? erro.name : ""
  if (mensagem === DISJUNTOR_ABERTO || /\bHTTP 429\b/.test(mensagem)) return "limite_de_taxa"
  if (/^preflight[ :]/.test(mensagem)) return "preflight_banco"
  if (/^checkpoint:/.test(mensagem)) return "checkpoint"
  if (/\bHTTP 40[137]\b/.test(mensagem)) return "bloqueio_http"
  if (/\bHTTP 5\d\d\b|limite de tentativas|suspenso/.test(mensagem)) return "fonte_indisponivel"
  if (nome === "TimeoutError" || /timeout|timed out|aborted/i.test(mensagem) || /TIMEOUT|TIMEDOUT/.test(codigo)) return "tempo_esgotado"
  if (/^(?:ENOTFOUND|EAI_AGAIN)$/.test(codigo) || /\bENOTFOUND\b|\bEAI_AGAIN\b/.test(mensagem)) return "dns"
  if (/^(?:ECONN|EPIPE|UND_ERR|EHOSTUNREACH|ENETUNREACH)/.test(codigo) || /fetch failed|\bECONN\w+\b|socket hang up/i.test(mensagem)) return "rede"
  if (/consulta_cand|\bTSE\b/.test(mensagem)) return "identidade_tse"
  if (erro instanceof SyntaxError || /resposta invalida|cache invalido|truncad|count inconsistente|limite paginavel|status nao final|conflito de tribunal|resposta ausente|resposta incompleta|chave publica do DataJud/i.test(mensagem)) {
    return "resposta_invalida"
  }
  if (/HTTP \d{3}/.test(mensagem)) return "fonte_indisponivel"
  if (erro instanceof TypeError || erro instanceof ReferenceError || erro instanceof RangeError || /candidato ausente no banco|nao carregado|alvos ausentes/.test(mensagem)) {
    return "erro_codigo"
  }
  return "outro"
}

type Contagem = Record<string, number>

export type DiagnosticoColeta = {
  schema_version: 1
  respostas: Record<string, Contagem>
  candidatos: Record<(typeof CLASSIFICACOES)[number], number>
  erros_candidato: Record<string, Contagem>
  fatal: { tipo: TipoFalhaColeta; fonte: string; status: number | null } | null
}

function somar(mapa: Record<string, Contagem>, chave: string, sub: string): void {
  const alvo = (mapa[chave] ??= {})
  alvo[sub] = (alvo[sub] ?? 0) + 1
}

function chaveFalhaRede(tipo: TipoFalhaColeta): string {
  return tipo === "tempo_esgotado" || tipo === "dns" ? tipo : "rede"
}

/** Acumulador em memória; gravado ao fim da coleta, com sucesso ou não. */
export class ColetorDiagnostico {
  private readonly estado: DiagnosticoColeta = {
    schema_version: 1,
    respostas: {},
    candidatos: { encontrado: 0, vazio_confirmado: 0, bloqueado: 0, erro: 0 },
    erros_candidato: {},
    fatal: null,
  }

  registrarResposta(url: string, status: number): void {
    somar(this.estado.respostas, fonteDaUrl(url), String(status))
  }

  registrarFalhaRede(url: string, erro: unknown): void {
    somar(this.estado.respostas, fonteDaUrl(url), chaveFalhaRede(classificarFalhaColeta(erro)))
  }

  registrarCandidato(classificacao: string, motivo?: string): void {
    if ((CLASSIFICACOES as readonly string[]).includes(classificacao)) {
      this.estado.candidatos[classificacao as (typeof CLASSIFICACOES)[number]] += 1
    }
    if (classificacao === "erro") {
      const erro = new Error(motivo ?? "")
      somar(this.estado.erros_candidato, classificarFalhaColeta(erro), origemDoErro(erro).fonte)
    }
  }

  registrarFatal(erro: unknown): void {
    this.estado.fatal = { tipo: classificarFalhaColeta(erro), ...origemDoErro(erro) }
  }

  paraJson(): DiagnosticoColeta {
    return structuredClone(this.estado)
  }
}

function inteiroNaoNegativo(valor: unknown): valor is number {
  return Number.isInteger(valor) && (valor as number) >= 0
}

function sanitizarContagens(bruto: unknown, chaveExterna: RegExp | readonly string[], chaveInterna: RegExp): Record<string, Contagem> {
  const saida: Record<string, Contagem> = {}
  if (!bruto || typeof bruto !== "object") return saida
  const externaOk = (k: string) => Array.isArray(chaveExterna) ? chaveExterna.includes(k) : (chaveExterna as RegExp).test(k)
  for (const [externa, interno] of Object.entries(bruto)) {
    if (!externaOk(externa) || !interno || typeof interno !== "object") continue
    for (const [interna, n] of Object.entries(interno)) {
      if (chaveInterna.test(interna) && inteiroNaoNegativo(n)) (saida[externa] ??= {})[interna] = n
    }
  }
  return saida
}

/**
 * Fronteira pública: só passa chave de allowlist e inteiro. Qualquer campo
 * novo ou texto livre que um bug colocar no arquivo bruto é descartado aqui.
 */
export function sanitizarDiagnostico(bruto: unknown): DiagnosticoColeta {
  if (!bruto || typeof bruto !== "object") throw new Error("diagnostico invalido: objeto esperado")
  const registro = bruto as Record<string, unknown>
  if (registro.schema_version !== 1) throw new Error("diagnostico invalido: schema_version 1 esperado")
  const contagemBruta = (registro.candidatos ?? {}) as Record<string, unknown>
  // coorte-atualizacao: isento (contagem agregada do diagnóstico, não seleciona fichas)
  const porClassificacao = Object.fromEntries(CLASSIFICACOES.map((c) => [c, inteiroNaoNegativo(contagemBruta[c]) ? contagemBruta[c] : 0])) as DiagnosticoColeta["candidatos"]
  const fatalBruto = registro.fatal as Record<string, unknown> | null | undefined
  const fatal = fatalBruto && typeof fatalBruto === "object"
    && (TIPOS_FALHA_COLETA as readonly string[]).includes(String(fatalBruto.tipo))
    ? {
        tipo: fatalBruto.tipo as TipoFalhaColeta,
        fonte: typeof fatalBruto.fonte === "string" && FONTE_VALIDA.test(fatalBruto.fonte) ? fatalBruto.fonte : "desconhecida",
        status: inteiroNaoNegativo(fatalBruto.status) && fatalBruto.status >= 100 && fatalBruto.status <= 599 ? fatalBruto.status : null,
      }
    : null
  return {
    schema_version: 1,
    respostas: sanitizarContagens(registro.respostas, FONTE_VALIDA, CHAVE_RESPOSTA_VALIDA),
    candidatos: porClassificacao,
    erros_candidato: sanitizarContagens(registro.erros_candidato, TIPOS_FALHA_COLETA, FONTE_VALIDA),
    fatal,
  }
}

/** Linha única para o resumo público do job. */
export function linhaResumoDiagnostico(modo: string, diagnostico: DiagnosticoColeta): string {
  const partes: string[] = []
  if (diagnostico.fatal) {
    const { tipo, fonte, status } = diagnostico.fatal
    partes.push(`fatal=${tipo} fonte=${fonte}${status ? ` status=${status}` : ""}`)
  }
  const respostas = Object.entries(diagnostico.respostas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fonte, por]) => `${fonte}{${Object.entries(por).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}:${n}`).join(",")}}`)
  if (respostas.length) partes.push(`respostas=${respostas.join(" ")}`)
  const c = diagnostico.candidatos
  partes.push(`candidatos=encontrado:${c.encontrado},vazio:${c.vazio_confirmado},bloqueado:${c.bloqueado},erro:${c.erro}`)
  const erros = Object.entries(diagnostico.erros_candidato)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tipo, por]) => `${tipo}{${Object.entries(por).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}:${n}`).join(",")}}`)
  if (erros.length) partes.push(`erros_candidato=${erros.join(" ")}`)
  return `${modo} diagnóstico: ${partes.join("; ")}`
}
