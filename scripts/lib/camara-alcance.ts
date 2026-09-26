/**
 * Pré-voo de alcance da API de Dados Abertos da Câmara.
 *
 * Em 26/09/2026 dois runs do `ingest.yml` (36215277830 e 36248805025) morreram
 * no teto de 90 min com `fetch failed` em quase todas as fichas, ~100 s cada:
 * 5 tentativas de conexão de 10 s mais a escada de espera de `fetchJSON`. O
 * diagnóstico no runner hospedado do GitHub mediu 0 de 96 conexões TCP na porta
 * 443 dos três IPs da Câmara (`UND_ERR_CONNECT_TIMEOUT`), enquanto Senado e
 * Google respondiam 200 do mesmo runner e a mesma API respondia em 0,2 s fora
 * dele. O bloqueio é de rede, anterior ao TLS: User-Agent, pausa e
 * concorrência não mudam nada.
 *
 * Sem este pré-voo, cada ficha repete a descoberta sozinha e o job gasta o teto
 * inteiro para produzir os mesmos recibos de erro. Com ele, uma sonda curta
 * decide antes do laço: se a origem não aceita conexão, toda ficha elegível
 * recebe o mesmo erro, com o código de rede, e o `coleta_log` recebe um recibo
 * `erro` por ficha, como já recebia. Nenhuma escrita de dado acontece.
 */
import { comCausaDeRede, fetchJSON, type FetchRelogio } from "./helpers"
import type { IngestResult } from "./types"

export const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"

/** Endpoint mínimo: 1 deputado, poucos bytes, mesma origem e porta do ingest. */
export const CAMARA_SONDA_URL = `${CAMARA_API}/deputados?itens=1`

/**
 * 3 tentativas de 15 s com a escada 2 s e 6 s: pior caso ~53 s. Cobre soluço
 * curto da origem e custa menos que uma única ficha no modo atual (~100 s).
 */
const SONDA_TENTATIVAS = 3
const SONDA_TIMEOUT_MS = 15_000

export type AlcanceCamara = { ok: true } | { ok: false; motivo: string }

export async function sondarAlcanceCamara(
  options: { relogio?: FetchRelogio; url?: string } = {},
): Promise<AlcanceCamara> {
  try {
    await fetchJSON<unknown>(options.url ?? CAMARA_SONDA_URL, undefined, SONDA_TENTATIVAS, SONDA_TIMEOUT_MS, {
      relogio: options.relogio,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, motivo: comCausaDeRede(err).message }
  }
}

/**
 * Resultado de uma ficha que não foi tentada porque a origem não aceita conexão.
 * O formato é o de uma ficha que falhou dentro do laço, então
 * `registrarColetaDeResultados` grava o mesmo recibo `erro` e o limiar por
 * fonte de `ingest-all` reprova o job do mesmo jeito. Ficha com acervo
 * congelado não passa por aqui: o laço a pula antes, sem rede, como sempre.
 */
export function resultadoSemAlcance(slug: string, motivo: string): IngestResult {
  return {
    source: "camara",
    candidato: slug,
    tables_updated: [],
    rows_upserted: 0,
    errors: [
      `API da Camara inalcancavel deste runner (${motivo}); ficha nao tentada. ` +
        `Ver docs/operations/ingest-camara-runner.md`,
    ],
    duration_ms: 0,
  }
}
