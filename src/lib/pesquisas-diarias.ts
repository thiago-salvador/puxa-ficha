// cspell:ignore Diarias Diaria comparavel Deduplicacao deduplicar unicas periodo
import type { Pesquisa2TurnoLinha } from "./segundo-turno-2026"

type PesquisaComChave = Pesquisa2TurnoLinha & {
  comparabilidade?: { chave: string; rotulo: string } | null
  registro?: string | null
}

export type DiaPesquisa = {
  data: string
  percentuais: [number, number]
  pesquisas: Pesquisa2TurnoLinha[]
}

export type SeriePesquisaDiaria = {
  id: string
  rotulo: string
  comparavel: boolean
  linhas: Pesquisa2TurnoLinha[]
  dias: DiaPesquisa[]
}

function dataIsoValida(data: string | null): data is string {
  if (data === null || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  try {
    return new Date(`${data}T00:00:00.000Z`).toISOString().slice(0, 10) === data
  } catch {
    return false
  }
}

function percentuaisValidos(linha: Pesquisa2TurnoLinha): boolean {
  return linha.percentuais.length === 2 && linha.percentuais.every((valor) =>
    Number.isFinite(valor) && valor >= 0 && valor <= 100,
  )
}

function registroNormalizado(registro: string | null | undefined): string | null {
  if (registro == null) return null
  const normalizado = registro.toLocaleLowerCase("pt-BR").replace(/[\s-]/g, "")
  const partes = /^([a-z]{2})(\d{5})\/(?:20)?(\d{2})$/.exec(normalizado)
  return partes ? `${partes[1]}:${partes[2]}:${partes[3]}` : null
}

function chaveDeduplicacao(linha: PesquisaComChave): string {
  const registro = registroNormalizado(linha.registro)
  return registro === null ? `id:${linha.id}` : `registro:${registro}`
}

function compararMaisRecente(a: Pesquisa2TurnoLinha, b: Pesquisa2TurnoLinha): number {
  const aData = dataIsoValida(a.data) ? a.data : null
  const bData = dataIsoValida(b.data) ? b.data : null
  if (aData !== bData) {
    if (aData === null) return 1
    if (bData === null) return -1
    return bData.localeCompare(aData)
  }
  return a.id.localeCompare(b.id) || a.url.localeCompare(b.url)
}

function deduplicar(linhas: PesquisaComChave[]): PesquisaComChave[] {
  const escolhidas = new Map<string, PesquisaComChave>()
  for (const linha of linhas) {
    const chave = chaveDeduplicacao(linha)
    const anterior = escolhidas.get(chave)
    if (!anterior || compararMaisRecente(linha, anterior) < 0) escolhidas.set(chave, linha)
  }
  return [...escolhidas.values()].sort(compararMaisRecente)
}

function agruparPorDia(linhas: PesquisaComChave[]): DiaPesquisa[] {
  const porData = new Map<string, PesquisaComChave[]>()
  for (const linha of linhas) {
    if (!dataIsoValida(linha.data) || !percentuaisValidos(linha)) continue
    const doDia = porData.get(linha.data) ?? []
    doDia.push(linha)
    porData.set(linha.data, doDia)
  }

  return [...porData.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, pesquisas]) => {
    const total = pesquisas.length
    const soma = pesquisas.reduce<[number, number]>(
      ([a, b], pesquisa) => [a + pesquisa.percentuais[0], b + pesquisa.percentuais[1]],
      [0, 0],
    )
    return {
      data,
      percentuais: [soma[0] / total, soma[1] / total],
      pesquisas: [...pesquisas].sort((a, b) => a.id.localeCompare(b.id)),
    }
  })
}

export function agruparPesquisasDiarias(linhas: readonly Pesquisa2TurnoLinha[]): SeriePesquisaDiaria[] {
  const grupos = new Map<string, { id: string; rotulo: string; comparavel: boolean; linhas: PesquisaComChave[] }>()
  for (const linha of linhas as readonly PesquisaComChave[]) {
    const comparabilidade = linha.comparabilidade
    const comparavel = Boolean(comparabilidade?.chave)
    const chaveGrupo = comparavel ? `comparabilidade:${comparabilidade!.chave}` : `individual:${linha.id}`
    const id = comparavel ? comparabilidade!.chave : linha.id
    const existente = grupos.get(chaveGrupo)
    if (existente) {
      existente.linhas.push(linha)
    } else {
      grupos.set(chaveGrupo, {
        id,
        rotulo: comparavel ? comparabilidade!.rotulo : `Pesquisa individual · ${linha.instituto}`,
        comparavel,
        linhas: [linha],
      })
    }
  }

  return [...grupos.values()].map((grupo) => {
    const unicas = deduplicar(grupo.linhas)
    return {
      id: grupo.id,
      rotulo: grupo.rotulo,
      comparavel: grupo.comparavel,
      linhas: unicas,
      dias: agruparPorDia(unicas),
    }
  }).sort((a, b) => Number(b.comparavel) - Number(a.comparavel)
    || b.linhas.length - a.linhas.length
    || a.id.localeCompare(b.id))
}

export function filtrarPesquisasDiarias(
  linhas: readonly Pesquisa2TurnoLinha[],
  opcoes: { instituto?: string; periodo?: "all" | "30" | "15" },
): Pesquisa2TurnoLinha[] {
  const datas = linhas.flatMap((linha) => dataIsoValida(linha.data) ? [linha.data] : [])
  const ancora = datas.sort((a, b) => b.localeCompare(a))[0]
  const periodo = opcoes.periodo ?? "all"
  const limite = ancora && periodo !== "all"
    ? new Date(`${ancora}T00:00:00.000Z`).getTime() - Number(periodo) * 24 * 60 * 60 * 1000
    : null

  return linhas.filter((linha) => {
    if (opcoes.instituto && opcoes.instituto !== "all" && linha.instituto !== opcoes.instituto) return false
    if (limite === null) return true
    return dataIsoValida(linha.data) && new Date(`${linha.data}T00:00:00.000Z`).getTime() >= limite
  })
}

export function formatarMediaPesquisa(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(valor / 100)
}
