import type { QuizEixo } from "@/data/quiz/perguntas"

const NORMALIZE = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

/**
 * Mapeia texto livre de `projetos_lei.tema` para eixo do quiz (heuristica editorial).
 */
export function mapProjetoTemaToQuizEixo(tema: string | null | undefined): QuizEixo | null {
  if (!tema) return null
  const n = NORMALIZE(tema)
  if (n.includes("trabalh") || n.includes("clt")) return "trabalho"
  if (n.includes("previd")) return "politica_fiscal"
  if (n.includes("tribut") || n.includes("orcamento") || n.includes("fiscal")) return "politica_fiscal"
  if (n.includes("econom") || n.includes("privat") || n.includes("eletrobras") || n.includes("petrobras"))
    return "economia"
  if (n.includes("meio ambiente") || n.includes("ambient") || n.includes("clima") || n.includes("agro"))
    return "meio_ambiente"
  if (n.includes("transparen") || n.includes("corrup") || n.includes("fake news")) return "corrupcao"
  if (n.includes("direito") || n.includes("social") || n.includes("moradia") || n.includes("saude"))
    return "direitos_sociais"
  if (n.includes("segur") || n.includes("justica") || n.includes("armas") || n.includes("polici"))
    return "seguranca"
  if (n.includes("aborto") || n.includes("casamento") || n.includes("religios") || n.includes("costume"))
    return "costumes"
  if (n.includes("administracao") || n.includes("ministerio")) return "politica_fiscal"
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
