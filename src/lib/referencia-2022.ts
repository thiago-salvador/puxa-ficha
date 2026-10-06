/**
 * Referência do 1º turno de 2022 (Presidente, Brasil) para o hero da home.
 * O arquivo é gerado por scripts/referencia-2022-presidente.ts a partir do
 * histórico de totalização do TSE, com URL e sha256. Nenhum número é digitado.
 */
import referencia from "@/data/referencia-2022-presidente.json"

export interface Referencia2022Presidente {
  versao: 1
  ano: 2022
  cargo: "Presidente"
  turno: 1
  abrangencia: "BR"
  gerado_em: string
  fonte: {
    /** Página do conjunto no portal de dados abertos do TSE. */
    pagina: string
    url: string
    sha256: string
    arquivo: string
    sha256_arquivo: string
    totalizacao_tse: string
  }
  totais: {
    secoes: number
    secoes_totalizadas: number
    eleitorado: number
    comparecimento: number
    percentual_comparecimento: number
    abstencao: number
    percentual_abstencao: number
    brancos: number
    percentual_brancos: number
    nulos: number
    percentual_nulos: number
  }
}

const dados = referencia as Referencia2022Presidente

export function getReferencia2022(): Referencia2022Presidente {
  return dados
}

/** Diferença em pontos percentuais (atual menos 2022), com uma casa; null sem um dos lados. */
export function deltaPontos(atual: number | null | undefined, ref: number | null | undefined): number | null {
  if (atual == null || ref == null || !Number.isFinite(atual) || !Number.isFinite(ref)) return null
  // Arredonda antes do sinal: -0,04 vira 0,0 e não "-0,0".
  const d = Math.round((atual - ref) * 10) / 10
  return Object.is(d, -0) ? 0 : d
}

const UMA_CASA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** "+1,2 p.p.", "−0,8 p.p." (sinal de menos tipográfico) ou "igual" para zero. */
export function formatarDeltaPontos(delta: number): string {
  if (delta === 0) return "igual"
  return `${delta > 0 ? "+" : "−"}${UMA_CASA.format(Math.abs(delta))} p.p.`
}
