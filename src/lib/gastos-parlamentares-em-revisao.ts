/**
 * Revisão de gastos em 25/09/2026: 57 linhas em 40 fichas.
 * Valores publicados em centavos são preimages para o readback. A supressão
 * continua por ficha/ano mesmo após o recálculo, até validação independente.
 * Fonte: evidencias-privadas/coleta-fichas-2026-09-24/evidence/
 * 129-casos-dto-chave-ausente-20260925.json (SHA-256
 * 775e5af5c0bc4bd371162334ded355a5bced1c8662d215fe2962980e7e559416).
 */
export const GASTOS_PARLAMENTARES_EM_REVISAO = [
  ["alan-rick", 2023, 43926262],
  ["alan-rick", 2026, 17901910],
  ["cleitinho", 2026, 3500299],
  ["efraim-filho", 2023, 40183829],
  ["efraim-filho", 2026, 14484928],
  ["flavio-bolsonaro", 2026, 7602821],
  ["marcos-rogerio", 2026, 30287465],
  ["omar-aziz", 2026, 34696169],
  ["professora-dorinha", 2023, 28702474],
  ["professora-dorinha", 2024, 32849324],
  ["professora-dorinha", 2026, 14451150],
  ["renan-filho", 2026, 10141243],
  ["sergio-moro-gov-pr", 2023, 25837536],
  ["sergio-moro-gov-pr", 2024, 31136528],
  ["sergio-moro-gov-pr", 2026, 21843413],
  ["tse-2026-100002537338", 2026, 31204043],
  ["tse-2026-100002541459", 2023, 46140243],
  ["tse-2026-10002544274", 2026, 37009406],
  ["tse-2026-10002548046", 2015, 38669547],
  ["tse-2026-10002548050", 2026, 34245508],
  ["tse-2026-110002544986", 2026, 16794374],
  ["tse-2026-120002547434", 2026, 37086293],
  ["tse-2026-130002545590", 2023, 35924186],
  ["tse-2026-130002545590", 2024, 26194797],
  ["tse-2026-130002545590", 2026, 33579731],
  ["tse-2026-140002542691", 2011, 38987096],
  ["tse-2026-150002544905", 2026, 14150304],
  ["tse-2026-180002533967", 2023, 35843256],
  ["tse-2026-190002535142", 2026, 32968551],
  ["tse-2026-190002548141", 2015, 40727179],
  ["tse-2026-190002548141", 2019, 42609837],
  ["tse-2026-190002548141", 2023, 41814403],
  ["tse-2026-190002548141", 2025, 49793546],
  ["tse-2026-190002548141", 2026, 27120918],
  ["tse-2026-200002535507", 2026, 27160687],
  ["tse-2026-20002553727", 2026, 13812000],
  ["tse-2026-230002550794", 2023, 50060344],
  ["tse-2026-230002550794", 2024, 54896609],
  ["tse-2026-230002550794", 2025, 55432435],
  ["tse-2026-240002548632", 2026, 25295343],
  ["tse-2026-260002533084", 2026, 37917780],
  ["tse-2026-260002547285", 2023, 53140181],
  ["tse-2026-260002547285", 2024, 55972421],
  ["tse-2026-270002546333", 2026, 18141544],
  ["tse-2026-30002530069", 2026, 35585364],
  ["tse-2026-30002549909", 2026, 34980490],
  ["tse-2026-40002537344", 2023, 48112821],
  ["tse-2026-40002537344", 2024, 45419038],
  ["tse-2026-50002536317", 2026, 29430407],
  ["tse-2026-60002542479", 2026, 23347230],
  ["tse-2026-70002552492", 2026, 15566548],
  ["tse-2026-80002538202", 2024, 18031769],
  ["tse-2026-80002538202", 2026, 34549483],
  ["tse-2026-80002550187", 2026, 26839314],
  ["tse-2026-80002551368", 2011, 32801234],
  ["wellington-fagundes", 2026, 34478877],
  ["wilder-morais", 2026, 8817448],
] as const

const gastosEmRevisao = new Set<string>(
  GASTOS_PARLAMENTARES_EM_REVISAO.map(([slug, ano]) => `${slug}:${ano}`),
)
const anosEmRevisaoPorSlug = new Map<string, number[]>()
for (const [slug, ano] of GASTOS_PARLAMENTARES_EM_REVISAO) {
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
