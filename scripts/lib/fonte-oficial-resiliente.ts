/**
 * Acesso resiliente às fontes oficiais da coleta judicial (DJEN, DataJud, TSE).
 *
 * O DJEN responde HTTP 500 "sistema muito ocupado" de forma intermitente, em
 * consultas frias e sem relação com o ritmo das nossas chamadas; a mesma
 * consulta passa segundos depois. O disjuntor antigo era global e travava
 * aberto para sempre: quatro 500 seguidos bastavam para recusar toda chamada
 * restante, e cada candidato seguinte virava `erro` sem sequer consultar a
 * fonte. Este módulo troca isso por:
 *
 * - estado por fonte (uma falha do DataJud não suspende o DJEN);
 * - intervalo mínimo entre chamadas da mesma fonte;
 * - nova tentativa em 429, 5xx, tempo esgotado e falha de rede, com backoff
 *   exponencial e jitter, respeitando Retry-After;
 * - orçamento de novas tentativas por fonte e por execução;
 * - suspensão da fonte quando N chamadas seguidas esgotam as tentativas ou o
 *   orçamento acaba. A suspensão é fatal para a execução (FonteSuspensaError):
 *   quem chama não deve convertê-la em `erro` por candidato, e a coleta para
 *   sem produzir evidência, deixando os recibos existentes intactos.
 */

import { fonteDaUrl } from "./diagnostico-coleta-processos"

export interface PoliticaFonte {
  /** Novas tentativas extras permitidas por chamada (além da primeira). */
  novasTentativasPorChamada: number
  /** Espera base do backoff; a n-ésima nova tentativa espera ~base * 2^n. */
  baseMs: number
  /** Teto de uma espera, inclusive a pedida por Retry-After. */
  tetoMs: number
  /** Intervalo mínimo entre o início de duas chamadas à mesma fonte. */
  intervaloMinimoMs: number
  /** Chamadas seguidas que esgotam as tentativas antes de suspender a fonte. */
  falhasSeguidasParaSuspender: number
  /** Novas tentativas somadas na execução inteira antes de suspender a fonte. */
  orcamentoNovasTentativas: number
}

export const POLITICA_PADRAO: Readonly<PoliticaFonte> = Object.freeze({
  novasTentativasPorChamada: 2,
  baseMs: 5_000,
  tetoMs: 120_000,
  intervaloMinimoMs: 0,
  falhasSeguidasParaSuspender: 3,
  orcamentoNovasTentativas: 60,
})

/**
 * DJEN: uma chamada por vez (a fila do coletor já serializa), 1 s entre
 * chamadas, até 5 novas tentativas por chamada (teto de ~5 s, 10 s, 20 s,
 * 40 s e 80 s, metade sorteada) e 900 novas tentativas por execução. Medido
 * em 30/09 à tarde: cerca de 1,4 nova tentativa por candidato, então 900
 * cobre a coorte de renovação (~325) com folga e ainda limita a carga e a
 * duração. Três chamadas seguidas sem resposta válida, depois de todas as
 * tentativas, suspendem a fonte.
 */
export const POLITICAS_POR_FONTE: Readonly<Record<string, Partial<PoliticaFonte>>> = Object.freeze({
  DJEN: { novasTentativasPorChamada: 5, intervaloMinimoMs: 1_000, orcamentoNovasTentativas: 900 },
  "DJEN:inventario": { novasTentativasPorChamada: 5, intervaloMinimoMs: 1_000 },
})

export type TipoFalhaFonte = "limite_de_taxa" | "fonte_indisponivel" | "tempo_esgotado" | "rede"

export class FonteSuspensaError extends Error {
  readonly tipoFalha: TipoFalhaFonte
  constructor(readonly fonte: string, motivo: string, tipoFalha: TipoFalhaFonte) {
    super(`fonte oficial ${fonte} suspensa nesta execucao: ${motivo}`)
    this.name = "FonteSuspensaError"
    this.tipoFalha = tipoFalha
  }
}

export function eFonteSuspensa(erro: unknown): erro is FonteSuspensaError {
  return erro instanceof FonteSuspensaError
}

/** Retry-After em segundos ou data HTTP; null quando ausente ou ilegível. */
export function retryAfterMs(retryAfter: string | null, agora = Date.now()): number | null {
  if (!retryAfter) return null
  const segundos = Number(retryAfter)
  if (Number.isFinite(segundos) && segundos >= 0) return Math.ceil(segundos * 1000)
  const data = Date.parse(retryAfter)
  if (Number.isFinite(data)) return Math.max(0, data - agora)
  return null
}

/** Espera antes de nova tentativa: respeita Retry-After (s ou data HTTP), senão 30 s, 60 s, 120 s... teto 300 s. */
export function esperaRetry(tentativa: number, retryAfter: string | null, agora = Date.now()): number {
  const teto = 300_000
  const pedido = retryAfterMs(retryAfter, agora)
  if (pedido !== null) return Math.min(teto, pedido)
  return Math.min(teto, 30_000 * 2 ** tentativa)
}

/**
 * Backoff exponencial com "equal jitter": metade fixa, metade aleatória, para
 * que chamadas atrasadas não voltem juntas. Retry-After do servidor vence o
 * cálculo, limitado ao teto.
 */
export function esperaComJitter(
  novaTentativa: number,
  retryAfter: string | null,
  politica: Pick<PoliticaFonte, "baseMs" | "tetoMs">,
  aleatorio: () => number = Math.random,
  agora = Date.now(),
): number {
  const pedido = retryAfterMs(retryAfter, agora)
  if (pedido !== null) return Math.min(politica.tetoMs, pedido)
  const exponencial = Math.min(politica.tetoMs, politica.baseMs * 2 ** novaTentativa)
  const sorteio = Math.min(1, Math.max(0, aleatorio()))
  return Math.round(exponencial / 2 + (exponencial / 2) * sorteio)
}

/**
 * Disjuntor: depois de N falhas seguidas abre; um sucesso fecha. Aqui conta
 * chamadas que esgotaram as tentativas, por fonte, não respostas isoladas.
 */
export class Disjuntor {
  private seguidas = 0
  constructor(readonly limite = 4) {}
  registrarFalha(): void { this.seguidas += 1 }
  registrarSucesso(): void { this.seguidas = 0 }
  get aberto(): boolean { return this.seguidas >= this.limite }
}

interface EstadoFonte {
  politica: PoliticaFonte
  disjuntor: Disjuntor
  novasTentativasUsadas: number
  proximaChamadaEm: number
  fila: Promise<void>
  suspensa: FonteSuspensaError | null
}

export interface DependenciasCliente {
  fetch: (url: string, init: RequestInit & { signal: AbortSignal }) => Promise<Response>
  dormir: (ms: number) => Promise<void>
  agora: () => number
  aleatorio: () => number
  politicas: Readonly<Record<string, Partial<PoliticaFonte>>>
  /** Chamado a cada espera, para log sem URL. */
  aoEsperar?: (evento: { fonte: string; status: number | string; esperaMs: number; novaTentativa: number }) => void
}

function statusRetentavel(status: number): boolean {
  return status === 429 || status >= 500
}

function falhaDeTransporte(erro: unknown): TipoFalhaFonte | null {
  if (!(erro instanceof Error)) return null
  if (erro.name === "TimeoutError" || erro.name === "AbortError" || /timeout|timed out/i.test(erro.message)) return "tempo_esgotado"
  if (erro instanceof TypeError || /fetch failed|ECONN\w+|socket hang up|EAI_AGAIN|ENOTFOUND/i.test(erro.message)) return "rede"
  return null
}

export class ClienteFontesOficiais {
  private readonly estados = new Map<string, EstadoFonte>()
  private readonly deps: DependenciasCliente

  constructor(deps: Partial<DependenciasCliente> = {}) {
    this.deps = {
      fetch: deps.fetch ?? ((url, init) => fetch(url, init)),
      dormir: deps.dormir ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      agora: deps.agora ?? Date.now,
      aleatorio: deps.aleatorio ?? Math.random,
      politicas: deps.politicas ?? POLITICAS_POR_FONTE,
      aoEsperar: deps.aoEsperar,
    }
  }

  private estado(fonte: string): EstadoFonte {
    let estado = this.estados.get(fonte)
    if (!estado) {
      const politica = { ...POLITICA_PADRAO, ...(this.deps.politicas[fonte] ?? {}) }
      estado = {
        politica,
        disjuntor: new Disjuntor(politica.falhasSeguidasParaSuspender),
        novasTentativasUsadas: 0,
        proximaChamadaEm: 0,
        fila: Promise.resolve(),
        suspensa: null,
      }
      this.estados.set(fonte, estado)
    }
    return estado
  }

  /** Estado agregado por fonte, sem URL: novas tentativas usadas e suspensão. */
  resumo(): Record<string, { novas_tentativas: number; suspensa: boolean }> {
    return Object.fromEntries([...this.estados].map(([fonte, e]) => [fonte, { novas_tentativas: e.novasTentativasUsadas, suspensa: e.suspensa !== null }]))
  }

  /** Espera a vez da fonte (intervalo mínimo entre inícios de chamada). */
  private async aguardarVez(estado: EstadoFonte): Promise<void> {
    const anterior = estado.fila
    let liberar: () => void = () => undefined
    estado.fila = new Promise<void>((resolve) => { liberar = resolve })
    await anterior
    try {
      const falta = estado.proximaChamadaEm - this.deps.agora()
      if (falta > 0) await this.deps.dormir(falta)
      estado.proximaChamadaEm = this.deps.agora() + estado.politica.intervaloMinimoMs
    } finally {
      liberar()
    }
  }

  private suspender(fonte: string, estado: EstadoFonte, motivo: string, tipo: TipoFalhaFonte): FonteSuspensaError {
    estado.suspensa ??= new FonteSuspensaError(fonte, motivo, tipo)
    return estado.suspensa
  }

  /**
   * Busca JSON com as regras da fonte. Resposta 4xx (exceto 429) falha na
   * hora, sem nova tentativa. Falha isolada de uma chamada volta como Error
   * comum ("HTTP 500 em <url>"); suspensão da fonte volta como FonteSuspensaError.
   */
  async json<T>(url: string, init: RequestInit = {}, opcoes: { novasTentativas?: number; timeoutMs?: number } = {}): Promise<T> {
    const fonte = fonteDaUrl(url)
    const estado = this.estado(fonte)
    const maxNovas = opcoes.novasTentativas ?? estado.politica.novasTentativasPorChamada
    const timeoutMs = opcoes.timeoutMs ?? 60_000
    let ultimoErro: Error = new Error(`limite de tentativas em ${url}`)
    let ultimoTipo: TipoFalhaFonte = "fonte_indisponivel"
    for (let tentativa = 0; tentativa <= maxNovas; tentativa += 1) {
      if (estado.suspensa) throw estado.suspensa
      await this.aguardarVez(estado)
      if (estado.suspensa) throw estado.suspensa
      let resposta: Response | null = null
      let retryAfter: string | null = null
      let statusRotulo: number | string
      // Relógio próprio, limpo ao fim da tentativa: AbortSignal.timeout deixaria
      // o processo vivo até o prazo vencer, mesmo com a resposta já lida.
      const controle = new AbortController()
      const relogio = setTimeout(() => controle.abort(new DOMException(`tempo esgotado em ${timeoutMs} ms`, "TimeoutError")), timeoutMs)
      try {
        try {
          resposta = await this.deps.fetch(url, { ...init, signal: controle.signal })
        } catch (erro) {
          const transporte = falhaDeTransporte(erro)
          if (!transporte) throw erro
          ultimoErro = erro instanceof Error ? erro : new Error(String(erro))
          ultimoTipo = transporte
        }
        if (resposta) {
          if (!statusRetentavel(resposta.status)) {
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url}`)
            try {
              const corpo = await resposta.json() as T
              estado.disjuntor.registrarSucesso()
              return corpo
            } catch (erro) {
              // Corte no meio do corpo é transporte (nova tentativa); JSON inválido não.
              const transporte = falhaDeTransporte(erro)
              if (!transporte || erro instanceof SyntaxError) throw erro
              ultimoErro = erro instanceof Error ? erro : new Error(String(erro))
              ultimoTipo = transporte
              statusRotulo = transporte
            }
          } else {
            ultimoErro = new Error(`HTTP ${resposta.status} em ${url}`)
            ultimoTipo = resposta.status === 429 ? "limite_de_taxa" : "fonte_indisponivel"
            retryAfter = resposta.headers.get("retry-after")
            statusRotulo = resposta.status
            // Libera o socket; o corpo do erro não é usado.
            await resposta.body?.cancel().catch(() => undefined)
          }
        } else {
          statusRotulo = ultimoTipo
        }
      } finally {
        clearTimeout(relogio)
      }
      if (tentativa === maxNovas) break
      if (estado.novasTentativasUsadas >= estado.politica.orcamentoNovasTentativas) {
        throw this.suspender(fonte, estado, `orcamento de ${estado.politica.orcamentoNovasTentativas} novas tentativas esgotado (ultimo: ${statusRotulo})`, ultimoTipo)
      }
      estado.novasTentativasUsadas += 1
      const espera = esperaComJitter(tentativa, retryAfter, estado.politica, this.deps.aleatorio, this.deps.agora())
      this.deps.aoEsperar?.({ fonte, status: statusRotulo, esperaMs: espera, novaTentativa: tentativa + 1 })
      await this.deps.dormir(espera)
    }
    estado.disjuntor.registrarFalha()
    if (estado.disjuntor.aberto) {
      throw this.suspender(fonte, estado, `${estado.politica.falhasSeguidasParaSuspender} chamadas seguidas sem resposta valida apos novas tentativas (ultimo: ${ultimoErro.message.replace(/ em https?:\/\/\S+/, "")})`, ultimoTipo)
    }
    throw ultimoErro
  }
}
