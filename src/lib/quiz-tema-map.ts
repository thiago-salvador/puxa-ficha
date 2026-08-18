import type { QuizEixo } from "@/data/quiz/perguntas"

/**
 * Regras heurísticas (substring) para mapear texto livre de `projetos_lei.tema`
 * a um eixo de quiz. Ordem importa: a primeira regra cujo keyword aparece em
 * `tema` normalizado vence.
 */
const TEMA_RULES: ReadonlyArray<{ keywords: ReadonlyArray<string>; eixo: QuizEixo }> = [
  { keywords: ["trabalh", "clt"], eixo: "trabalho" },
  { keywords: ["previd"], eixo: "politica_fiscal" },
  { keywords: ["tribut", "orcamento", "fiscal"], eixo: "politica_fiscal" },
  { keywords: ["econom", "privat", "eletrobras", "petrobras"], eixo: "economia" },
  { keywords: ["meio ambiente", "ambient", "clima", "agro"], eixo: "meio_ambiente" },
  { keywords: ["transparen", "corrup", "fake news"], eixo: "corrupcao" },
  { keywords: ["direito", "social", "moradia", "saude"], eixo: "direitos_sociais" },
  { keywords: ["segur", "justica", "armas", "polici"], eixo: "seguranca" },
  { keywords: ["aborto", "casamento", "religios", "costume"], eixo: "costumes" },
  { keywords: ["administracao", "ministerio"], eixo: "politica_fiscal" },
]

function normalizeTema(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Mapeia texto livre de `projetos_lei.tema` para eixo do quiz (heuristica editorial).
 */
export function mapProjetoTemaToQuizEixo(tema: string | null | undefined): QuizEixo | null {
  if (!tema) return null
  const normalized = normalizeTema(tema)
  for (const rule of TEMA_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.eixo
    }
  }
  return null
}

export function aggregatePlCountsByQuizEixo(
  plsPorTema: Record<string, number> | undefined
): Partial<Record<QuizEixo, number>> {
  const out: Partial<Record<QuizEixo, number>> = {}
  if (!plsPorTema) return out
  for (const [tema, n] of Object.entries(plsPorTema)) {
    const eixo = mapProjetoTemaToQuizEixo(tema)
    if (!eixo) continue
    out[eixo] = (out[eixo] ?? 0) + n
  }
  return out
}
