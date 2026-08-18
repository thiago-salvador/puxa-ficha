/** Grade 5x3 no plano eco x soc (1 a 10). Cada celula e mutuamente exclusiva. */

export interface QuizArquetipoDef {
  id: string
  label: string
  descricao: string
}

const GRID: QuizArquetipoDef[][] = [
  [
    {
      id: "revolucionario",
      label: "Revolucionário",
      descricao: "Estado forte, transformação social radical",
    },
    {
      id: "socialista",
      label: "Socialista",
      descricao: "Economia estatal, moderado nos costumes",
    },
    {
      id: "esquerda-conservadora",
      label: "Esquerda conservadora",
      descricao: "Estado na economia, conservador nos costumes",
    },
  ],
  [
    {
      id: "social-democrata-progressista",
      label: "Social-democrata progressista",
      descricao: "Redistribuição com direitos amplos",
    },
    {
      id: "social-democrata",
      label: "Social-democrata",
      descricao: "Centro-esquerda clássico",
    },
    {
      id: "populista-esquerda",
      label: "Populista de esquerda",
      descricao: "Redistribuição com pauta conservadora",
    },
  ],
  [
    {
      id: "centrista-progressista",
      label: "Centrista progressista",
      descricao: "Pragmático com pauta de direitos",
    },
    {
      id: "centrista",
      label: "Centrista",
      descricao: "Pragmático, sem posição fixa",
    },
    {
      id: "centro-conservador",
      label: "Centro-conservador",
      descricao: "Moderado na economia, tradicional nos costumes",
    },
  ],
  [
    {
      id: "liberal-progressista",
      label: "Liberal progressista",
      descricao: "Livre mercado com pauta de direitos",
    },
    {
      id: "liberal",
      label: "Liberal",
      descricao: "Direita econômica, moderado nos costumes",
    },
    {
      id: "conservador-liberal",
      label: "Conservador liberal",
      descricao: "Direita econômica e social",
    },
  ],
  [
    {
      id: "libertario",
      label: "Libertário",
      descricao: "Estado mínimo, liberdades individuais máximas",
    },
    {
      id: "ultra-liberal",
      label: "Ultra-liberal",
      descricao: "Mercado radical, neutro nos costumes",
    },
    {
      id: "direita-radical",
      label: "Direita radical",
      descricao: "Mercado radical, conservadorismo forte",
    },
  ],
]

function ecoRow(eco: number): number {
  if (eco <= 2) return 0
  if (eco <= 4) return 1
  if (eco <= 6) return 2
  if (eco <= 8) return 3
  return 4
}

function socCol(soc: number): number {
  if (soc <= 3) return 0
  if (soc <= 7) return 1
  return 2
}

/** Classifica posicao continua (1 a 10) na grade sem sobreposicao. */
export function classificarArquetipo(eco: number, soc: number): QuizArquetipoDef {
  const e = Math.min(10, Math.max(1, eco))
  const s = Math.min(10, Math.max(1, soc))
  return GRID[ecoRow(e)]![socCol(s)]!
}
