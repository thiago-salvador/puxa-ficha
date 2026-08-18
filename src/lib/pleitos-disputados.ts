import { cargoCoerenteComOAno, ehAnoDeEleicao } from "@/lib/calendario-eleitoral"
import { ehCargoNaoEletivo } from "@/lib/cargo-nao-eletivo"
import { resolveResultadoEleitoral } from "@/lib/resultado-eleitoral"

/**
 * Linha de trajetória no formato mínimo que a âncora precisa. Vale tanto para a
 * ficha crua do servidor quanto para o DTO público, que publica os mesmos
 * campos.
 */
export interface LinhaDeTrajetoriaParaPleito {
  periodo_inicio?: number | null
  periodo_fim?: number | null
  proveniencia?: string | null
  cargo?: string | null
  eleito_por?: string | null
  observacoes?: string | null
}

/**
 * Anos em que o candidato DISPUTOU pleito, pela régua oficial da ficha.
 *
 * Esta é a âncora única de "candidatura disputada" na superfície pública, e ela
 * é compartilhada de propósito: patrimônio e financiamento têm de responder
 * sobre o MESMO conjunto de pleitos. Duas cópias da regra dariam duas respostas
 * para a mesma pergunta, e a auditoria de 10/08 mediu financiamento justamente
 * contra esta âncora ("contei como candidatura disputada exatamente o que a
 * ficha já usa para ancorar patrimônio").
 *
 * Quatro condições, todas necessárias:
 *
 * 1. **Proveniência TSE.** Linha de wiki ou curadoria não prova candidatura.
 * 2. **Ano de eleição pelo calendário**, não por aritmética. Ano de INÍCIO não
 *    é ano de PLEITO: o mandato do Zema começa em 2023, ano em que não houve
 *    eleição nenhuma.
 * 3. **Cargo eletivo e coerente com o ano**, pelo calendário eleitoral: cargo
 *    municipal não se disputa em ano de eleição geral.
 * 4. **Resultado eleitoral aplicável.** Quem assumiu por sucessão
 *    constitucional, nomeação ou eleição interna não disputou pleito naquele
 *    ano. O Edilson Damião assumiu o governo de RR em 2026 por sucessão, e 2026
 *    ser ano de eleição não transforma a posse dele numa candidatura.
 *
 * `anoMinimo` recorta a janela de aplicabilidade da série de cada dimensão
 * (patrimônio começa em 2006, financiamento não tem piso porque a ficha precisa
 * poder dizer "o TSE não publica antes de 2002").
 */
export function anosDePleitoDisputado(
  historico: ReadonlyArray<LinhaDeTrajetoriaParaPleito>,
  anoMinimo = Number.NEGATIVE_INFINITY,
): Set<number> {
  const anos = new Set<number>()
  for (const row of historico) {
    if ((row.proveniencia ?? "") !== "tse") continue
    const ano = row.periodo_inicio
    if (ano == null || ano < anoMinimo) continue
    if (!ehAnoDeEleicao(ano)) continue
    if (ehCargoNaoEletivo(row.cargo)) continue
    if (!cargoCoerenteComOAno(row.cargo, ano)) continue
    const classificacao = resolveResultadoEleitoral(row)
    if (classificacao.situacao != null || classificacao.resultado === "nao_aplicavel") continue
    anos.add(ano)
  }
  return anos
}
