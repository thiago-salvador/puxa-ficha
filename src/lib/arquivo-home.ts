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
export function disputaFinal(resultado: Resultado2Turno, cargo: string, uf: string): { eleito: CandidatoFinal2Turno; derrotado: CandidatoFinal2Turno; fonte: DisputaFinal2Turno["fonte"] } | null {
  // Cargo e UF comparam sem caixa: "PRESIDENTE"/"br" acham a mesma disputa.
  const disputa = resultado.disputas.find((d) => d.cargo.toLowerCase() === cargo.toLowerCase() && d.uf.toUpperCase() === uf.toUpperCase())
  const eleito = disputa?.candidatos.find((c) => c.eleito)
  const derrotado = disputa?.candidatos.find((c) => !c.eleito)
  return disputa && eleito && derrotado ? { eleito, derrotado, fonte: disputa.fonte } : null
}

const INTEIRO = new Intl.NumberFormat("pt-BR")
export function formatarInteiro(valor: number): string {
  return INTEIRO.format(valor)
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
        description: "Arquivo das eleições 2026: o resultado oficial do 2º turno e as fichas públicas de presidente, governadores e senadores, com notícias, projetos de lei, processos e contas de campanha, todos com fonte.",
      }
    : {
        title: "Puxa Ficha | 2º turno das eleições 2026",
        description: "Presidente e governadores no 2º turno de 25 de outubro: resultado do 1º turno, pesquisas, comparação lado a lado e a ficha pública de cada finalista, com fontes oficiais.",
      }
}
