// Dados da home do arquivo: o resultado oficial do 2º turno e os números do
// projeto. Os dois JSON saem de scripts (scripts/arquivo/resultado-2turno.ts e
// scripts/arquivo/numeros-arquivo.ts); nada aqui é digitado à mão.
import resultados2Turno from "@/data/resultados-2turno-2026.json"
import numerosArquivo from "@/data/numeros-arquivo-2026.json"

export interface CandidatoFinal2Turno {
  sq: string
  slug: string
  /** Nome completo como o TSE publica. */
  nome: string
  nome_urna: string
  partido: string
  votos: number | null
  percentual_validos: number | null
  eleito: boolean
}

export interface DisputaFinal2Turno {
  cargo: string
  uf: string
  fonte: { url: string; sha256: string; gerado_tse: string }
  /** Totais do boletim do TSE; ausentes num arquivo antigo. */
  totais?: { votos_validos: number; comparecimento: number; eleitorado: number }
  candidatos: CandidatoFinal2Turno[]
}

export interface Resultado2Turno {
  status: string
  data_eleicao: string
  disputas: DisputaFinal2Turno[]
}

export type NumerosArquivo = typeof numerosArquivo

export function getResultado2Turno(): Resultado2Turno {
  return resultados2Turno as Resultado2Turno
}

export function getNumerosArquivo(): NumerosArquivo {
  return numerosArquivo
}

/** A disputa do cargo, com o eleito primeiro; null se o arquivo não a tiver. */
export function disputaFinal(
  resultado: Resultado2Turno,
  cargo: string,
  uf: string,
): { eleito: CandidatoFinal2Turno; derrotado: CandidatoFinal2Turno; fonte: DisputaFinal2Turno["fonte"]; totais: DisputaFinal2Turno["totais"] } | null {
  // Cargo e UF comparam sem caixa: "PRESIDENTE"/"br" acham a mesma disputa.
  const disputa = resultado.disputas.find((d) => d.cargo.toLowerCase() === cargo.toLowerCase() && d.uf.toUpperCase() === uf.toUpperCase())
  const eleito = disputa?.candidatos.find((c) => c.eleito)
  const derrotado = disputa?.candidatos.find((c) => !c.eleito)
  return disputa && eleito && derrotado ? { eleito, derrotado, fonte: disputa.fonte, totais: disputa.totais } : null
}

export interface Numero2Turno {
  id: "comparecimento" | "abstencao" | "diferenca" | "governadores"
  valor: string
  rotulo: string
}

const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Faixa "2º turno em números": comparecimento e abstenção do boletim, diferença de votos e governadores eleitos. */
export function numeros2Turno(resultado: Resultado2Turno): Numero2Turno[] {
  const presidente = disputaFinal(resultado, "Presidente", "BR")
  if (!presidente) return []
  const numeros: Numero2Turno[] = []
  const { totais, eleito, derrotado } = presidente
  if (totais && totais.eleitorado > 0) {
    numeros.push({ id: "comparecimento", valor: `${PERCENTUAL.format((totais.comparecimento / totais.eleitorado) * 100)}%`, rotulo: "comparecimento" })
    numeros.push({ id: "abstencao", valor: `${PERCENTUAL.format(((totais.eleitorado - totais.comparecimento) / totais.eleitorado) * 100)}%`, rotulo: "abstenção" })
  }
  if (eleito.votos !== null && derrotado.votos !== null) {
    numeros.push({ id: "diferenca", valor: formatarInteiro(eleito.votos - derrotado.votos), rotulo: "votos de diferença" })
  }
  const governadores = resultado.disputas.filter((d) => d.cargo === "Governador").length
  if (governadores > 0) numeros.push({ id: "governadores", valor: String(governadores), rotulo: "governadores eleitos no 2º turno" })
  return numeros
}

const INTEIRO = new Intl.NumberFormat("pt-BR")
export function formatarInteiro(valor: number): string {
  return INTEIRO.format(valor)
}

/** Dias de `inicio` a `fim` (AAAA-MM-DD), contando os dois. */
export function diasEntre(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1
}

/** "25/10/2026 23:27:02" do TSE vira "25/10/2026, 23h27". */
export function formatarGeradoTse(gerado: string): string {
  const m = gerado.match(/^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})/)
  return m ? `${m[1]}, ${m[2]}h${m[3]}` : gerado
}

/** Título e descrição da home: o do arquivo com o modo ligado, o da campanha do 2º turno sem ele. */
export function metadadosDaHome(arquivoAtivo: boolean): { title: string; description: string } {
  return arquivoAtivo
    ? {
        title: "Puxa Ficha | Arquivo das eleições 2026",
        description: "Arquivo do Puxa Ficha, de março a outubro de 2026: fichas públicas de presidente, governadores e senadores, com notícias, projetos de lei, processos e contas de campanha, todos com fonte, e como a coleta funcionou.",
      }
    : {
        title: "Puxa Ficha | 2º turno das eleições 2026",
        description: "Presidente e governadores no 2º turno de 25 de outubro: resultado do 1º turno, pesquisas, comparação lado a lado e a ficha pública de cada finalista, com fontes oficiais.",
      }
}
