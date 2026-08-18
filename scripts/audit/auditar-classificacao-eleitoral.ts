/**
 * Oráculo dos invariantes globais de classificação eleitoral.
 * Contrato: QA/2026-08-10-adendo-dod-global.md (adendo de DoD, Sessão Raiz).
 *
 * Por que não é SQL. Quatro dos cinco invariantes medem o que a ficha AFIRMA,
 * não o que a tabela guarda. O banco está certo em 155 das 157 linhas do item
 * (b): quem errava era a conversão de exibição. Um `SELECT` devolveria a mesma
 * contagem antes e depois — a prova que o próprio adendo chama de prova que não
 * prova nada. Então o instrumento roda o PIPELINE REAL de exibição
 * (`buildPublicHistoricoPoliticoDisplayListFromRaw` + `formatHistoricoPeriodoDisplay`
 * + `buildPatrimonioEleicoes`) sobre a base inteira e conta o que sairia na tela.
 * O único invariante com defeito PERSISTIDO (item 12, `eleito_por` do Lula 2018)
 * tem readback SQL próprio, à parte, no dry-run da migration.
 *
 * Validado contra produção: reproduz linha a linha o DOM de
 * puxaficha.com.br/candidato/flavio-bolsonaro e o payload de
 * /api/candidato-profile/<slug>.
 *
 * Uso:
 *   node --import tsx scripts/audit/auditar-classificacao-eleitoral.ts [--saida=DIR]
 * Sai 1 se algum invariante de zerar não estiver zerado.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { createClient } from "@supabase/supabase-js"

import { anoCobertoPeloCalendario, ehAnoDeEleicao } from "@/lib/calendario-eleitoral"
import { ehCargoNaoEletivo } from "@/lib/cargo-nao-eletivo"
import { normalizeHistoricoPoliticoForDisplay } from "@/lib/historico-dedupe"
import {
  formatHistoricoCargoTituloPublico,
  formatHistoricoPeriodoDisplay,
} from "@/lib/historico-display"
import { buildPatrimonioEleicoes } from "@/lib/public-profile-dto"
import { ehVitoria, resolveResultadoEleitoral } from "@/lib/resultado-eleitoral"
import { buildPublicHistoricoPoliticoDisplayListFromRaw } from "@/lib/trajetoria-public-display"
import type { HistoricoPolitico, PatrimonioAusenciaOficial } from "@/lib/types"

function carregarEnv() {
  const caminho = join(process.cwd(), ".env.local")
  if (!existsSync(caminho)) return
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = /^([A-Z_0-9]+)=(.*)$/.exec(linha.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}
carregarEnv()

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) throw new Error("faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
const supabase = createClient(URL, KEY)

const argSaida = process.argv.find((a) => a.startsWith("--saida="))
const SAIDA = argSaida ? argSaida.slice("--saida=".length) : join("QA", "evidencias", "trilha-a")

/** Raw diz que venceu, sem negação e sem situação de registro que impeça. */
const RAW_DIZ_ELEITO = /\bELEIT[OA]\b/i
const RAW_DIZ_NAO_ELEITO = /N(Ã|A)O[\s-]*ELEIT[OA]/i

const DIZ_NAO_ELEITO_NO_ROTULO = /Não Eleito/
const DIZ_DESFECHO_DE_TOTALIZACAO = /Não Eleito|Eleito|Suplente/

async function paginar<T>(tabela: string, colunas: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

interface Invariante {
  chave: string
  titulo: string
  esperado: 0 | "declarado"
  linhas: string[]
}

const CONGELADAS_PATH = join("scripts", "audit", "sobreposicoes-congeladas.json")

/**
 * Manifesto congelado par a par. Existe para o invariante (e) não ser
 * tautológico: sem ele o auditor perguntaria a resposta certa ao próprio
 * `classificarSobreposicoes`, e qualquer regressão no classificador passaria,
 * porque o esperado regrediria junto.
 */
function carregarCongeladas(): Map<string, string> {
  if (!existsSync(CONGELADAS_PATH)) return new Map()
  const bruto = JSON.parse(readFileSync(CONGELADAS_PATH, "utf8")) as {
    pares: Array<{ chave: string; classe: string }>
  }
  return new Map(bruto.pares.map((p) => [p.chave, p.classe]))
}

/** Chave estável e legível, independente de uuid de produção. */
function chaveDoPar(slug: string, a: HistoricoPolitico, b: HistoricoPolitico): string {
  const lado = (r: HistoricoPolitico) =>
    `${(r.cargo ?? "").trim()}@${r.periodo_inicio ?? "?"}-${r.periodo_fim ?? "atual"}`
  const [x, y] = [lado(a), lado(b)].sort()
  return `${slug} | ${x} X ${y}`
}

/**
 * Detector PRÓPRIO do auditor. Reimplementa a geometria de sobreposição de
 * propósito, em vez de importar `classificarSobreposicoes`: se os dois lados da
 * conferência viessem do mesmo código, o teste não testaria nada.
 *
 * Regras, deliberadamente cruas: linha datada que não é candidatura, interseção
 * de pelo menos um ano inteiro, e linha aberta cujo mesmo cargo canónico
 * reaparece depois é sombra do registro seguinte (a ficha já a fecha).
 */
function paresSobrepostosIndependente(
  rows: readonly HistoricoPolitico[],
): Array<[HistoricoPolitico, HistoricoPolitico]> {
  const canon = (r: HistoricoPolitico) =>
    (r.cargo_canonico?.trim() || (r.cargo ?? "").trim()).toLowerCase()
  const candidatas = rows.filter((r) => {
    if ((r.tipo_evento ?? "mandato") === "candidatura") return false
    if (r.periodo_inicio == null) return false
    if (r.periodo_fim != null) return true
    return !rows.some(
      (o) => o.id !== r.id && canon(o) === canon(r) && (o.periodo_inicio ?? -1) >= r.periodo_inicio!,
    )
  })

  const pares: Array<[HistoricoPolitico, HistoricoPolitico]> = []
  for (let i = 0; i < candidatas.length; i += 1) {
    for (let j = i + 1; j < candidatas.length; j += 1) {
      const a = candidatas[i]
      const b = candidatas[j]
      const inicio = Math.max(a.periodo_inicio ?? 0, b.periodo_inicio ?? 0)
      const fim = Math.min(a.periodo_fim ?? 9999, b.periodo_fim ?? 9999)
      if (fim - inicio >= 1) pares.push([a, b])
    }
  }
  return pares
}

async function main() {
  const candidatos = await paginar<{ id: string; slug: string }>("candidatos", "id, slug")
  const historico = await paginar<HistoricoPolitico & { candidato_id: string }>(
    "historico_politico",
    "id, candidato_id, cargo, cargo_canonico, tipo_evento, periodo_inicio, periodo_fim, partido, estado, eleito_por, observacoes, proveniencia",
  )
  const patrimonio = await paginar<{ candidato_id: string; ano_eleicao: number }>(
    "patrimonio",
    "candidato_id, ano_eleicao",
  )
  const ausencias = await paginar<PatrimonioAusenciaOficial & { candidato_id: string }>(
    "patrimonio_ausencia_oficial",
    "candidato_id, ano_eleicao, fonte_url, verificado_em",
  )

  const porCandidato = new Map<string, HistoricoPolitico[]>()
  for (const row of historico) {
    const lista = porCandidato.get(row.candidato_id) ?? []
    lista.push(row)
    porCandidato.set(row.candidato_id, lista)
  }
  const patrimonioPorCandidato = new Map<string, Array<{ ano_eleicao: number }>>()
  for (const row of patrimonio) {
    const lista = patrimonioPorCandidato.get(row.candidato_id) ?? []
    lista.push({ ano_eleicao: row.ano_eleicao })
    patrimonioPorCandidato.set(row.candidato_id, lista)
  }
  const ausenciasPorCandidato = new Map<string, PatrimonioAusenciaOficial[]>()
  for (const row of ausencias) {
    const lista = ausenciasPorCandidato.get(row.candidato_id) ?? []
    lista.push(row)
    ausenciasPorCandidato.set(row.candidato_id, lista)
  }

  const inv: Record<string, Invariante> = {
    a: { chave: "a", titulo: "Candidatura indeferida/cancelada exibida como candidatura real", esperado: 0, linhas: [] },
    b: { chave: "b", titulo: "Raw ELEITO (inclusive QP/média) exibido como \"Não Eleito\"", esperado: 0, linhas: [] },
    c: { chave: "c", titulo: "Cargo interno de partido tratado como pleito", esperado: 0, linhas: [] },
    d: { chave: "d", titulo: "Eleição em ano sem pleito, em qualquer superfície", esperado: 0, linhas: [] },
    e: { chave: "e", titulo: "Sobreposição de mandatos sem regra de precedência aplicada", esperado: 0, linhas: [] },
  }

  const tallyClasses: Record<string, number> = {}
  const CONGELADAS = carregarCongeladas()
  const pareseVistos = new Set<string>()

  for (const candidato of candidatos) {
    const raw = porCandidato.get(candidato.id) ?? []
    if (raw.length === 0) continue
    const lista = buildPublicHistoricoPoliticoDisplayListFromRaw(raw)
    const porId = new Map(lista.map((r) => [r.id, r]))

    for (const item of lista) {
      const rotulo = formatHistoricoPeriodoDisplay(item, lista)
      const titulo = formatHistoricoCargoTituloPublico(item)
      const obs = item.observacoes ?? ""
      const { resultado, situacao } = resolveResultadoEleitoral(item)
      const marca = `${candidato.slug} | ${item.periodo_inicio} | ${item.cargo} | "${rotulo}" | ${obs.slice(0, 80)}`

      // (a) registro que não chegou a disputar não pode exibir totalização.
      if (situacao != null && DIZ_DESFECHO_DE_TOTALIZACAO.test(rotulo)) inv.a.linhas.push(marca)

      // (b) o raw afirma vitória e a tela afirma derrota.
      const rawVenceu =
        (RAW_DIZ_ELEITO.test(obs) && !RAW_DIZ_NAO_ELEITO.test(obs) && situacao == null) ||
        ehVitoria(resultado)
      if (rawVenceu && DIZ_NAO_ELEITO_NO_ROTULO.test(rotulo)) inv.b.linhas.push(marca)

      // (c) direção partidária/sindical continua VISÍVEL de propósito (não há
      // superfície separada na ficha); o que não pode é ser tratada como pleito.
      if (ehCargoNaoEletivo(item.cargo)) {
        const tratadaComoPleito =
          DIZ_DESFECHO_DE_TOTALIZACAO.test(rotulo) || titulo.startsWith("Candidatura:")
        if (tratadaComoPleito) inv.c.linhas.push(marca)
      }

      // (d) superfície timeline: linha exibida como pleito em ano sem eleição.
      const exibidaComoPleito =
        titulo.startsWith("Candidatura:") || DIZ_DESFECHO_DE_TOTALIZACAO.test(rotulo)
      const ano = item.periodo_inicio
      if (
        ano != null &&
        exibidaComoPleito &&
        anoCobertoPeloCalendario(ano) &&
        !ehAnoDeEleicao(ano)
      ) {
        inv.d.linhas.push(`timeline | ${marca}`)
      }
    }

    // (d) superfície patrimônio: ano derivado que não é ano de eleição.
    for (const eleicao of buildPatrimonioEleicoes(
      patrimonioPorCandidato.get(candidato.id) ?? [],
      ausenciasPorCandidato.get(candidato.id) ?? [],
      lista,
    )) {
      if (anoCobertoPeloCalendario(eleicao.ano) && !ehAnoDeEleicao(eleicao.ano)) {
        inv.d.linhas.push(`patrimonio | ${candidato.slug} | ano ${eleicao.ano} | ${eleicao.estado}`)
      }
      const linhasDoAno = lista.filter((r) => r.periodo_inicio === eleicao.ano)
      if (linhasDoAno.length > 0 && linhasDoAno.every((r) => ehCargoNaoEletivo(r.cargo))) {
        inv.c.linhas.push(`patrimonio | ${candidato.slug} | ano ${eleicao.ano} derivado de cargo não eletivo`)
      }
    }

    // (e) DETECTOR INDEPENDENTE, escrito neste arquivo e sem chamar
    // `classificarSobreposicoes`: o auditor não pode perguntar ao classificador
    // qual é a resposta certa. Ele acha os pares por conta própria sobre a
    // lista RENDERIZADA, e depois cobra do manifesto congelado.
    // Mesma ordem do contrato: C1 é procurada no NORMALIZADO, onde a duplicata
    // ainda existe; C4 e C5 na lista PÚBLICA, já sem ela.
    const normalizada = normalizeHistoricoPoliticoForDisplay(raw).sort((x, y) => (x.id < y.id ? -1 : 1))
    const noRender = (r: HistoricoPolitico) => porId.has(r.id)

    const c1DaFicha: Array<{ chave: string; a: HistoricoPolitico; b: HistoricoPolitico }> = []
    for (const [a, b] of paresSobrepostosIndependente(normalizada)) {
      const chave = chaveDoPar(candidato.slug, a, b)
      if (CONGELADAS.get(chave) !== "C1_duplicata") continue
      pareseVistos.add(chave)
      tallyClasses.C1_duplicata = (tallyClasses.C1_duplicata ?? 0) + 1
      c1DaFicha.push({ chave, a, b })
      // Duplicata tem de sair da ficha: exatamente um lado sobrevive.
      if (noRender(a) === noRender(b)) {
        inv.e.linhas.push(`${chave} | C1 congelada mas os dois lados aparecem (ou os dois sumiram)`)
      }
    }

    // Contabilidade das REMOÇÕES, e não só das classificações. Toda linha que
    // existe no normalizado e some da lista pública precisa de exatamente uma
    // C1 congelada que a justifique, com exatamente um lado sobrevivente.
    // Sem isto, uma dedupe nova entraria em produção sem passar pelo manifesto.
    const idsPublicos = new Set(lista.map((r) => r.id))
    for (const row of normalizada) {
      if (idsPublicos.has(row.id)) continue
      const justificativas = c1DaFicha.filter(
        ({ a, b }) =>
          (a.id === row.id && idsPublicos.has(b.id)) || (b.id === row.id && idsPublicos.has(a.id)),
      )
      if (justificativas.length !== 1) {
        inv.e.linhas.push(
          `${candidato.slug} | ${row.cargo}@${row.periodo_inicio} | linha REMOVIDA com ${justificativas.length} C1 congelada(s) a justificar; esperado exatamente 1 (dedupe nova não congelada)`,
        )
      }
    }

    for (const [a, b] of paresSobrepostosIndependente(lista)) {
      const chave = chaveDoPar(candidato.slug, a, b)
      const congelado = CONGELADAS.get(chave)
      pareseVistos.add(chave)

      if (congelado == null) {
        inv.e.linhas.push(`${chave} | par NOVO, ausente do manifesto congelado`)
        continue
      }
      if (congelado === "C1_duplicata") {
        inv.e.linhas.push(`${chave} | C1 congelada ainda aparece na lista pública`)
        continue
      }
      tallyClasses[congelado] = (tallyClasses[congelado] ?? 0) + 1
    }

    // O diagnóstico de C4 permanece neste gate. A superfície deve renderizar
    // os dois trechos normalmente, sem carimbo operacional para o leitor.
    for (const item of lista) {
      const periodo = formatHistoricoPeriodoDisplay(item, lista)
      if (/em conferência|curadoria/i.test(periodo)) {
        inv.e.linhas.push(
          `${candidato.slug} | ${item.cargo}@${item.periodo_inicio} | vocabulário interno no período público: ${periodo}`,
        )
      }
    }
  }

  // Par congelado que sumiu da base é regeneração deliberada, não silêncio.
  for (const chave of CONGELADAS.keys()) {
    if (!pareseVistos.has(chave)) {
      inv.e.linhas.push(`${chave} | par congelado DESAPARECEU; regenere o manifesto no mesmo PR`)
    }
  }

  mkdirSync(SAIDA, { recursive: true })
  let falhou = false
  const resumo: string[] = [
    `fichas: ${candidatos.length} | linhas de historico: ${historico.length}`,
    "",
  ]
  for (const chave of ["a", "b", "c", "d", "e"] as const) {
    const item = inv[chave]
    const arquivo = join(SAIDA, `invariante-${chave}.txt`)
    writeFileSync(arquivo, `${item.titulo}\ncontagem: ${item.linhas.length}\n\n${item.linhas.join("\n")}\n`)
    resumo.push(`(${chave}) ${item.titulo}: ${item.linhas.length}`)
    if (item.linhas.length > 0) falhou = true
  }

  resumo.push("", `classes de sobreposição (congeladas em ${CONGELADAS_PATH}):`)
  for (const [classe, n] of Object.entries(tallyClasses).sort()) {
    resumo.push(`  ${classe}: ${n}`)
  }
  const c4 = tallyClasses.C4_conflito ?? 0
  resumo.push(
    "",
    `C4 permanece diagnosticado no gate e renderizado como trechos distintos, sem carimbo público: ${c4} par(es).`,
  )

  const texto = resumo.join("\n")
  writeFileSync(join(SAIDA, "resumo-invariantes.txt"), `${texto}\n`)
  console.log(texto)
  if (falhou) {
    console.error("\nFALHA: há invariante que deveria estar zerado e não está.")
    process.exitCode = 1
  }
}

void main()
