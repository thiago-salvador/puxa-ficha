/**
 * Auditoria read-only das 13 linhas de votacoes_chave do Senado (item 7).
 *
 * A fonte nominal é o endpoint oficial por parlamentar. O script exige que os
 * 28 IDs do Senado do seed respondam; falha de rede aborta o recibo inteiro.
 * Só `Sim`, `Não`, abstenção e obstrução viram voto. `Votou` (escrutínio
 * secreto), presença sem voto, licença e ausência permanecem sem polaridade.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const API = "https://legis.senado.leg.br/dadosabertos"

const LINHAS_ANTES = [
  ["7e1bef47-3d91-4c7a-8f94-fa323c6bd5f1", "Codigo Florestal (2012)", 1, "retirada", "data de sanção; Caiado não era senador e não há ato nominal endereçável em 25/05/2012"],
  ["539f836a-197b-4176-9861-d58759a5c73b", "Impeachment de Dilma", 9, "retirada", "proposicao_id 126084 é PLC 27/2016, não DEN 1/2016; pares legados não provam o quesito final"],
  ["8d470dc1-3215-4af0-86b1-8405e31ae903", "Teto de Gastos (PEC 55)", 0, "retirada", "sem CodigoSessaoVotacao verificável no endpoint nominal oficial"],
  ["8ccbfe61-0ede-409e-83a1-1c2cbdd0421d", "Reforma da Previdencia", 12, "mantida", "CodigoSessaoVotacao 6046"],
  ["a8b40599-746f-418a-810e-4bbaa1894847", "Autonomia do Banco Central", 12, "mantida", "CodigoSessaoVotacao 6248; data corrigida para 03/11/2020"],
  ["e586da0e-3d1e-4f4c-93cd-3c696417f627", "Privatização da Eletrobras (Senado)", 1, "mantida", "CodigoSessaoVotacao 6377; data da sessão corrigida para 16/06/2021"],
  ["a145eff6-be34-4550-a7d3-8394a899262b", "Arcabouco Fiscal", 18, "mantida", "CodigoSessaoVotacao 6714; data corrigida para 21/06/2023"],
  ["b3dce7a7-bb51-4d96-8aa2-ee0240f76cf0", "Marco Temporal Terras Indigenas", 1, "retirada", "duplicata; o único sim legado contradiz AP na fonte"],
  ["7fa2b07b-f390-4d0f-87d5-354a68b1c593", "Marco Temporal Indigena (Senado)", 0, "mantida", "CodigoSessaoVotacao 6756; materia corrigida para 157888"],
  ["05104fa6-e50a-46ed-9847-7f20d1637dab", "Reforma Tributaria (PEC 45/2019)", 1, "retirada", "duplicata da PEC 45/2019"],
  ["baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6", "Ofício S nº 25/2023 (CNJ)", 8, "retirada", "evento 6809 é secreto: fonte publica Votou, não sim/não"],
  ["e473c35a-fe74-4bd0-b3e9-02604fbe2e9f", "Reforma Tributaria", 18, "mantida", "CodigoSessaoVotacao 6777; data corrigida para 08/11/2023"],
  ["6f1e4c1e-bf51-4a52-a2c1-98722dd6fe5d", "Marco Legal da IA (PL 2338/2023)", 0, "retirada", "aprovação não nominal; sem polaridade individual publicável"],
] as const

const EVENTOS = [
  { id: "6046", linhaId: LINHAS_ANTES[3][0], materia: "137999", data: "2019-10-22", descricao: "PEC da Previdência" },
  { id: "6248", linhaId: LINHAS_ANTES[4][0], materia: "135147", data: "2020-11-03", descricao: "Substitutivo" },
  { id: "6377", linhaId: LINHAS_ANTES[5][0], materia: "146740", data: "2021-06-16", descricao: "desestatização" },
  { id: "6714", linhaId: LINHAS_ANTES[6][0], materia: "157826", data: "2023-06-21", descricao: "Projeto de Lei Complementar" },
  { id: "6756", linhaId: LINHAS_ANTES[8][0], materia: "157888", data: "2023-09-27", descricao: "Projeto de Lei nº 2.903" },
  { id: "6777", linhaId: LINHAS_ANTES[11][0], materia: "158930", data: "2023-11-08", descricao: "segundo turno" },
] as const

function dig(obj: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>((current, key) =>
    current && typeof current === "object"
      ? (current as Record<string, unknown>)[key]
      : undefined, obj)
}

function ensureArray(value: unknown): Array<Record<string, unknown>> {
  if (!value) return []
  return (Array.isArray(value) ? value : [value]) as Array<Record<string, unknown>>
}

async function fetchJSON(url: string): Promise<Record<string, unknown>> {
  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json() as Record<string, unknown>
    } catch (error) {
      ultimoErro = error
      if (tentativa < 4) await new Promise((ok) => setTimeout(ok, tentativa * 1000))
    }
  }
  throw new Error(`${url}: ${ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)}`)
}

function votoPublicavel(raw: unknown): string | null {
  const normalizado = String(raw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (normalizado === "sim") return "sim"
  if (normalizado === "nao") return "não"
  if (normalizado.startsWith("absten")) return "abstenção"
  if (normalizado.startsWith("obstr")) return "obstrução"
  return null
}

async function main() {
  const output = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  const snapshotDb = process.argv.find((arg) => arg.startsWith("--snapshot-db="))?.slice(14)
  const candidatos = JSON.parse(readFileSync(resolve("data/candidatos.json"), "utf8")) as Array<{
    slug: string
    ids: { senado: number | null }
  }>
  const senadores = candidatos.filter((c) => c.ids.senado != null)
  const votos: Array<Record<string, unknown>> = []
  const metadados = new Map<string, Record<string, unknown>>()

  for (const candidato of senadores) {
    const url = `${API}/senador/${candidato.ids.senado}/votacoes.json`
    const payload = await fetchJSON(url)
    const registros = ensureArray(dig(payload, "VotacaoParlamentar", "Parlamentar", "Votacoes", "Votacao"))

    for (const esperado of EVENTOS) {
      const encontrados = registros.filter((v) => String(v.CodigoSessaoVotacao ?? "") === esperado.id)
      if (encontrados.length > 1) throw new Error(`${candidato.slug}: evento ${esperado.id} duplicado`)
      if (encontrados.length === 0) continue
      const registro = encontrados[0]
      const materia = registro.Materia as Record<string, unknown> | undefined
      const sessao = registro.SessaoPlenaria as Record<string, unknown> | undefined
      const descricao = String(registro.DescricaoVotacao ?? "")
      if (String(materia?.Codigo ?? "") !== esperado.materia ||
          String(sessao?.DataSessao ?? "") !== esperado.data ||
          !descricao.includes(esperado.descricao)) {
        throw new Error(`${candidato.slug}: metadados divergentes no evento ${esperado.id}`)
      }
      metadados.set(esperado.id, {
        codigoSessaoVotacao: esperado.id,
        materiaCodigo: esperado.materia,
        dataSessao: esperado.data,
        descricaoVotacao: descricao,
        resultado: registro.DescricaoResultado,
      })
      const voto = votoPublicavel(registro.SiglaDescricaoVoto)
      if (voto) votos.push({
        linhaId: esperado.linhaId,
        codigoSessaoVotacao: esperado.id,
        slug: candidato.slug,
        senadoId: candidato.ids.senado,
        voto,
        urlFonte: url,
      })
    }
  }

  for (const evento of EVENTOS) {
    if (!metadados.has(evento.id)) throw new Error(`evento ${evento.id} não apareceu em nenhum dos 28 endpoints`)
  }

  const porEvento = Object.fromEntries(EVENTOS.map((evento) => [
    evento.id,
    votos.filter((v) => v.codigoSessaoVotacao === evento.id).length,
  ]))
  const recibo = {
    geradoEm: new Date().toISOString(),
    fonte: API,
    universoAntes: { linhasSenado: LINHAS_ANTES.length, paresSenado: LINHAS_ANTES.reduce((n, l) => n + l[2], 0) },
    universoDepois: { linhasSenado: EVENTOS.length, paresNominaisPublicaveis: votos.length },
    endpointsSenadoresExigidos: senadores.length,
    linhas: LINHAS_ANTES.map(([id, titulo, paresAntes, decisao, motivo]) => ({ id, titulo, paresAntes, decisao, motivo })),
    eventos: EVENTOS.map((evento) => ({ ...evento, ...metadados.get(evento.id), pares: porEvento[evento.id] })),
    votos,
  }
  console.log(JSON.stringify({ universoAntes: recibo.universoAntes, universoDepois: recibo.universoDepois, porEvento }, null, 2))
  if (output) writeFileSync(resolve(output), `${JSON.stringify(recibo, null, 2)}\n`)
  if (snapshotDb) {
    const { supabase } = await import("../lib/supabase")
    const linhas = await supabase
      .from("votacoes_chave")
      .select("id,titulo,descricao,data_votacao,casa,proposicao_id,tema,impacto_popular,created_at")
      .eq("casa", "Senado")
      .order("data_votacao")
    if (linhas.error) throw linhas.error
    const ids = (linhas.data ?? []).map((linha) => linha.id)
    const pares = await supabase
      .from("votos_candidato")
      .select("id,votacao_id,voto,contradicao,contradicao_descricao,created_at,candidatos!inner(slug)")
      .in("votacao_id", ids)
      .order("votacao_id")
    if (pares.error) throw pares.error
    writeFileSync(resolve(snapshotDb), `${JSON.stringify({ linhas: linhas.data, pares: pares.data }, null, 2)}\n`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
