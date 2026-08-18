/**
 * Classificacao editorial de doadores (TSE) por setor, para o sinal de financiamento no quiz.
 * Versao bumpada quando regras ou eixos mudarem (metodologia deve citar a versao).
 */
export const QUIZ_FINANCIAMENTO_REGRAS_VERSION = 1

/** Setores com perfil aproximado nos eixos 1-10 (mesma escala do espectro partidario do quiz). */
export type QuizDoadorSetor =
  | "agro"
  | "financeiro"
  | "industria"
  | "sindical"
  | "setor_publico"
  | "religioso"
  | "midia_tecnologia"
  | "comercio_servicos"
  | "pj_generico"
  | "pf"
  | "nao_classificado"

export const QUIZ_DOADOR_SETOR_EIXOS: Record<Exclude<QuizDoadorSetor, "nao_classificado">, { eco: number; soc: number }> =
  {
    agro: { eco: 7.5, soc: 7 },
    financeiro: { eco: 8.5, soc: 5.5 },
    industria: { eco: 7, soc: 5 },
    sindical: { eco: 3, soc: 3 },
    setor_publico: { eco: 3.5, soc: 4.5 },
    religioso: { eco: 6, soc: 8 },
    midia_tecnologia: { eco: 7, soc: 4 },
    comercio_servicos: { eco: 6.5, soc: 5 },
    pj_generico: { eco: 6.5, soc: 5.5 },
    pf: { eco: 5.5, soc: 5.5 },
  }

type Rule = { setor: Exclude<QuizDoadorSetor, "nao_classificado">; p: RegExp }

const RULES: Rule[] = [
  { setor: "sindical", p: /sindicat|cut\b|for[cç]a sindical|trabalhador/i },
  { setor: "setor_publico", p: /municip|estado\b|secretari|minist[eé]ri|prefeit|govern|fundeb|fundac[aã]o/i },
  { setor: "agro", p: /agro|pecu[aá]ri|rural|agr[ií]cola|cafe|caf[eé]|soja|fazenda|cooperativa ag/i },
  { setor: "financeiro", p: /banco|cr[eé]dit|invest|financeir|fintech|segur|capital|asset/i },
  { setor: "industria", p: /ind[uú]stria|metal|sider|qu[ií]mic|manufat|automot|energia/i },
  { setor: "religioso", p: /igreja|deus|evang[eé]l|cat[oó]lic|religi/i },
  { setor: "midia_tecnologia", p: /comunica|m[ií]dia|tecnolog|software|internet|digital|telecom/i },
  { setor: "comercio_servicos", p: /com[eé]rcio|varejo|distribu|transporte|log[ií]st|servi[cç]o/i },
]

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function classifyDoadorNomeTipo(nome: string, tipo: string | null | undefined): QuizDoadorSetor {
  const t = norm(tipo ?? "")
  if (t === "pf" || t.includes("fisica") || t.includes("física")) return "pf"
  const n = norm(nome)
  if (!n) return "nao_classificado"
  for (const r of RULES) {
    if (r.p.test(n)) return r.setor
  }
  if (t === "pj" || t.includes("jurid")) return "pj_generico"
  return "nao_classificado"
}
