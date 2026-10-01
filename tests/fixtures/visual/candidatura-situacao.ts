/** Ensaio local da issue #646: somente os campos eleitorais vêm da evidência TSE. */
import sources from "../../../docs/operations/evidence/issue-646/issue-646-situacao-fontes-20261001.json"
import { planCandidaturaSituacao, type SituacaoOficialCandidatura } from "../../../scripts/lib/candidatura-situacao-reconciliacao"
import type { FichaCandidato } from "../../../src/lib/types"

export const situacaoFixtureCases = [
  { sq: "260002549466", nome: "Ricardo Marques", cargo: "Governador", uf: "SE", before: "deferido" },
  { sq: "180002544457", nome: "Major Paulo Roberto", cargo: "Senador", uf: "PI", before: "indeferido com recurso" },
  { sq: "180002544459", nome: "Toinho Dufrango", cargo: "Senador", uf: "PI", before: "indeferido com recurso" },
] as const

export function candidaturaSituacaoFixture(slug: string): FichaCandidato | null {
  const candidate = situacaoFixtureCases.find(row => slug === `fixture-646-${row.sq}`)
  if (!candidate) return null
  const id = `fixture-646-${candidate.sq}`
  const before = {
    id, slug, sq_candidato_2026: candidate.sq, cargo_disputado: candidate.cargo,
    estado: candidate.uf, situacao_candidatura: candidate.before,
    status: "candidato", publicavel: true, verificacao_campos: null,
  }
  const plan = planCandidaturaSituacao(before, sources as SituacaoOficialCandidatura[])
  if (!plan.after) throw new Error(`Plano da fixture bloqueado: ${plan.reasons.join(", ")}`)
  return {
    id, slug, nome_urna: `${candidate.nome} (ensaio local)`, nome_completo: candidate.nome,
    cargo_disputado: candidate.cargo, estado: candidate.uf, status: "candidato",
    situacao_candidatura: plan.after.situacao_candidatura ?? candidate.before,
    verificacao_campos: plan.after.verificacao_campos as FichaCandidato["verificacao_campos"],
    data_nascimento: null, idade: null, naturalidade: null, formacao: null,
    profissao_declarada: null, partido_atual: "", partido_sigla: "", cargo_atual: null,
    foto_url: null, site_campanha: null, redes_sociais: {}, fonte_dados: [],
    ultima_atualizacao: "2026-10-01T19:12:48.222Z",
    historico: [], mudancas_partido: [], patrimonio: [], financiamento: [], votos: [],
    processos: [], pontos_atencao: [], projetos_lei: [], legislacao_mandato_executivo: [],
    gastos_parlamentares: [], gastos_executivo: [], sancoes_administrativas: [], noticias: [],
    total_processos: 0, processos_criminais: 0, total_mudancas_partido: 0,
    total_pontos_atencao: 0, pontos_criticos: 0, total_sancoes: 0,
  }
}
