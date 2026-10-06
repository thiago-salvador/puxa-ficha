/**
 * Mapa do 1º turno para Presidente por UF, montado só com o snapshot do TSE
 * (`presidente_por_uf`). A cor de cada UF é a do lado do partido do mais
 * votado, a mesma régua da barra do hero. UF sem arquivo lido fica "sem dado".
 */
import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import { corDoPartido, type CorFinalista } from "@/lib/cores-finalistas"
import { formatarPercentual, type PresidenteUf1Turno, type Resultados1Turno, type VotosPresidenteUf } from "@/lib/resultados-1turno"

export interface LinhaMapaPresidente {
  uf: string
  nome: string
  /** null quando o snapshot não tem a UF. */
  dado: PresidenteUf1Turno | null
  vencedor: VotosPresidenteUf | null
  cor: CorFinalista | null
  /** Texto do tooltip e do rótulo acessível. */
  descricao: string
}

export interface ContagemVencedor {
  sq: string
  nome_urna: string
  partido: string
  ufs: number
  cor: CorFinalista | null
}

export interface MapaPresidente {
  linhas: LinhaMapaPresidente[]
  /** Quantas UFs cada candidato venceu, do que mais venceu para o que menos venceu. */
  contagem: ContagemVencedor[]
  semDado: number
}

const UMA_CASA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** "2,4 p.p." a partir da margem guardada no snapshot; o que arredonda para zero vira "menos de 0,1 p.p.". */
export function formatarMargem(pp: number): string {
  return pp < 0.05 ? "menos de 0,1 p.p." : `${UMA_CASA.format(pp)} p.p.`
}

function descrever(nome: string, d: PresidenteUf1Turno | null): string {
  if (!d) return `${nome}: sem dado`
  const [a, b] = d.finalistas
  return `${nome}: ${d.vencedor.nome_urna} venceu por ${formatarMargem(d.margem_pp)}. ${a.nome_urna} ${formatarPercentual(a.percentual_validos)}, ${b.nome_urna} ${formatarPercentual(b.percentual_validos)}`
}

/** Uma linha por UF (27), em ordem alfabética do nome; null sem nenhum dado por UF. */
export function montarMapaPresidente(data: Pick<Resultados1Turno, "presidente_por_uf">): MapaPresidente | null {
  const porUf = new Map((data.presidente_por_uf ?? []).map((d) => [d.uf.toUpperCase(), d]))
  if (porUf.size === 0) return null
  const linhas = getEstadoUFs()
    .map((uf) => {
      const sigla = uf.toUpperCase()
      const nome = getEstadoNome(uf) ?? sigla
      const dado = porUf.get(sigla) ?? null
      return {
        uf: sigla,
        nome,
        dado,
        vencedor: dado?.vencedor ?? null,
        cor: dado ? corDoPartido(dado.vencedor.partido) : null,
        descricao: descrever(nome, dado),
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const contagem = new Map<string, ContagemVencedor>()
  for (const l of linhas) {
    if (!l.vencedor) continue
    const atual = contagem.get(l.vencedor.sq)
    if (atual) atual.ufs += 1
    else contagem.set(l.vencedor.sq, { sq: l.vencedor.sq, nome_urna: l.vencedor.nome_urna, partido: l.vencedor.partido, ufs: 1, cor: l.cor })
  }
  return {
    linhas,
    contagem: [...contagem.values()].sort((a, b) => b.ufs - a.ufs || a.nome_urna.localeCompare(b.nome_urna, "pt-BR")),
    semDado: linhas.filter((l) => !l.dado).length,
  }
}
