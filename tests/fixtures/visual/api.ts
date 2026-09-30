// Fixture exclusivamente do build E2E. Pessoas fictícias, sem PII ou dado real.
// A configuração normal nunca resolve @/lib/api para este módulo.
export * from "../../../src/lib/api"
import type { Candidato, CandidatoComparavel, FichaCandidato } from "../../../src/lib/types"
import type { QuizAlignmentDataset } from "../../../src/lib/quiz-types"
import { liveResource } from "../../../src/lib/data-resource"
import { isSenadoEnabled } from "../../../src/lib/senado-feature"
import { buildGlobalSearchIndexItems } from "../../../src/lib/global-search"
import { getFasesEleitorais2026 as loadDatabasePhases } from "../../../src/lib/api"
import type { FaseEleitoralPublica } from "../../../src/lib/fase-eleitoral-publica"

function candidate(slug: string, nome: string, cargo: Candidato["cargo_disputado"], estado: string | null): Candidato {
  return {
    id: slug, slug, nome_completo: nome, nome_urna: nome,
    data_nascimento: null, idade: null, naturalidade: null, formacao: null,
    profissao_declarada: null, partido_atual: "Partido dos Trabalhadores", partido_sigla: "PT",
    cargo_atual: null, cargo_disputado: cargo, estado, status: "candidato",
    foto_url: null, site_campanha: null, redes_sociais: {}, fonte_dados: ["Fixture E2E"],
    ultima_atualizacao: "2026-09-05T00:00:00Z", biografia: "Pessoa fictícia para teste automatizado. Não representa uma candidatura real.",
  }
}
const candidates = [
  candidate("fixture-alfa", "Pessoa Alfa", "Presidente", null),
  candidate("fixture-beta", "Pessoa Beta", "Presidente", null),
  candidate("fixture-gama", "Pessoa Gama", "Governador", "SP"),
  candidate("fixture-delta", "Pessoa Delta", "Governador", "SP"),
  candidate("fixture-senado-alfa", "Fixture Senadora Alfa", "Senador", "SP"),
  candidate("fixture-senado-beta", "Fixture Senador Beta", "Senador", "SP"),
  candidate("fixture-senado-erro", "Fixture Senador Erro", "Senador", "RJ"),
]
export async function getFasesEleitorais2026(): Promise<FaseEleitoralPublica[]> {
  return process.env.SUPABASE_URL === "http://127.0.0.1:54331" ? loadDatabasePhases() : []
}
async function select(cargo?: string, estado?: string) {
  const fases = await getFasesEleitorais2026()
  const bySlug = new Map(fases.map(f => [f.slug, f]))
  const all = process.env.SUPABASE_URL === "http://127.0.0.1:54331" ? [...candidates,
    candidate("fixture-pres-fora", "Pessoa Zeta", "Presidente", null),
    candidate("fixture-gov-eleito", "Pessoa Épsilon", "Governador", "MG"),
    candidate("fixture-gov-fora", "Pessoa Ômega", "Governador", "MG"),
    candidate("fixture-senado-fora", "Fixture Senado Zeta", "Senador", "SP"),
  ] : candidates
  return all.map(row => {
    const fase = bySlug.get(row.slug)
    return fase ? { ...row, id: fase.candidato_id, fase_eleitoral_2026: fase } : row
  }).filter((row) =>
    (!cargo || row.cargo_disputado === cargo) &&
    (!estado || row.estado === estado.toUpperCase()) &&
    (isSenadoEnabled() || row.cargo_disputado !== "Senador"),
  )
}
export async function getCandidatosResource(cargo?: string, estado?: string) { return liveResource(await select(cargo, estado)) }
export async function getCandidatoNavResource(cargo?: string, estado?: string) { return liveResource((await select(cargo, estado)).map(({ slug, nome_urna }) => ({ slug, nome_urna }))) }
export async function getCandidatoSlugStaticParams() { return (await select()).map(({ slug }) => ({ slug })) }
export async function getGlobalSearchIndexResource() {
  return liveResource(buildGlobalSearchIndexItems(await select(), new Map()))
}
export async function getCandidatoMetadataResource(slug: string) { return liveResource((await select()).find((row) => row.slug === slug) ?? null) }
export async function getCandidatosComResumoResource(cargo?: string, estado?: string) {
  return liveResource((await select(cargo, estado)).map((candidato) => ({ candidato, processos_ordenacao: 0, patrimonio: null, patrimonio_atipico: false, processos: 0, pontos_atencao: 0 })))
}
export async function getCandidatosComparaveisResource(cargo?: string, estado?: string) {
  const rows: CandidatoComparavel[] = (await select(cargo, estado)).map((c) => ({
    ...c, total_processos: 0, mudancas_partido: 0, alertas_graves: 0, patrimonio_declarado: null,
    evolucao_patrimonial_pct: null, total_gasto_parlamentar: null, tem_historico_legislativo: false,
  }))
  return liveResource(rows)
}
export async function getCandidatoBySlugResource(slug: string) {
  const candidate = (await select()).find((row) => row.slug === slug)
  const ficha: FichaCandidato | null = candidate ? {
    ...candidate, historico: [], mudancas_partido: [], patrimonio: [], financiamento: [], votos: [],
    processos: [], pontos_atencao: [], projetos_lei: [], legislacao_mandato_executivo: [],
    gastos_parlamentares: [], gastos_executivo: [], sancoes_administrativas: [], noticias: [],
    total_processos: 0, processos_criminais: 0, total_mudancas_partido: 0,
    total_pontos_atencao: 0, pontos_criticos: 0, total_sancoes: 0,
  } : null
  return liveResource(ficha)
}
export async function getQuizAlignmentDatasetResource(cargo?: string, estado?: string) {
  const dataset: QuizAlignmentDataset = {
    candidatos: (await select(cargo || "Presidente", estado)).map((c) => ({ ...c, votos: {} })),
    votacoes_mapeadas: [], votacao_titulo_to_id: {}, votacao_fonte_por_titulo: {},
  }
  return liveResource(dataset)
}
