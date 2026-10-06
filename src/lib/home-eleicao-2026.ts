/**
 * Números do 1º turno para o hero da home. Tudo sai do snapshot do TSE: nada é
 * digitado à mão, e o item some quando o dado não existe no arquivo.
 */
import { formatarPercentual, getDisputa1Turno, hasResultados1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"
import { deltaPontos, formatarDeltaPontos, type Referencia2022Presidente } from "@/lib/referencia-2022"

export interface NumeroHero1Turno {
  id: "comparecimento" | "abstencao" | "governadores-2turno" | "senadores-eleitos"
  valor: string
  rotulo: string
  /** Diferença para o 1º turno de 2022 (Presidente, Brasil), só em comparecimento e abstenção. */
  comparacao?: { texto: string; acessivel: string }
}

function comparar(atual: number, ref: number | undefined): NumeroHero1Turno["comparacao"] {
  const delta = deltaPontos(atual, ref)
  if (delta === null || ref === undefined) return undefined
  const texto = delta === 0 ? "igual a 2022" : `${formatarDeltaPontos(delta)} vs 2022`
  const acessivel = delta === 0
    ? `igual a 2022, quando foi ${formatarPercentual(ref)}`
    : `${formatarDeltaPontos(delta).replace(/^[+\u2212]/, "")} ${delta > 0 ? "acima" : "abaixo"} de 2022, quando foi ${formatarPercentual(ref)}`
  return { texto, acessivel }
}

/** Só põe a chave quando há comparação: item sem referência fica igual ao de antes. */
function comOpcional(comparacao: NumeroHero1Turno["comparacao"]): Pick<NumeroHero1Turno, "comparacao"> {
  return comparacao ? { comparacao } : {}
}

/**
 * Comparecimento e abstenção (Presidente, Brasil), UFs com 2º turno para
 * governador e senadores eleitos. Com a referência de 2022, comparecimento e
 * abstenção ganham a diferença em pontos percentuais.
 */
export function numerosHero1Turno(data: Resultados1Turno, referencia2022: Referencia2022Presidente | null = null): NumeroHero1Turno[] {
  if (!hasResultados1Turno(data)) return []
  const numeros: NumeroHero1Turno[] = []
  const totais = getDisputa1Turno("Presidente", "BR", data)?.totais
  const ref = referencia2022?.totais
  if (totais?.percentual_comparecimento != null) {
    numeros.push({
      id: "comparecimento",
      valor: formatarPercentual(totais.percentual_comparecimento),
      rotulo: "comparecimento",
      ...comOpcional(comparar(totais.percentual_comparecimento, ref?.percentual_comparecimento)),
    })
  }
  if (totais?.percentual_abstencao != null) {
    numeros.push({
      id: "abstencao",
      valor: formatarPercentual(totais.percentual_abstencao),
      rotulo: "abstenção",
      ...comOpcional(comparar(totais.percentual_abstencao, ref?.percentual_abstencao)),
    })
  }
  const governadores = data.disputas.filter((d) => d.cargo === "Governador")
  if (governadores.length > 0) {
    const n = governadores.filter((d) => d.candidatos.filter((c) => c.fase === "segundo_turno").length === 2).length
    numeros.push({
      id: "governadores-2turno",
      valor: String(n),
      rotulo: n === 1 ? "estado com 2º turno para governador" : "estados com 2º turno para governador",
    })
  }
  const senadores = data.disputas
    .filter((d) => d.cargo === "Senador")
    .reduce((soma, d) => soma + d.candidatos.filter((c) => c.fase === "eleito").length, 0)
  // Zero senador eleito é apuração incompleta, não resultado: o item some.
  if (senadores > 0) {
    numeros.push({ id: "senadores-eleitos", valor: String(senadores), rotulo: senadores === 1 ? "senador eleito" : "senadores eleitos" })
  }
  return numeros
}
