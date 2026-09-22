/**
 * Eixos temáticos do pré-filtro promessa x evidência. Determinístico e
 * multirrótulo: um texto pode cair em mais de um eixo. Serve só para reduzir
 * pares candidatos; quem decide a relação é a classificação revisada depois.
 */
import { stripAccents } from "../../src/lib/strip-accents"

export const EIXOS = [
  "saude",
  "educacao",
  "seguranca",
  "economia_fiscal",
  "trabalho_renda",
  "estatais_privatizacao",
  "meio_ambiente",
  "agro",
  "infraestrutura",
  "assistencia_direitos",
  "gestao_transparencia",
  "cultura_esporte_turismo",
  "costumes",
] as const
export type Eixo = (typeof EIXOS)[number]

/**
 * Prefixos de palavra (texto sem acento e em minúsculas). Casam no início de
 * palavra; com espaço no fim, só a palavra inteira ("sus " não casa "sustentável").
 */
const PREFIXOS: Record<Eixo, readonly string[]> = {
  saude: ["saude", "sus ", "hospita", "medic", "enferm", "vacina", "upa ", "upas ", "atencao primaria", "atencao basica", "cirurgi", "leito", "farmac", "saude mental", "especialist"],
  educacao: ["educa", "escola", "escolar", "ensino", "professor", "alfabetiz", "creche", "universidad", "estudant", "aluno", "vestibular", "pedagog"],
  seguranca: ["seguranca publica", "policia", "policial", "policiais", "crime", "crimin", "violencia", "presidio", "prisional", "penitenci", "arma de fogo", "armas ", "armamento", "trafico", "faccao", "faccoes", "homicid", "delegacia", "guarda municipal"],
  economia_fiscal: ["fiscal", "tribut", "imposto", "icms", "iptu", "orcament", "divida", "gasto", "teto de gastos", "previdenc", "arrecad", "responsabilidade fiscal", "banco central", "juros ", "inflac", "reforma tributaria", "contas publicas", "equilibrio fiscal", "incentivo fiscal"],
  trabalho_renda: ["trabalh", "emprego", "desemprego", "salari", "renda", "clt ", "jornada", "6x1", "bolsa familia", "auxilio", "transferencia de renda", "qualificacao profissional", "empreended"],
  estatais_privatizacao: ["privatiz", "estatal", "estatais", "concess", "eletrobras", "petrobras", "desestatiz", "parceria publico", "ppp ", "ppps ", "empresa publica"],
  meio_ambiente: ["ambient", "clima", "climatic", "desmat", "amazon", "florest", "sustentab", "reciclag", "bioma", "queimad", "incendio", "residuo", "licenciamento ambiental", "sociobiodivers", "biodivers", "carbono"],
  agro: ["agro", "rural", "agricult", "pecuar", "produtor rural", "fundiari", "reforma agraria", "assistencia tecnica", "safra", "irrigac"],
  infraestrutura: ["rodovi", "estrada", "transporte", "mobilidade", "ferrovi", "portuari", "aeroport", "saneamento", "abastecimento de agua", "seguranca hidrica", "energia", "habitac", "moradia", "obras", "conectividade", "internet", "pavimenta", "infraestrutura", "logistic"],
  assistencia_direitos: ["assistencia social", "pobreza", "fome", "mulher", "igualdade", "racial", "racismo", "indigena", "quilombol", "lgbt", "deficiencia", "idoso", "crianca", "adolescente", "juventude", "direitos humanos", "vulnerab", "populacao de rua", "inclusao"],
  gestao_transparencia: ["transparen", "corrup", "gestao publica", "governanca", "governo digital", "transformacao digital", "servidor", "administracao publica", "controle social", "ouvidoria", "orcamento secreto", "emenda parlamentar", "emendas parlamentares", "painel publico", "planejamento", "regionaliz", "reforma administrativa", "desburocrat"],
  cultura_esporte_turismo: ["cultura", "cultural", "esporte", "turismo", "lazer", "patrimonio historico"],
  costumes: ["aborto", "casamento", "religi", "ideologia de genero", "identidade de genero", "drogas", "maconha", "escola sem partido"],
}

/** Tema já canônico no banco (votações, posições do quiz) para eixo. */
const TEMA_CANONICO: Record<string, readonly Eixo[]> = {
  reforma_trabalhista: ["trabalho_renda"],
  trabalho: ["trabalho_renda"],
  previdencia: ["economia_fiscal"],
  teto_gastos: ["economia_fiscal"],
  politica_fiscal: ["economia_fiscal"],
  autonomia_bc: ["economia_fiscal"],
  economia: ["economia_fiscal"],
  transferencia_renda: ["trabalho_renda", "assistencia_direitos"],
  privatizacao_eletrobras: ["estatais_privatizacao"],
  orcamento_secreto: ["gestao_transparencia"],
  institucional: ["gestao_transparencia"],
  transparencia: ["gestao_transparencia"],
  administracao_publica: ["gestao_transparencia"],
  meio_ambiente: ["meio_ambiente"],
  agronegocio: ["agro"],
  seguranca: ["seguranca"],
  justica: ["seguranca"],
  direitos_sociais: ["assistencia_direitos"],
  social: ["assistencia_direitos"],
  educacao: ["educacao"],
  costumes: ["costumes"],
}

export function normalizarTextoEixo(texto: string): string {
  return ` ${stripAccents(texto).toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim()} `
}

export function eixosDoTexto(...textos: Array<string | null | undefined>): Set<Eixo> {
  const normalizado = normalizarTextoEixo(textos.filter(Boolean).join(" "))
  const eixos = new Set<Eixo>()
  for (const eixo of EIXOS) {
    if (PREFIXOS[eixo].some((prefixo) => normalizado.includes(` ${prefixo}`))) eixos.add(eixo)
  }
  return eixos
}

export function eixosDoTemaCanonico(tema: string | null | undefined): Set<Eixo> {
  if (!tema) return new Set()
  const chave = stripAccents(tema).toLowerCase().trim().replace(/\s+/gu, "_")
  return new Set(TEMA_CANONICO[chave] ?? [])
}

export function intersecao(a: ReadonlySet<Eixo>, b: ReadonlySet<Eixo>): Eixo[] {
  return EIXOS.filter((eixo) => a.has(eixo) && b.has(eixo))
}
