/**
 * Gera fixtures sanitizadas de despesas 2026 a partir de respostas reais.
 *
 * Documento de fornecedor vira token (`PJ-7`, `PF-3`), identificadores longos
 * viram valores sintéticos curtos e todo nome de fornecedor, descrição e
 * contexto do prestador vira texto sintético. Valores, tipos de despesa,
 * datas e a estrutura dos totais são mantidos, para que a conferência em
 * centavos rode sobre números reais. Os testes reidratam os tokens em dígitos
 * sintéticos só em memória.
 *
 * Uso: node --import tsx scripts/lib/despesas-sanitizar-fixture.ts <consulta.json> <lista.json|-> <saida.json>
 */

import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

type Json = Record<string, unknown>

const PADRAO_DOCUMENTO = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11,14}/

export const ELEICAO_SINTETICA = "2032200"

export function sanitizarDespesas2026(consulta: Json, listaBruta: unknown, sqSintetico: string, prestadorSintetico: string): Json {
  const tokens = new Map<string, string>()
  const nomes = new Map<string, string>()
  let pj = 0
  let pf = 0
  const token = (doc: unknown): string | null => {
    const digitos = typeof doc === "string" ? doc.replace(/\D/g, "") : ""
    if (digitos.length !== 11 && digitos.length !== 14) return null
    if (!tokens.has(digitos)) tokens.set(digitos, digitos.length === 14 ? `PJ-${++pj}` : `PF-${++pf}`)
    return tokens.get(digitos)!
  }
  const nomeDe = (tok: string | null, original: unknown, tipo: unknown): string | null => {
    if (!tok) return typeof tipo === "string" ? tipo : null
    if (!nomes.has(tok)) {
      const [classe, n] = tok.split("-")
      const partido = typeof original === "string" && /PARTIDO|DIRETORIO|DIRE[CÇ][AÃ]O/i.test(original)
      nomes.set(tok, partido ? `DIRETORIO REGIONAL PARTIDO FICTICIO ${n}` : classe === "PJ" ? `FORNECEDOR FICTICIO ${n} LTDA` : `PESSOA FICTICIA ${n}`)
    }
    return nomes.get(tok)!
  }
  const lista = Array.isArray(listaBruta) ? listaBruta : Array.isArray((listaBruta as Json | null)?.itens) ? (listaBruta as Json).itens as unknown[] : []
  const itens = lista.map((raw, i) => {
    const r = raw as Json
    const tok = token(r.cpfCnpjFornecedor)
    const beneficiado = typeof r.beneficiadoContratante === "string" ? r.beneficiadoContratante : ""
    return {
      cpfCnpjFornecedor: tok,
      nomeFornecedor: nomeDe(tok, r.nomeFornecedor, r.tipoDespesa),
      valor: r.valor,
      data: r.data,
      especieRecurso: r.especieRecurso,
      tipoDespesa: r.tipoDespesa,
      descricaoDespesa: typeof r.descricaoDespesa === "string" ? `Descricao sintetica ${i + 1}` : null,
      especieDocumento: r.especieDocumento ?? null,
      beneficiadoContratante: beneficiado.includes(" / ")
        ? "Direção Estadual/Distrital - PARTIDO FICTICIO - UF FICTICIA / CANDIDATO FICTICIO - Cargo - PARTIDO FICTICIO - UF"
        : "CANDIDATO FICTICIO - Cargo - PARTIDO FICTICIO - UF",
    }
  })
  const entregas = Array.isArray(consulta.historicoEntregas) ? consulta.historicoEntregas as Json[] : []
  const idsEntrega = new Map<string, string>()
  entregas.forEach((e, i) => idsEntrega.set(String(e.idEntrega), String(7_000_000 - i)))
  const ult = consulta.idUltimaEntrega === null ? null : idsEntrega.get(String(consulta.idUltimaEntrega)) ?? "6999000"
  const consolidados = (consulta.dadosConsolidados ?? null) as Json | null
  const saida = {
    consulta: {
      idEleicao: ELEICAO_SINTETICA,
      ano: consulta.ano,
      sgUe: consulta.sgUe,
      nrPartido: consulta.nrPartido,
      nrCandidato: consulta.nrCandidato,
      idCandidato: sqSintetico,
      idPrestador: prestadorSintetico,
      idUltimaEntrega: ult,
      entregaAtual: consulta.entregaAtual ?? null,
      historicoEntregas: entregas.map((e) => ({ dataEntrega: e.dataEntrega, tipo: e.tipo, idEntrega: idsEntrega.get(String(e.idEntrega)) })),
      despesas: consulta.despesas ?? null,
      dadosConsolidados: consolidados === null ? null : {
        totalRecebido: consolidados.totalRecebido ?? null,
        totalFinanceiro: consolidados.totalFinanceiro ?? null,
        totalEstimados: consolidados.totalEstimados ?? null,
      },
      concentracaoDespesas: consulta.concentracaoDespesas ?? [],
      rankingFornecedores: ((consulta.rankingFornecedores ?? []) as Json[]).map((r) => {
        const tok = token(r.cpfCnpj)
        return { cpfCnpj: tok, nome: nomeDe(tok, r.nome, null), qntd: r.qntd, valor: r.valor }
      }),
      dividaCampanha: consulta.dividaCampanha ?? null,
      sobraFinanceira: consulta.sobraFinanceira ?? null,
    },
    itens,
  }
  const texto = JSON.stringify(saida)
  if (PADRAO_DOCUMENTO.test(texto)) throw new Error("fixture sanitizada ainda contém sequência de 11 a 14 dígitos")
  return saida
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [consultaPath, listaPath, saidaPath, sq = "9000000001", prestador = "8000000001"] = process.argv.slice(2)
  if (!consultaPath || !listaPath || !saidaPath) throw new Error("uso: <consulta.json> <lista.json|-> <saida.json> [sq] [prestador]")
  const consulta = JSON.parse(readFileSync(consultaPath, "utf8")) as Json
  const lista = listaPath === "-" ? [] : JSON.parse(readFileSync(listaPath, "utf8"))
  writeFileSync(saidaPath, `${JSON.stringify(sanitizarDespesas2026(consulta, lista, sq, prestador), null, 1)}\n`)
}
