/**
 * Validação de 27/09/2026: os pares desta quarentena foram recoletados dos
 * arquivos oficiais anuais (CSV da cota da Câmara e CEAPS do Senado, com
 * sha256 por arquivo) e saíram da lista quando a coleta publicou a linha
 * oficial. Ficam só os que a fonte oficial não confirma: nome do senador que
 * não aparece exato no CEAPS, ficha sem mandato de deputado federal (linha de
 * homônimo) e ano sem lançamento oficial para o id da ficha.
 *
 * Revisão de gastos em 25/09/2026: 57 linhas em 40 fichas.
 * Valores publicados em centavos são preimages para o readback. A supressão
 * continua por ficha/ano mesmo após o recálculo, até validação independente.
 * Fonte: evidencias-privadas/coleta-fichas-2026-09-24/evidence/
 * 129-casos-dto-chave-ausente-20260925.json (SHA-256
 * 775e5af5c0bc4bd371162334ded355a5bced1c8662d215fe2962980e7e559416).
 */
export const GASTOS_PARLAMENTARES_EM_REVISAO = [
  ["tse-2026-100002537338", 2026, 31204043],
] as const

/**
 * Varredura de 25/09/2026 sobre todas as linhas vivas de fichas públicas:
 * total fora da tolerância da fonte oficial (1% ou R$ 50, contra a API por
 * deputado com as legislaturas do ano somadas ou o CSV anual da Câmara), sem
 * lançamentos na fonte, ou sem id oficial que confira por nome e nascimento.
 * Recibo: QA/evidencias/2026-09-25-gastos-quarentena-universo/preflight.json.
 * Mesmas linhas da migration 20260925221042.
 */
export const GASTOS_PARLAMENTARES_EM_REVISAO_UNIVERSO = [
  ["dr-daniel", 2023, 19056361],
  ["dr-daniel", 2024, 15051155],
  ["dr-daniel", 2025, 1896961],
  ["jorginho-mello", 2023, 675320],
] as const

const TODOS_EM_REVISAO: readonly (readonly [string, number, number])[] = [
  ...GASTOS_PARLAMENTARES_EM_REVISAO,
  ...GASTOS_PARLAMENTARES_EM_REVISAO_UNIVERSO,
]

const gastosEmRevisao = new Set<string>(
  TODOS_EM_REVISAO.map(([slug, ano]) => `${slug}:${ano}`),
)
const anosEmRevisaoPorSlug = new Map<string, number[]>()
for (const [slug, ano] of TODOS_EM_REVISAO) {
  const anos = anosEmRevisaoPorSlug.get(slug) ?? []
  anos.push(ano)
  anosEmRevisaoPorSlug.set(slug, anos)
}

export function gastoParlamentarEmRevisao(slug: string, ano: number): boolean {
  return gastosEmRevisao.has(`${slug}:${ano}`)
}

export function anosGastosParlamentaresEmRevisao(slug: string): number[] {
  return [...(anosEmRevisaoPorSlug.get(slug) ?? [])].sort((a, b) => a - b)
}
