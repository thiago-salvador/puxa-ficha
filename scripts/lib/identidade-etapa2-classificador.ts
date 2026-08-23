/**
 * Nucleo puro da classificacao de identidade da etapa 2 (execucao
 * `pf-reverificacao-20260809`).
 *
 * ## O que a etapa 2 decidiu
 *
 * Dos 83 perfis sem verificacao em agosto, 71 tinham
 * `current_candidacy_status.query_result = no_safe_match` no ledger da B2, ou
 * seja, a pesquisa de 06/08 nao conseguiu casar identidade segura. Contra o
 * snapshot fresco do TSE de 08/08, esses 71 foram classificados em sete classes,
 * e SO uma delas promove chave de persistencia.
 *
 * ## Por que este arquivo existe separado do gerador
 *
 * A cascata inteira e uma funcao PURA de (perfil da ficha, linhas do TSE). Todo
 * o IO (3,4 MB de ZIPs gitignorados, o ledger de 2,98 MB, sha256, escrita) mora
 * em `scripts/audit/gerar-identidade-etapa2.ts`. So assim a decisao pode ser
 * testada em CI, com fixtures de uma a tres linhas, sem nenhum artefato de
 * `output/`.
 *
 * ## A regra de identidade, e por que ela e severa
 *
 * Confirmacao exige nome civil + nome de urna + cargo + UF, o mesmo contrato da
 * B2. Nome civil sozinho, mesmo casando 1:1, encaminha REVISAO, nao confirma:
 * `Settings/EXPECTED_BEHAVIOR.md` diz que nome nao basta para persistir dado
 * sensivel ou homonimo, e `SQ_CANDIDATO` confirmado e a chave eleitoral de
 * persistencia.
 *
 * Classes bloqueadas continuam carregando `hits`, que preservam o
 * `SQ_CANDIDATO` como EVIDENCIA para quem for revisar. O invariante e "nenhuma
 * chave promovida", nao "nenhum SQ em lugar nenhum": 16 das 59 entradas
 * bloqueadas trazem SQ dentro de `hits`, e apaga-los destruiria a pista que
 * torna a revisao possivel.
 */

import { stripAccents } from "../../src/lib/strip-accents"

export interface LinhaTse {
  SQ_CANDIDATO: string
  NM_CANDIDATO: string
  NM_URNA_CANDIDATO: string
  DS_CARGO: string
  SG_UF: string
  SG_PARTIDO: string
  NR_CANDIDATO: string
  /**
   * `DD/MM/YYYY` no dado do TSE. OPCIONAL de proposito: ausencia do campo
   * significa "sem chave independente para conferir", que e o estado de antes
   * desta regra existir, e nunca promove. Coluna renomeada pela fonte tornaria a
   * regra inerte em silencio, e por isso o gerador mede a densidade do campo e
   * reprova quando ela desaba.
   */
  DT_NASCIMENTO?: string
}

export interface PerfilDaFicha {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: string
  estado: string | null
  /**
   * `YYYY-MM-DD` do NOSSO lado, de proveniencia anterior ao pleito conferido.
   * Opcional pelo mesmo motivo de `DT_NASCIMENTO`: sem data, a cascata se
   * comporta exatamente como antes.
   */
  data_nascimento?: string | null
}

export interface FontesTse {
  /** consulta_cand do BRASIL inteiro, TODOS os cargos. O recorte e interno. */
  todas: readonly LinhaTse[]
  /** SQs presentes no pacote complementar. */
  sqComComplemento: ReadonlySet<string>
  /** Quantas redes declaradas por SQ. */
  redesPorSq: ReadonlyMap<string, number>
}

export type ClasseIdentidade =
  | "match_fresco"
  | "ambiguo"
  | "revisao_identidade"
  | "conflito_cargo_uf"
  | "proxima_possivel_urna"
  | "registro_encontrado_outro_cargo"
  | "nao_localizado_pelos_matchers"

export const CLASSES: readonly ClasseIdentidade[] = Object.freeze([
  "match_fresco",
  "ambiguo",
  "revisao_identidade",
  "conflito_cargo_uf",
  "proxima_possivel_urna",
  "registro_encontrado_outro_cargo",
  "nao_localizado_pelos_matchers",
])

/**
 * A UNICA classe que promove chave. Exportada porque e a regra, nao um detalhe
 * de implementacao: quem materializar dado TSE consulta isto.
 */
export const CLASSE_QUE_PROMOVE_CHAVE: ClasseIdentidade = "match_fresco"

export const CARGOS_ALVO: ReadonlySet<string> = new Set([
  "GOVERNADOR",
  "VICE-GOVERNADOR",
  "PRESIDENTE",
  "VICE-PRESIDENTE",
])

export interface HitTse {
  sq: string
  nome_civil: string
  nome_urna: string
  cargo: string
  uf: string
  partido: string
  numero: string
}

export interface FrentesTse {
  registration: true
  complement: boolean
  social_networks: boolean
  social_count: number
}

export interface ChaveDeIdentidade {
  type: "SQ_CANDIDATO"
  value: string
}

export interface ResultadoClassificacao {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: string
  estado: string | null
  classe: ClasseIdentidade
  motivo: string
  hits: HitTse[]
  chave?: ChaveDeIdentidade
  frentes_tse?: FrentesTse
}

export function normalizar(valor: unknown): string {
  return stripAccents(String(valor ?? ""))
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase()
}

export function compactar(valor: unknown): string {
  return normalizar(valor).replace(/\s+/g, "")
}

export function normalizarCargo(valor: unknown): string {
  const t = compactar(valor)
  if (t.includes("VICEGOVERNADOR")) return "VICE-GOVERNADOR"
  if (t.includes("VICEPRESIDENTE")) return "VICE-PRESIDENTE"
  if (t.includes("GOVERNADOR") || t.includes("GOVERNO")) return "GOVERNADOR"
  if (t.includes("PRESIDENTE") || t.includes("PRESIDENCIA")) return "PRESIDENTE"
  return t
}

/** Conectivos portugueses nao distinguem pessoa e so atrapalham o subconjunto. */
const STOP = new Set(["DE", "DA", "DO", "DOS", "DAS", "E"])

export function tokenizar(valor: unknown): string[] {
  return normalizar(valor)
    .split(" ")
    .filter((t) => t && !STOP.has(t) && t.length > 1)
}

/**
 * Nome da ficha e subconjunto do nome do TSE (ficha abreviada).
 *
 * O guarda `length > 0` importa: sem ele, nome vazio seria subconjunto de todo
 * mundo, e a ficha sem nome civil casaria com o primeiro registro da lista.
 */
export function ehSubconjunto(nomeDaFicha: string, linha: LinhaTse): boolean {
  const daFicha = tokenizar(nomeDaFicha)
  const doTse = tokenizar(linha.NM_CANDIDATO)
  return daFicha.length > 0 && daFicha.every((t) => doTse.includes(t))
}

/**
 * A CHAVE INDEPENDENTE: data de nascimento da ficha igual a do registro TSE.
 *
 * O contrato do registro sempre previu esse desbloqueio ("nao persistir ate
 * confirmacao por data de nascimento, SQ historico ou CPF"). Nome de urna
 * divergente ou nome civil abreviado deixam de bloquear quando um segundo eixo,
 * que nao e nome, confirma a pessoa.
 *
 * Por que nao e circular: a data do nosso lado tem proveniencia ANTERIOR ao
 * pleito conferido (consulta_cand de 2018/2020/2022/2024, DivulgaCandContas de
 * ciclos passados ou curadoria), registrada por slug em
 * `data/identidade-etapa2-nascimentos.json`. Conferir o snapshot 2026 com um
 * dado extraido do proprio snapshot 2026 nao provaria nada, e foi o defeito que
 * derrubou a rota 2 do backfill de CPF (precedente jarbas-soares).
 *
 * Fail-closed em todo caminho duvidoso: lado ausente, formato fora do padrao ou
 * data que o calendario nao tem devolvem `false`. `31/02/1980` e recusada em vez
 * de rolar para marco, mesmo motivo de `validarDataDeVerificacao` em
 * `src/lib/verificacao-campos.ts`.
 */
export function nascimentoConfere(
  dataIsoDaFicha: string | null | undefined,
  linha: LinhaTse,
): boolean {
  if (typeof dataIsoDaFicha !== "string") return false
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIsoDaFicha.trim())
  if (!iso) return false

  const bruto = typeof linha.DT_NASCIMENTO === "string" ? linha.DT_NASCIMENTO.trim() : ""
  const tse = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto)
  if (!tse) return false

  const [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  const calendarioReal =
    d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  if (!calendarioReal) return false

  return Number(tse[3]) === ano && Number(tse[2]) === mes && Number(tse[1]) === dia
}

export function resumir(linha: LinhaTse): HitTse {
  return {
    sq: String(linha.SQ_CANDIDATO),
    nome_civil: linha.NM_CANDIDATO,
    nome_urna: linha.NM_URNA_CANDIDATO,
    cargo: linha.DS_CARGO,
    uf: linha.SG_UF,
    partido: linha.SG_PARTIDO,
    numero: linha.NR_CANDIDATO,
  }
}

type BaseDoPerfil = Pick<
  ResultadoClassificacao,
  "slug" | "nome_completo" | "nome_urna" | "cargo_disputado" | "estado"
>

/**
 * Monta o retorno promovido. Existe para que os DOIS caminhos de promocao
 * (casamento exato e chave independente) emitam o objeto na MESMA ordem de
 * campos: `fonte.diagnostico_final_71_sha256` e sha256 de um `JSON.stringify`,
 * entao ordem de chave e conteudo de hash, nao estilo.
 */
function promover(
  base: BaseDoPerfil,
  linha: LinhaTse,
  fontes: FontesTse,
  motivo: string,
): ResultadoClassificacao {
  const sq = String(linha.SQ_CANDIDATO)
  return {
    ...base,
    classe: "match_fresco",
    motivo,
    hits: [resumir(linha)],
    chave: { type: "SQ_CANDIDATO", value: sq },
    frentes_tse: {
      registration: true,
      complement: fontes.sqComComplemento.has(sq),
      social_networks: (fontes.redesPorSq.get(sq) ?? 0) > 0,
      social_count: fontes.redesPorSq.get(sq) ?? 0,
    },
  }
}

/**
 * A cascata de sete degraus, primeiro casamento vence.
 *
 * Pura: mesmas entradas, mesma saida, sem relogio e sem disco. A ordem dos
 * degraus e contrato, nao acaso: subconjunto (5) vem antes de urna homonima (6)
 * porque ficha abreviada com cargo e UF batendo e evidencia mais forte que nome
 * de urna igual com nome civil divergente.
 */
export function classificarIdentidade(
  perfil: PerfilDaFicha,
  fontes: FontesTse,
): ResultadoClassificacao {
  const civil = compactar(perfil.nome_completo)
  const urna = compactar(perfil.nome_urna)
  const cargo = normalizarCargo(perfil.cargo_disputado)
  const estado = perfil.estado ?? null

  const alvo = fontes.todas.filter((linha) => CARGOS_ALVO.has(linha.DS_CARGO))
  const cargoOk = (linha: LinhaTse) => normalizarCargo(linha.DS_CARGO) === cargo
  // Permissiva de proposito: ficha sem UF (presidenciavel) casa com qualquer UF.
  const ufOk = (linha: LinhaTse) => !estado || linha.SG_UF === estado

  const base = {
    slug: perfil.slug,
    nome_completo: perfil.nome_completo,
    nome_urna: perfil.nome_urna,
    cargo_disputado: perfil.cargo_disputado,
    estado,
  }

  // 1) casamento exato: nome civil + nome de urna + cargo + UF, unico.
  const exato = alvo.filter(
    (linha) =>
      compactar(linha.NM_CANDIDATO) === civil &&
      compactar(linha.NM_URNA_CANDIDATO) === urna &&
      cargoOk(linha) &&
      ufOk(linha),
  )

  if (exato.length === 1) {
    return promover(
      base,
      exato[0],
      fontes,
      "casamento exato (nome civil + nome de urna + cargo + UF) no snapshot de 08/08; registro ausente no snapshot de 06/08 da B2",
    )
  }

  // 2) dois casamentos exatos: ambiguidade nao promove chave nenhuma.
  if (exato.length > 1) {
    return {
      ...base,
      classe: "ambiguo",
      motivo: "dois casamentos exatos no snapshot fresco",
      hits: exato.map(resumir),
    }
  }

  // 3) nome civil 1:1 + cargo + UF, urna diverge: revisao, nunca confirmacao.
  const civilIgual = alvo.filter((linha) => compactar(linha.NM_CANDIDATO) === civil)
  const civilOk = civilIgual.filter((linha) => cargoOk(linha) && ufOk(linha))
  // Hit UNICO e obrigatorio: dois registros com o mesmo nome civil, cargo e UF
  // nao promovem nem com a data batendo. Homonimo com a mesma data de
  // nascimento e raro, mas foi exatamente o caso que derrubou a rota 2 do
  // backfill de CPF, e "raro" nao e "impossivel".
  if (civilOk.length === 1 && nascimentoConfere(perfil.data_nascimento, civilOk[0])) {
    return promover(
      base,
      civilOk[0],
      fontes,
      "nome civil 1:1 + cargo + UF, e data de nascimento idêntica à do nosso cadastro (chave independente prevista no contrato); divergência de nome de urna superada",
    )
  }
  if (civilOk.length >= 1) {
    return {
      ...base,
      classe: "revisao_identidade",
      motivo:
        "nome civil 1:1 + cargo + UF, mas nome de urna diverge; identidade não confirmada por critério completo (falta nome de urna)",
      hits: civilOk.slice(0, 2).map(resumir),
    }
  }

  // 4) nome civil 1:1, mas cargo e/ou UF divergem do anunciado.
  if (civilIgual.length >= 1) {
    return {
      ...base,
      classe: "conflito_cargo_uf",
      motivo: "nome civil 1:1, mas cargo e/ou UF divergem do anunciado; sem chave de persistência",
      hits: civilIgual.map(resumir),
    }
  }

  // 5) nome civil da ficha e subconjunto do nome do TSE + cargo + UF.
  const subconjunto = alvo.filter((linha) => ehSubconjunto(perfil.nome_completo, linha))
  const subconjuntoOk = subconjunto.filter((linha) => cargoOk(linha) && ufOk(linha))
  if (subconjuntoOk.length === 1 && nascimentoConfere(perfil.data_nascimento, subconjuntoOk[0])) {
    return promover(
      base,
      subconjuntoOk[0],
      fontes,
      "nome civil da ficha é subconjunto do nome TSE + cargo + UF, e data de nascimento idêntica à do nosso cadastro (chave independente prevista no contrato)",
    )
  }
  if (subconjuntoOk.length >= 1) {
    return {
      ...base,
      classe: "revisao_identidade",
      motivo:
        "nome civil da ficha é subconjunto do nome TSE + cargo + UF; identidade não confirmada por chave independente",
      hits: subconjuntoOk.slice(0, 2).map(resumir),
    }
  }

  // 6) so o nome de urna casa: possivel homonimo, quarentena.
  const urnaIgual = alvo.filter((linha) => compactar(linha.NM_URNA_CANDIDATO) === urna)
  if (urnaIgual.length >= 1) {
    return {
      ...base,
      classe: "proxima_possivel_urna",
      motivo:
        "só nome de urna casa; nome civil diverge (possível homônimo ou registro com outro nome civil)",
      hits: urnaIgual.slice(0, 2).map(resumir),
    }
  }

  // 7) varredura de TODOS os cargos: registro real em cargo diferente.
  //    E evidencia de conflito editorial, nao confirmacao de identidade.
  const outroCargo = fontes.todas.filter(
    (linha) =>
      compactar(linha.NM_CANDIDATO) === civil && !CARGOS_ALVO.has(linha.DS_CARGO) && ufOk(linha),
  )
  if (outroCargo.length >= 1) {
    return {
      ...base,
      classe: "registro_encontrado_outro_cargo",
      motivo: `registro TSE em cargo diferente (${outroCargo[0].DS_CARGO}) com nome civil 1:1; conflito editorial, sem confirmação de identidade`,
      hits: outroCargo.slice(0, 2).map(resumir),
    }
  }

  const outroCargoSub = fontes.todas.filter(
    (linha) =>
      ehSubconjunto(perfil.nome_completo, linha) &&
      !CARGOS_ALVO.has(linha.DS_CARGO) &&
      ufOk(linha),
  )
  if (outroCargoSub.length >= 1) {
    return {
      ...base,
      classe: "registro_encontrado_outro_cargo",
      motivo: `registro TSE em cargo diferente (${outroCargoSub[0].DS_CARGO}) com nome civil subconjunto; conflito editorial, sem confirmação de identidade`,
      hits: outroCargoSub.slice(0, 2).map(resumir),
    }
  }

  // 8) nada compativel. NAO e prova de ausencia de registro: a janela de
  //    pedidos do TSE seguia aberta ate 15/08.
  return {
    ...base,
    classe: "nao_localizado_pelos_matchers",
    motivo:
      "nenhum registro 2026 compatível por nome civil, urna, cargo ou UF no snapshot de 08/08 (janela de registro aberta até 15/08)",
    hits: [],
  }
}

export interface LinhaLedgerB2 {
  candidate_slug: string
  proposals?: { field: string; query_result?: string | null }[]
}

/**
 * Deriva o universo de `no_safe_match` a partir do ledger, fail-closed.
 *
 * O numero esperado e argumento, e nao constante interna, para que o gate exista
 * no ponto onde a decisao foi tomada. Ledger perturbado, universo trocado ou
 * campo renomeado derrubam a derivacao em vez de produzir um conjunto menor em
 * silencio, que e o modo de falha que importa: um conjunto menor pareceria uma
 * classificacao bem-sucedida com menos gente.
 */
export function derivarUniversoNoSafeMatch(
  universo: readonly string[],
  ledger: readonly LinhaLedgerB2[],
  esperado: number,
): string[] {
  const porSlug = new Map(ledger.map((linha) => [linha.candidate_slug, linha.proposals ?? []]))
  const derivado = universo
    .filter((slug) => {
      const status = porSlug.get(slug)?.find((p) => p.field === "current_candidacy_status")
      return status?.query_result === "no_safe_match"
    })
    .sort()

  if (derivado.length !== esperado) {
    throw new Error(
      `esperado ${esperado} no_safe_match, derivado ${derivado.length} do ledger B2`,
    )
  }
  return derivado
}
