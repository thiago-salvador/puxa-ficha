import type { GastoExecutivo } from "./types"

export type SigiloStatus = {
  total: number
  sigiloso: number
  nominado: number
  ausente: number
}

export type GastoExecutivoUgResumo = {
  codigo: string
  nome: string
  valorTotal: number
  qtdTransacoes: number
  portador: SigiloStatus
  estabelecimento: SigiloStatus
}

type GastoExecutivoMesResumo = {
  id: string
  mes_extrato: string
  valor_total: number
  qtd_transacoes: number
  coletado_em: string
  fonte: string
}

export type GastoExecutivoOrgaoResumo = {
  codigo: string
  nome: string
  rows: GastoExecutivo[]
  meses: GastoExecutivoMesResumo[]
  unidades: GastoExecutivoUgResumo[]
  portador: SigiloStatus
  estabelecimento: SigiloStatus
  totalMandato: number
  anoCorrente: number | null
  totalAnoCorrente: number | null
  ultimoMesComMovimento: GastoExecutivoMesResumo | null
  anos: Array<{
    ano: number
    total: number
    rows: GastoExecutivoMesResumo[]
  }>
}

function yearFromMesExtrato(mesExtrato: string): number | null {
  const match = mesExtrato.match(/^(\d{4})-/)
  if (!match) return null
  return Number(match[1])
}

function anoDoMaximoMesExtrato(rows: GastoExecutivo[]): number | null {
  let maxMes: string | null = null
  for (const row of rows) {
    if (yearFromMesExtrato(row.mes_extrato) == null) continue
    if (maxMes == null || row.mes_extrato > maxMes) maxMes = row.mes_extrato
  }
  return maxMes == null ? null : yearFromMesExtrato(maxMes)
}

function emptySigilo(): SigiloStatus {
  return { total: 0, sigiloso: 0, nominado: 0, ausente: 0 }
}

function addSigilo(target: SigiloStatus, row: GastoExecutivo, kind: "portador" | "estabelecimento"): void {
  const sigiloso = row[`qtd_${kind}_sigiloso`] ?? 0
  const nominado = row[`qtd_${kind}_nominado`] ?? 0
  const ausente = row[`qtd_${kind}_ausente`] ?? 0
  target.sigiloso += sigiloso
  target.nominado += nominado
  target.ausente += ausente
  target.total += sigiloso + nominado + ausente
}

function ugDaLinha(row: GastoExecutivo): { codigo: string; nome: string } {
  const codigo = row.ug_codigo?.trim()
  if (!codigo || codigo === "-") {
    return { codigo: row.orgao_codigo, nome: row.orgao_nome }
  }
  return { codigo, nome: row.ug_nome?.trim() || codigo }
}

/**
 * Nome de portador só aparece quando a fonte trouxe um nome real.
 * O token Sigiloso do CPGF federal nunca é publicado. Portal estadual
 * futuro: só chamar isto se o portal nomear o portador.
 */
export function nomeDePortadorNaFicha(nome: string | null | undefined): string | null {
  const trimmed = nome?.trim() ?? ""
  if (!trimmed) return null
  if (trimmed.toLowerCase() === "sigiloso") return null
  return trimmed
}

export function rotuloUnidadeGestora(
  ug: Pick<GastoExecutivoUgResumo, "codigo" | "nome">,
  unidades: Array<Pick<GastoExecutivoUgResumo, "codigo" | "nome">>,
): string {
  const nome = ug.nome.trim() || ug.codigo
  const homonimos = unidades.filter((item) => (item.nome.trim() || item.codigo) === nome).length
  return homonimos > 1 ? `${nome} (${ug.codigo})` : nome
}

export function formatarStatusSigilo(status: SigiloStatus, rotulo?: string): string {
  if (status.total === 0) {
    return rotulo ? `${rotulo}: sem medição neste recorte.` : "sem medição neste recorte."
  }
  const pct = (n: number) => `${Math.round((n / status.total) * 100)}%`
  const partes: string[] = []
  if (status.sigiloso > 0) {
    partes.push(`${pct(status.sigiloso)} sigiloso (${status.sigiloso} de ${status.total})`)
  }
  if (status.nominado > 0) {
    partes.push(`${pct(status.nominado)} identificado`)
  }
  if (status.ausente > 0) {
    partes.push(`${pct(status.ausente)} não informado`)
  }
  const corpo = partes.join("; ")
  return rotulo ? `${rotulo}: ${corpo}.` : `${corpo}.`
}

export function rotuloFonteGastosExecutivo(fonte: string | null | undefined): string {
  const url = fonte?.trim() ?? ""
  if (url.includes("/download-de-dados/cpgf")) return "Download oficial do CPGF"
  return "Portal da Transparência"
}

export function groupGastosExecutivoPorOrgao(
  rows: GastoExecutivo[],
  // Relógio injetável: o teste de janeiro prova que o ano vem do extrato, não daqui.
  _now: Date = new Date(),
): GastoExecutivoOrgaoResumo[] {
  void _now
  const anoCorrente = anoDoMaximoMesExtrato(rows)
  const byOrgao = new Map<string, GastoExecutivo[]>()
  for (const row of rows) {
    const list = byOrgao.get(row.orgao_codigo) ?? []
    list.push(row)
    byOrgao.set(row.orgao_codigo, list)
  }

  const summaries: GastoExecutivoOrgaoResumo[] = []
  for (const [codigo, orgaoRows] of byOrgao) {
    const sorted = [...orgaoRows].sort((a, b) => b.mes_extrato.localeCompare(a.mes_extrato))
    const byYear = new Map<number, Map<string, GastoExecutivoMesResumo>>()
    const byUg = new Map<string, GastoExecutivoUgResumo>()
    const byMes = new Map<string, GastoExecutivoMesResumo>()
    const portador = emptySigilo()
    const estabelecimento = emptySigilo()
    let totalMandato = 0
    let totalAnoCorrente = 0
    let temLinhaNoAnoCorrente = false

    for (const row of sorted) {
      totalMandato += row.valor_total
      const ano = yearFromMesExtrato(row.mes_extrato)
      if (anoCorrente != null && ano === anoCorrente) {
        temLinhaNoAnoCorrente = true
        totalAnoCorrente += row.valor_total
      }
      addSigilo(portador, row, "portador")
      addSigilo(estabelecimento, row, "estabelecimento")

      const ug = ugDaLinha(row)
      const ugAcc = byUg.get(ug.codigo) ?? {
        codigo: ug.codigo,
        nome: ug.nome,
        valorTotal: 0,
        qtdTransacoes: 0,
        portador: emptySigilo(),
        estabelecimento: emptySigilo(),
      }
      ugAcc.valorTotal += row.valor_total
      ugAcc.qtdTransacoes += row.qtd_transacoes
      addSigilo(ugAcc.portador, row, "portador")
      addSigilo(ugAcc.estabelecimento, row, "estabelecimento")
      byUg.set(ug.codigo, ugAcc)

      const mesAcc = byMes.get(row.mes_extrato) ?? {
        id: `${codigo}-${row.mes_extrato}`,
        mes_extrato: row.mes_extrato,
        valor_total: 0,
        qtd_transacoes: 0,
        coletado_em: row.coletado_em,
        fonte: row.fonte,
      }
      mesAcc.valor_total += row.valor_total
      mesAcc.qtd_transacoes += row.qtd_transacoes
      if (row.coletado_em > mesAcc.coletado_em) mesAcc.coletado_em = row.coletado_em
      byMes.set(row.mes_extrato, mesAcc)

      if (ano != null) {
        const yearMonths = byYear.get(ano) ?? new Map<string, GastoExecutivoMesResumo>()
        yearMonths.set(row.mes_extrato, mesAcc)
        byYear.set(ano, yearMonths)
      }
    }

    const meses = [...byMes.values()].sort((a, b) => b.mes_extrato.localeCompare(a.mes_extrato))
    summaries.push({
      codigo,
      nome: sorted[0]?.orgao_nome ?? codigo,
      rows: sorted,
      meses,
      unidades: [...byUg.values()].sort((a, b) => b.valorTotal - a.valorTotal || a.codigo.localeCompare(b.codigo)),
      portador,
      estabelecimento,
      totalMandato,
      anoCorrente,
      totalAnoCorrente: temLinhaNoAnoCorrente ? totalAnoCorrente : null,
      ultimoMesComMovimento: meses.find((mes) => mes.valor_total > 0) ?? null,
      anos: [...byYear.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([ano, yearMonths]) => {
          const yearRows = [...yearMonths.values()].sort((a, b) => b.mes_extrato.localeCompare(a.mes_extrato))
          return {
            ano,
            total: yearRows.reduce((soma, row) => soma + row.valor_total, 0),
            rows: yearRows,
          }
        }),
    })
  }

  return summaries.sort((a, b) => b.totalMandato - a.totalMandato)
}

export function pickOrgaoMaisRecente(
  orgaos: GastoExecutivoOrgaoResumo[],
): GastoExecutivoOrgaoResumo | null {
  if (orgaos.length === 0) return null
  return [...orgaos].sort((a, b) => {
    const mesA = a.rows[0]?.mes_extrato ?? ""
    const mesB = b.rows[0]?.mes_extrato ?? ""
    return mesB.localeCompare(mesA)
  })[0]
}
