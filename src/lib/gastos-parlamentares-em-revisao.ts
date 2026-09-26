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

/**
 * Varredura de 25/09/2026 sobre todas as linhas vivas de fichas públicas:
 * total fora da tolerância da fonte oficial (1% ou R$ 50, contra a API por
 * deputado com as legislaturas do ano somadas ou o CSV anual da Câmara), sem
 * lançamentos na fonte, ou sem id oficial que confira por nome e nascimento.
 * Recibo: QA/evidencias/2026-09-25-gastos-quarentena-universo/preflight.json.
 * Mesmas linhas da migration 20260925221042.
 */
export const GASTOS_PARLAMENTARES_EM_REVISAO_UNIVERSO = [
  ["aecio-neves", 2023, 45384528],
  ["daniel-vilela", 2019, 2695],
  ["delegado-eder-mauro", 2023, 55774496],
  ["delegado-eder-mauro", 2026, 25814433],
  ["dr-daniel", 2023, 19056361],
  ["dr-daniel", 2024, 15051155],
  ["dr-daniel", 2025, 1896961],
  ["dr-fernando-maximo", 2023, 57552541],
  ["dr-fernando-maximo", 2024, 57693920],
  ["dr-fernando-maximo", 2025, 58199399],
  ["expedito-netto", 2023, 42502],
  ["guilherme-derrite", 2026, 23078191],
  ["helder-salomao", 2023, 29787708],
  ["helder-salomao", 2026, 24870957],
  ["joao-rodrigues", 2019, 17447],
  ["joao-roma", 2023, 2222216],
  ["jorginho-mello", 2023, 675320],
  ["luciano-zucco", 2023, 26353307],
  ["luciano-zucco", 2024, 41309307],
  ["luciano-zucco", 2025, 48152928],
  ["luciano-zucco", 2026, 12341759],
  ["patrus-ananias", 2025, 49618645],
  ["patrus-ananias", 2026, 26954948],
  ["ronaldo-caiado", 2009, 16958688],
  ["ronaldo-caiado", 2010, 19231125],
  ["ronaldo-caiado", 2011, 25735925],
  ["ronaldo-caiado", 2012, 23453967],
  ["ronaldo-caiado", 2013, 30832583],
  ["ronaldo-caiado", 2014, 31204870],
  ["sandro-alex", 2023, 11324870],
  ["tse-2026-10002533895", 2023, 4366512],
  ["tse-2026-10002548050", 2015, 698850],
  ["tse-2026-120002547435", 2026, 36912771],
  ["tse-2026-130002551786", 2026, 32288433],
  ["tse-2026-140002538404", 2023, 25035365],
  ["tse-2026-140002538404", 2026, 34268750],
  ["tse-2026-160002547660", 2023, 52656478],
  ["tse-2026-160002547660", 2026, 28697827],
  ["tse-2026-170002539456", 2019, 3608381],
  ["tse-2026-170002539456", 2026, 31722775],
  ["tse-2026-170002552097", 2023, 39003696],
  ["tse-2026-170002552097", 2026, 39480353],
  ["tse-2026-170002552102", 2026, 40603213],
  ["tse-2026-180002533964", 2026, 23975343],
  ["tse-2026-190002542888", 2023, 46292934],
  ["tse-2026-190002542888", 2026, 34046324],
  ["tse-2026-20002553272", 2025, 37765099],
  ["tse-2026-20002553272", 2026, 18330574],
  ["tse-2026-210002547816", 2026, 37187206],
  ["tse-2026-210002547819", 2023, 24214050],
  ["tse-2026-210002547819", 2026, 21924871],
  ["tse-2026-230002534804", 2023, 56553183],
  ["tse-2026-230002534804", 2026, 35281839],
  ["tse-2026-250002532794", 2026, 33981133],
  ["tse-2026-250002551501", 2026, 16634512],
  ["tse-2026-260002551362", 2026, 23995076],
  ["tse-2026-270002548344", 2026, 38012961],
  ["tse-2026-270002548409", 2023, 46912686],
  ["tse-2026-30002549911", 2025, 56635933],
  ["tse-2026-30002549911", 2026, 36407631],
  ["tse-2026-40002542686", 2023, 40363516],
  ["tse-2026-40002542686", 2026, 26675670],
  ["tse-2026-70002552934", 2023, 35511203],
  ["tse-2026-70002553751", 2019, 2050000],
  ["tse-2026-80002553265", 2026, 35977935],
  ["tse-2026-90002546974", 2023, 37440648],
  ["vicentinho-junior", 2023, 49506764],
  ["vicentinho-junior", 2025, 23701701],
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
