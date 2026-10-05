/**
 * Snapshot público do resultado do 1º turno (src/data/resultados-1turno-2026.json).
 *
 * Entra só o que o arquivo oficial do TSE publica: votos, % dos válidos,
 * situação, vice/suplentes e totais da disputa, com URL e sha256 do arquivo.
 * O vínculo com a ficha é por SQ do TSE + cargo + UF; quem não casar entra sem
 * link e aparece no relatório, nunca some da tabela.
 */
import { votoValido } from "../../src/lib/resultados-1turno"
import { stripAccents } from "../../src/lib/strip-accents"
import type {
  BancadaResultado1Turno,
  CargoBancada1Turno,
  CandidatoResultado1Turno,
  DisputaResultado1Turno,
  FaseResultado1Turno,
  Resultados1Turno,
} from "../../src/lib/resultados-1turno"
import {
  TSE_RESULTADOS_BASE,
  UFS_RESULTADO,
  classificarCandidato,
  sha256,
  type ArquivoLido,
  type CandidaturaCoorte,
  type CargoResultado,
  type EleicoesDoTurno,
  type LeituraArquivo,
} from "./resultados-tse"

/** Os 55 arquivos do 1º turno: Presidente (BR) + Governador e Senador por UF. */
export function alvosDoSnapshot(): Array<{ cargo: CargoResultado; uf: string | null }> {
  return [
    { cargo: "Presidente", uf: null },
    ...UFS_RESULTADO.flatMap((uf) => [
      { cargo: "Governador" as const, uf },
      { cargo: "Senador" as const, uf },
    ]),
  ]
}

/** Código do cargo proporcional no TSE: 6 federal, 7 estadual, 8 distrital (DF). */
const CODIGO_BANCADA: Readonly<Record<CargoBancada1Turno, string>> = {
  "Deputado Federal": "6",
  "Deputado Estadual": "7",
  "Deputado Distrital": "8",
}

export interface AlvoBancada {
  cargo: CargoBancada1Turno
  uf: string
  url: string
}

/** Os 54 arquivos proporcionais: federal nas 27 UFs, estadual em 26 e distrital no DF. */
export function alvosDasBancadas(eleicoes: EleicoesDoTurno): AlvoBancada[] {
  const url = (uf: string, cargo: CargoBancada1Turno) => {
    const abr = uf.toLowerCase()
    return `${TSE_RESULTADOS_BASE}/${eleicoes.ciclo}/${eleicoes.estadual}/dados/${abr}/${abr}-c${CODIGO_BANCADA[cargo].padStart(4, "0")}-e${eleicoes.estadual.padStart(6, "0")}-u.json`
  }
  return UFS_RESULTADO.flatMap((uf) => {
    const local: CargoBancada1Turno = uf === "DF" ? "Deputado Distrital" : "Deputado Estadual"
    return [
      { cargo: "Deputado Federal" as const, uf, url: url(uf, "Deputado Federal") },
      { cargo: local, uf, url: url(uf, local) },
    ]
  })
}

/**
 * Eleitos de um arquivo proporcional: só quem o TSE já marcou ("e" = "s" e
 * situação começando por "Eleito"). Nenhuma conta de quociente aqui: vaga
 * proporcional depende de quociente, sobras e cláusula de desempenho.
 */
export function lerBancada(alvo: AlvoBancada, corpo: string): BancadaResultado1Turno | string {
  let json: unknown
  try {
    json = JSON.parse(corpo)
  } catch {
    return "JSON inválido"
  }
  const r = json && typeof json === "object" ? (json as Record<string, unknown>) : null
  if (!r) return "raiz não é objeto"
  if (String(r.cdabr ?? "").toUpperCase() !== alvo.uf) return `abrangência ${String(r.cdabr)} != ${alvo.uf}`
  if (String(r.f ?? "") !== "o") return "arquivo não oficial"
  const cargos = Array.isArray(r.carg) ? (r.carg as Array<Record<string, unknown>>) : []
  const cargo = cargos.find((c) => String(c?.cd) === CODIGO_BANCADA[alvo.cargo])
  if (!cargo) return `cargo ${CODIGO_BANCADA[alvo.cargo]} ausente`
  const vagas = Number(cargo.nv)
  if (!Number.isInteger(vagas) || vagas <= 0) return "vagas (nv) inválidas"
  const eleitos: BancadaResultado1Turno["eleitos"] = []
  const vistos = new Set<string>()
  for (const agr of (cargo.agr as Array<Record<string, unknown>>) ?? []) {
    for (const par of (agr?.par as Array<Record<string, unknown>>) ?? []) {
      for (const c of (par?.cand as Array<Record<string, unknown>>) ?? []) {
        const st = stripAccents(String(c?.st ?? "")).trim().toLowerCase()
        if (c?.e === "s" && st.startsWith("eleito")) {
          // Mesma regra de lerArquivoResultado: SQ inválido ou repetido recusa a bancada.
          const sq = String(c.sqcand ?? "").trim()
          if (!/^\d{6,}$/.test(sq)) return "eleito sem sqcand numérico"
          if (vistos.has(sq)) return `sqcand duplicado ${sq}`
          vistos.add(sq)
          eleitos.push({ sq, nome_urna: String(c.nmu || c.nm || ""), partido: String(par.sg ?? "") })
        }
      }
    }
  }
  if (eleitos.length > vagas) return `${eleitos.length} eleitos para ${vagas} vagas`
  eleitos.sort((a, b) => a.partido.localeCompare(b.partido) || a.nome_urna.localeCompare(b.nome_urna))
  return {
    cargo: alvo.cargo,
    uf: alvo.uf,
    vagas,
    fechamento_oficial: String(r.tf ?? "") === "s",
    fonte: { url: alvo.url, sha256: sha256(corpo), gerado_tse: `${String(r.dg ?? "")} ${String(r.hg ?? "")}`.trim() },
    eleitos,
  }
}

export interface RelatorioSnapshot {
  disputas: number
  candidatos: number
  com_ficha: number
  sem_ficha: Array<{ cargo: string; uf: string; sq: string; nome: string }>
  fichas_fora_do_tse: Array<{ slug: string; cargo: string; uf: string | null; sq: string | null }>
  recusados: Array<{ chave: string; motivo: string }>
  /** Disputas publicadas com 100% das seções, mas sem o fechamento oficial (tf) do TSE. */
  sem_fechamento_oficial: string[]
  bancadas_incompletas: string[]
}

export function montarSnapshot(input: {
  eleicoes: EleicoesDoTurno
  leituras: LeituraArquivo[]
  coorte: CandidaturaCoorte[]
  agora: Date
  previa: boolean
  bancadas?: BancadaResultado1Turno[]
}): { snapshot: Resultados1Turno | null; relatorio: RelatorioSnapshot } {
  const recusados = input.leituras.filter((l) => !l.ok).map((l) => ({ chave: l.alvo.chave, motivo: l.ok ? "" : l.motivo }))
  const lidos = input.leituras.filter((l): l is ArquivoLido => l.ok)
  const fichaPorChave = new Map<string, CandidaturaCoorte>()
  for (const c of input.coorte) {
    const sq = String(c.sq_candidato_2026 ?? "").trim()
    if (!/^\d+$/.test(sq)) continue
    const uf = c.cargo_disputado === "Presidente" ? "BR" : String(c.estado ?? "").toUpperCase()
    fichaPorChave.set(`${c.cargo_disputado}:${uf}:${sq}`, c)
  }
  const usadas = new Set<string>()
  const semFicha: RelatorioSnapshot["sem_ficha"] = []
  const disputas: DisputaResultado1Turno[] = lidos.map((l) => {
    // Válidos primeiro, por votos; voto não válido (ex.: "Anulado sub judice") vai ao fim, sem posição nem %.
    const ordenados = [...l.candidatos].sort((a, b) =>
      Number(votoValido(b.destinacao)) - Number(votoValido(a.destinacao)) || (b.votos ?? -1) - (a.votos ?? -1) || a.sq.localeCompare(b.sq))
    let posicaoValida = 0
    const candidatos: CandidatoResultado1Turno[] = ordenados.map((c) => {
      const valido = votoValido(c.destinacao)
      if (valido) posicaoValida += 1
      const ficha = fichaPorChave.get(`${l.alvo.cargo}:${l.alvo.abrangencia}:${c.sq}`) ?? null
      if (ficha) usadas.add(ficha.id)
      else semFicha.push({ cargo: l.alvo.cargo, uf: l.alvo.abrangencia, sq: c.sq, nome: c.nomeUrna })
      const classificada = classificarCandidato(c, 1)
      // Situação vazia ou não reconhecida (só possível em prévia) vira "em_apuracao", nunca palpite.
      const fase: FaseResultado1Turno = classificada === null || classificada === "em_disputa" ? "em_apuracao" : classificada
      return {
        sq: c.sq,
        numero: c.numero,
        nome: c.nome,
        nome_urna: c.nomeUrna,
        partido: c.partido,
        votos: c.votos ?? 0,
        percentual_validos: valido ? c.percentualValidos : null,
        posicao: valido ? posicaoValida : null,
        situacao_tse: c.situacao,
        destinacao: c.destinacao,
        fase,
        slug: ficha?.slug ?? null,
        companheiros: c.companheiros,
      }
    })
    const t = l.totais
    return {
      cargo: l.alvo.cargo,
      uf: l.alvo.abrangencia,
      vagas: l.vagas,
      fechamento_oficial: l.final,
      fase_calculada: l.faseCalculada,
      fonte: { url: l.alvo.url, sha256: l.sha256, gerado_tse: l.geradoEm },
      totais: {
        secoes: t.secoes,
        secoes_totalizadas: t.secoesTotalizadas,
        eleitorado: t.eleitorado,
        comparecimento: t.comparecimento,
        percentual_comparecimento: t.percentualComparecimento,
        abstencao: t.abstencao,
        percentual_abstencao: t.percentualAbstencao,
        votos_validos: t.votosValidos,
        brancos: t.brancos,
        percentual_brancos: t.percentualBrancos,
        nulos: t.nulos,
        percentual_nulos: t.percentualNulos,
      },
      candidatos,
    }
  })
  disputas.sort((a, b) => (a.cargo === "Presidente" ? -1 : b.cargo === "Presidente" ? 1 : 0)
    || a.uf.localeCompare(b.uf) || a.cargo.localeCompare(b.cargo))
  const relatorio: RelatorioSnapshot = {
    disputas: disputas.length,
    candidatos: disputas.reduce((n, d) => n + d.candidatos.length, 0),
    com_ficha: disputas.reduce((n, d) => n + d.candidatos.filter((c) => c.slug).length, 0),
    sem_ficha: semFicha,
    fichas_fora_do_tse: input.coorte
      .filter((c) => !usadas.has(c.id) && ["Presidente", "Governador", "Senador"].includes(c.cargo_disputado))
      .map((c) => ({ slug: c.slug, cargo: c.cargo_disputado, uf: c.estado, sq: c.sq_candidato_2026 })),
    recusados,
    sem_fechamento_oficial: lidos.filter((l) => !l.final).map((l) => l.alvo.chave),
    bancadas_incompletas: (input.bancadas ?? [])
      .filter((b) => !b.fechamento_oficial || b.eleitos.length < b.vagas)
      .map((b) => `${b.cargo}:${b.uf} (${b.eleitos.length} de ${b.vagas})`),
  }
  const completo = recusados.length === 0 && lidos.length === alvosDoSnapshot().length
  // A leitura estrita já exige tf = "s" ou, com aceitarTotalizado, 100% das seções.
  if (!input.previa && !completo) return { snapshot: null, relatorio }
  return {
    snapshot: {
      versao: 1,
      turno: 1,
      status: input.previa ? "previa" : "final",
      gerado_em: input.agora.toISOString(),
      ciclo: input.eleicoes.ciclo,
      eleicoes: { federal: input.eleicoes.federal, estadual: input.eleicoes.estadual },
      disputas,
      ...(input.bancadas ? { bancadas: input.bancadas } : {}),
    },
    relatorio,
  }
}
