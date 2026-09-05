import type { PontoAtencao } from "@/lib/types"

/**
 * Espelho TypeScript dos gates SQL de `pontos_atencao`.
 *
 * Fonte de verdade:
 * - `supabase/migrations/20260403234500_gate_unverified_ai_attention_points.sql`
 *   (gate original, assinatura de 3 argumentos)
 * - `supabase/migrations/20260725160000_gate_gravidade_fonte_pontos_atencao.sql`
 *   (gate por gravidade, validação de URL e gate de escrita)
 *
 * RLS em `pontos_atencao` e agregados em `v_ficha_candidato` / `v_comparador`
 * dependem dessa semântica. Divergência aqui significa que `api.ts` mostra
 * coisa que o banco esconde, ou o contrário.
 */

/** Gravidades em que uma afirmação errada causa dano relevante. */
export const GRAVIDADES_QUE_EXIGEM_FONTE = ["critica", "alta"] as const

/**
 * Espelha `public.fonte_url_tem_caminho(text)`.
 *
 * Domínio nu (`https://g1.globo.com/`) não é fonte: não aponta para a matéria
 * que sustenta a afirmação. Achado A2 da auditoria de 2026-07-24.
 */
export function fonteUrlTemCaminho(url: unknown): boolean {
  if (typeof url !== "string") return false
  return /^https?:\/\/[^/?#\s]+\/[^/?#\s]/.test(url.trim())
}

/**
 * Espelha `public.fonte_url_e_raiz_de_aplicacao(text)`.
 *
 * Ter caminho não é o mesmo que apontar para um documento.
 * `https://divulgacandcontas.tse.jus.br/divulga/` tem caminho, passa no regex
 * acima, responde HTTP 200 e entrega 46 caracteres: é a raiz do SPA do TSE,
 * não a consulta de nenhum candidato. Achado da etapa 5B da auditoria de
 * 2026-07-24.
 *
 * O critério é de FORMA, não de rede: um único segmento de caminho, só letras,
 * curto, com ou sem barra final. Isso pega raiz de portal (`/divulga/`,
 * `/legisla/`) sem pegar slug de matéria, que é longo e tem hífen
 * (`/denuncia-do-mp-contra-ciro-gomes.../`). Rodado contra as fontes em
 * produção em 2026-07-25: 3 URLs casam, todas realmente raízes de portal, e
 * nenhuma matéria é atingida.
 *
 * Fragmento é descartado antes da avaliação de propósito. Rota de SPA em hash
 * (`/divulga/#/candidato/2022/...`) é servida pela mesma casca vazia da raiz,
 * então merece o mesmo veredito.
 */
export function fonteUrlEhRaizDeAplicacao(url: unknown): boolean {
  if (typeof url !== "string") return false
  const semFragmento = url.trim().split("#")[0]!.split("?")[0]!
  const caminho = semFragmento.replace(/^https?:\/\/[^/]+/i, "")
  return /^\/[A-Za-z]{2,20}\/?$/.test(caminho)
}

/**
 * Espelha `public.fonte_url_aponta_para_documento(text)`. Critério único usado
 * pelos dois gates: tem caminho E não é raiz de aplicação.
 */
export function fonteUrlApontaParaDocumento(url: unknown): boolean {
  return fonteUrlTemCaminho(url) && !fonteUrlEhRaizDeAplicacao(url)
}

function fontesArray(fontes: unknown): unknown[] {
  return Array.isArray(fontes) ? fontes : []
}

function urlDaFonte(fonte: unknown): unknown {
  if (!fonte || typeof fonte !== "object") return undefined
  return (fonte as { url?: unknown }).url
}

/**
 * Espelha `public.pontos_atencao_tem_fonte_com_caminho(jsonb)`.
 * Critério do gate de LEITURA: basta uma fonte utilizável.
 *
 * "Utilizável" endureceu na etapa 5B: além de ter caminho, a URL precisa
 * apontar para um documento, e não para a raiz de um portal.
 */
export function temFonteComCaminho(fontes: unknown): boolean {
  return fontesArray(fontes).some((fonte) => fonteUrlApontaParaDocumento(urlDaFonte(fonte)))
}

/**
 * Espelha `public.ponto_atencao_fonte_conforme(text, jsonb)`.
 * Critério do gate de ESCRITA, mais duro que o de leitura: gravidade crítica
 * ou alta exige pelo menos uma fonte e nenhuma URL sem caminho.
 */
export function fonteConforme(gravidade: unknown, fontes: unknown): boolean {
  const severidade = typeof gravidade === "string" ? gravidade : "media"
  if (!(GRAVIDADES_QUE_EXIGEM_FONTE as readonly string[]).includes(severidade)) return true

  const lista = fontesArray(fontes)
  if (lista.length === 0) return false
  return lista.every((fonte) => fonteUrlApontaParaDocumento(urlDaFonte(fonte)))
}

/**
 * Motivo legível de recusa, ou `null` quando a linha é conforme. Espelha as
 * mensagens de `public.pontos_atencao_exige_fonte()` para que script e banco
 * digam a mesma coisa quando bloqueiam a mesma gravação.
 */
export function motivoRecusaDeFonte(gravidade: unknown, fontes: unknown): string | null {
  if (fonteConforme(gravidade, fontes)) return null

  const lista = fontesArray(fontes)
  if (lista.length === 0) return "nenhuma fonte preenchida"

  const rotulo = (url: unknown) =>
    typeof url === "string" && url.trim() !== "" ? url.trim() : "(sem url)"

  const urls = lista.map((fonte) => urlDaFonte(fonte))
  const semCaminho = urls.filter((url) => !fonteUrlTemCaminho(url)).map(rotulo)
  const raizes = urls
    .filter((url) => fonteUrlTemCaminho(url) && fonteUrlEhRaizDeAplicacao(url))
    .map(rotulo)

  const partes: string[] = []
  if (semCaminho.length > 0) partes.push(`fonte com URL sem caminho (dominio nu): ${semCaminho.join(", ")}`)
  if (raizes.length > 0) partes.push(`fonte que aponta para a raiz de um portal, nao para um documento: ${raizes.join(", ")}`)

  return partes.join("; ")
}

/** Gate editorial SQL mais a barreira de despublicação da policy RLS. */
export function isPublicAttentionPoint(
  ponto: Pick<PontoAtencao, "visivel" | "gerado_por" | "verificado"> & {
    gravidade?: unknown
    fontes?: unknown
    despublicado_em?: unknown
  },
): boolean {
  if (ponto.despublicado_em != null) return false
  return isPublicAttentionPointFields(
    ponto.visivel,
    ponto.gerado_por,
    ponto.verificado,
    ponto.gravidade,
    ponto.fontes,
  )
}

/**
 * Assinatura de campos. `gravidade` e `fontes` são opcionais só para não
 * quebrar chamador que ainda não os tem em mãos; omitir os dois reproduz o
 * gate antigo de 3 argumentos, que deixa passar claim crítica sem fonte.
 */
export function isPublicAttentionPointFields(
  visivel: boolean | null | undefined,
  geradoPor: string | null | undefined,
  verificado: boolean | null | undefined,
  gravidade?: unknown,
  fontes?: unknown,
): boolean {
  const visible = visivel === true
  const generatedBy = geradoPor ?? "curadoria"
  const verified = verificado === true

  const gateAntigo = visible && (generatedBy !== "ia" || verified)
  if (!gateAntigo) return false

  if (gravidade === undefined) return true

  const severidade = typeof gravidade === "string" ? gravidade : "media"
  if (!(GRAVIDADES_QUE_EXIGEM_FONTE as readonly string[]).includes(severidade)) return true

  return verified && temFonteComCaminho(fontes)
}
