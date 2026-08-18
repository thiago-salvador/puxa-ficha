/**
 * Leitura fail-closed do registro `data/identidade-etapa2-2026.json`.
 *
 * ## O defeito que este modulo fecha
 *
 * A classificacao de identidade da etapa 2 vivia inteira em `output/`, que e
 * gitignorado (`.gitignore:15`). O teste que existia rodava so na maquina de
 * quem tinha os 3,3 MB de ZIPs, nunca em CI, e tinha quatro furos medidos: o
 * laco de contencao de chave era de forma vacuous-pass, nunca afirmava que
 * `match_fresco` TEM chave, nao afirmava contagem nenhuma, e conferia hashes
 * contra o arquivo que o proprio script acabara de reescrever.
 *
 * O registro versionado carrega as 71 entradas verbatim, o que torna os dois
 * hashes recomputaveis sem nenhum artefato de `output/`. Adulteracao manual
 * quebra o hash; a correcao e regenerar, nunca reescrever o hash.
 *
 * ## Por que existe um veredito para slug fora do universo
 *
 * O registro classificou 71 dos 271 slugs do seed. Se a porta de materializacao
 * lancasse para os outros 200, o primeiro autor a esbarrar nela apagaria a
 * chamada. Ela governa so o que de fato decidiu, e bloqueia com firmeza os 59.
 *
 * Espelha o padrao de `scripts/lib/identidade-bloqueada.ts`: parser que lanca,
 * indice memoizado, e consumidor que consulta ANTES de escrever.
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type { ClasseIdentidade, ResultadoClassificacao } from "./identidade-etapa2-classificador"
import { CLASSES, CLASSE_QUE_PROMOVE_CHAVE } from "./identidade-etapa2-classificador"

const CAMINHO_PADRAO = "data/identidade-etapa2-2026.json"

export type EntradaIdentidadeEtapa2 = ResultadoClassificacao

export interface RegistroIdentidadeEtapa2 {
  versao: number
  execucao: string
  pleito: number
  decidido_em: string
  total: number
  contrato: { classe_que_promove_chave: string; [k: string]: unknown }
  renovacao: {
    revalidar_ate: string
    responsavel: string
    procedimento: string[]
    [k: string]: unknown
  }
  consumidores: string[]
  fonte: {
    diagnostico_final_71_sha256: string
    slugs_derivados_71_sha256: string
    [k: string]: unknown
  }
  contagem: Record<string, number>
  entradas: EntradaIdentidadeEtapa2[]
}

const sha256 = (texto: string) => createHash("sha256").update(texto).digest("hex")

/** Reproduz o diagnostico gitignorado a partir das entradas versionadas. */
export function recomputarDiagnosticoSha256(entradas: readonly EntradaIdentidadeEtapa2[]): string {
  return sha256(JSON.stringify(Object.fromEntries(entradas.map((e) => [e.slug, e])), null, 2))
}

/** Reproduz o conjunto de slugs derivado do ledger da B2. */
export function recomputarSlugsSha256(entradas: readonly EntradaIdentidadeEtapa2[]): string {
  return `${entradas.map((e) => e.slug).join("\n")}\n`
}

export function recomputarSlugsHash(entradas: readonly EntradaIdentidadeEtapa2[]): string {
  return sha256(recomputarSlugsSha256(entradas))
}

function exigir(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(`identidade-etapa2: ${mensagem}`)
}

export function parseRegistroIdentidadeEtapa2(conteudo: string): RegistroIdentidadeEtapa2 {
  let bruto: unknown
  try {
    bruto = JSON.parse(conteudo)
  } catch (erro) {
    throw new Error(
      `identidade-etapa2: JSON inválido (${erro instanceof Error ? erro.message : erro})`,
    )
  }

  const r = bruto as RegistroIdentidadeEtapa2
  exigir(Array.isArray(r?.entradas), "arquivo sem a lista `entradas`")
  exigir(
    typeof r.total === "number" && r.total === r.entradas.length,
    `total declarado (${r?.total}) diferente das entradas (${r?.entradas?.length})`,
  )
  exigir(
    r.renovacao?.revalidar_ate && r.renovacao?.responsavel && r.renovacao?.procedimento?.length,
    "bloco `renovacao` incompleto: sem data, responsável ou procedimento a renovação vira uma data que ninguém sabe desarmar",
  )

  const vistos = new Set<string>()
  const contagemObservada: Record<string, number> = {}

  for (const [i, e] of r.entradas.entries()) {
    exigir(typeof e?.slug === "string" && e.slug.trim(), `entrada ${i} sem slug`)
    exigir(!vistos.has(e.slug), `slug duplicado: ${e.slug}`)
    vistos.add(e.slug)

    exigir(
      (CLASSES as readonly string[]).includes(e.classe),
      `${e.slug}: classe fora do vocabulário: ${e.classe}`,
    )
    contagemObservada[e.classe] = (contagemObservada[e.classe] ?? 0) + 1

    const promove = e.classe === CLASSE_QUE_PROMOVE_CHAVE
    if (promove) {
      exigir(
        e.chave?.type === "SQ_CANDIDATO" && /^\d+$/.test(e.chave.value ?? ""),
        `${e.slug}: ${CLASSE_QUE_PROMOVE_CHAVE} sem chave SQ_CANDIDATO numérica`,
      )
      exigir(e.frentes_tse?.registration === true, `${e.slug}: match_fresco sem frentes_tse`)
    } else {
      exigir(
        !Object.hasOwn(e, "chave"),
        `${e.slug}: classe ${e.classe} expõe propriedade chave; só ${CLASSE_QUE_PROMOVE_CHAVE} promove`,
      )
      exigir(!Object.hasOwn(e, "frentes_tse"), `${e.slug}: classe ${e.classe} expõe frentes_tse`)
    }
  }

  for (const [classe, n] of Object.entries(r.contagem ?? {})) {
    exigir(
      contagemObservada[classe] === n,
      `contagem declarada para ${classe} é ${n}, observada ${contagemObservada[classe] ?? 0}`,
    )
  }
  for (const [classe, n] of Object.entries(contagemObservada)) {
    exigir(
      r.contagem?.[classe] === n,
      `contagem observada para ${classe} é ${n}, mas o registro declara ${r.contagem?.[classe] ?? 0}`,
    )
  }

  const diagnostico = recomputarDiagnosticoSha256(r.entradas)
  exigir(
    diagnostico === r.fonte?.diagnostico_final_71_sha256,
    `diagnostico_final_71_sha256 divergente: declarado ${r.fonte?.diagnostico_final_71_sha256}, recomputado ${diagnostico}. ` +
      `Entrada editada à mão? A correção é regenerar com \`npm run data:identidade-etapa2:gerar\`, nunca reescrever o hash.`,
  )

  const slugsHash = recomputarSlugsHash(r.entradas)
  exigir(
    slugsHash === r.fonte?.slugs_derivados_71_sha256,
    `slugs_derivados_71_sha256 divergente: declarado ${r.fonte?.slugs_derivados_71_sha256}, recomputado ${slugsHash}`,
  )

  return r
}

export interface IndiceIdentidadeEtapa2 {
  registro: RegistroIdentidadeEtapa2
  todos: readonly EntradaIdentidadeEtapa2[]
  entrada(slug: string): EntradaIdentidadeEtapa2 | null
  contagem(): Record<string, number>
}

export function criarIndiceIdentidadeEtapa2(
  registro: RegistroIdentidadeEtapa2,
): IndiceIdentidadeEtapa2 {
  const porSlug = new Map(registro.entradas.map((e) => [e.slug, e]))
  return {
    registro,
    todos: registro.entradas,
    entrada: (slug) => porSlug.get(slug) ?? null,
    contagem: () => ({ ...registro.contagem }),
  }
}

/**
 * Memo por CAMINHO RESOLVIDO, nao global.
 *
 * A versao anterior guardava um indice so e ignorava `raiz`: o primeiro chamador
 * fixava o registro para o processo inteiro. Um processo que misturasse raizes,
 * e o teste mistura (`carregarIdentidadeEtapa2(RAIZ)` de um lado, o default
 * `process.cwd()` do outro), leria o registro de quem chamou primeiro, em
 * silencio, porque o segundo arquivo nunca chegava a ser aberto.
 */
const memo = new Map<string, IndiceIdentidadeEtapa2>()

export function carregarIdentidadeEtapa2(raiz = process.cwd()): IndiceIdentidadeEtapa2 {
  const caminho = resolve(raiz, CAMINHO_PADRAO)
  const emCache = memo.get(caminho)
  if (emCache) return emCache
  const indice = criarIndiceIdentidadeEtapa2(
    parseRegistroIdentidadeEtapa2(readFileSync(caminho, "utf-8")),
  )
  memo.set(caminho, indice)
  return indice
}

/** So para teste: descarta a memoizacao entre casos. */
export function resetarMemoIdentidadeEtapa2(): void {
  memo.clear()
}

/**
 * O registro venceu?
 *
 * O diagnóstico foi medido contra o snapshot do TSE de 08/08/2026, com a janela
 * de pedidos de registro ainda aberta até 15/08 às 19h. Depois de `revalidar_ate`
 * ele deixa de poder afirmar "não localizado" sobre os 43, porque essa
 * afirmação passa a depender de uma janela que já fechou.
 *
 * `agora` é parâmetro para que o teste exercite os dois lados sem depender do
 * relógio da máquina.
 */
export function registroVencido(
  indice: IndiceIdentidadeEtapa2,
  agora: number = Date.now(),
): boolean {
  const bruto = indice.registro.renovacao.revalidar_ate
  // FAIL-CLOSED. A versao anterior fazia `Number.isFinite(limite) && agora > limite`,
  // entao data invalida ou adulterada devolvia `false`, ou seja, "nao vencido":
  // bastava trocar `revalidar_ate` por lixo para o prazo sumir. Prazo ilegivel e
  // prazo nao verificavel, e prazo nao verificavel vence.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return true
  const limite = new Date(`${bruto}T23:59:59Z`).getTime()
  if (!Number.isFinite(limite)) return true
  // `2026-02-30` viraria 02/03 no `new Date`; conferir o calendario de verdade.
  const [a, m, d] = bruto.split("-").map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return true
  return agora > limite
}

export function mensagemDeRenovacao(indice: IndiceIdentidadeEtapa2): string {
  const { revalidar_ate, responsavel, procedimento } = indice.registro.renovacao
  return (
    `o registro de identidade da etapa 2 venceu em ${revalidar_ate}. ` +
    `Os 43 \`nao_localizado_pelos_matchers\` foram medidos contra o snapshot do TSE de 08/08/2026, ` +
    `antes de a janela de pedidos de registro fechar em 15/08. ` +
    `Responsável: ${responsavel}. Execute, nesta ordem: ${procedimento.join(" ; ")}. ` +
    `Prorrogar sem regenerar exige decisão registrada em Settings/STATUS.md no mesmo commit.`
  )
}

// ---------------------------------------------------------------------------
// A porta de materialização das etapas 5 e 9
// ---------------------------------------------------------------------------

export type VeredictoMaterializacao =
  | { permitido: true; motivo: "fora_do_universo_etapa2"; chave: null }
  | { permitido: true; motivo: "match_fresco"; chave: { type: "SQ_CANDIDATO"; value: string } }
  | { permitido: false; motivo: ClasseIdentidade; entrada: EntradaIdentidadeEtapa2 }

export function avaliarMaterializacaoTse2026(
  slug: string,
  indice: IndiceIdentidadeEtapa2 = carregarIdentidadeEtapa2(),
): VeredictoMaterializacao {
  const entrada = indice.entrada(slug)
  if (!entrada) return { permitido: true, motivo: "fora_do_universo_etapa2", chave: null }
  if (entrada.classe === CLASSE_QUE_PROMOVE_CHAVE && entrada.chave) {
    return { permitido: true, motivo: "match_fresco", chave: entrada.chave }
  }
  return { permitido: false, motivo: entrada.classe, entrada }
}

/**
 * Fail-closed: devolve a chave, `null` fora do universo, ou LANÇA.
 *
 * Registro vencido derruba a promoção de chave, e é aqui que a validade morde,
 * não na suíte inteira. O prazo protege contra tratar "não localizado em 08/08"
 * como "não existe", e esse risco só se materializa quando alguém USA o registro
 * para autorizar escrita. Um refactor de componente não tem por que ficar
 * vermelho por causa da janela de registro do TSE.
 */
export function exigirMaterializacaoTse2026(
  slug: string,
  indice: IndiceIdentidadeEtapa2 = carregarIdentidadeEtapa2(),
  agora: number = Date.now(),
): { type: "SQ_CANDIDATO"; value: string } | null {
  const veredito = avaliarMaterializacaoTse2026(slug, indice)
  if (veredito.permitido && veredito.chave && registroVencido(indice, agora)) {
    throw new Error(`identidade-etapa2: ${mensagemDeRenovacao(indice)}`)
  }
  if (veredito.permitido) return veredito.chave
  throw new Error(
    `identidade-etapa2: ${slug} está classificado como ${veredito.motivo} e não pode materializar ` +
      `candidatura TSE 2026. Motivo registrado: ${veredito.entrada.motivo}`,
  )
}

// ---------------------------------------------------------------------------
// Consumidor real: conferência do seed, executada por `npm run validate:seed`
// ---------------------------------------------------------------------------

export interface CandidatoDoSeed {
  slug: string
  ids?: { tse_sq_candidato?: Record<string, string> | null } | null
}

export interface ViolacaoDeSeedEtapa2 {
  slug: string
  ano: string
  sq: string
  classe: ClasseIdentidade
  tipo: "classe_bloqueada" | "chave_divergente" | "evidencia_promovida"
  detalhe: string
}

/**
 * Confere `data/candidatos.json` contra a decisão da etapa 2.
 *
 * É a checagem de PÓS-CONDIÇÃO, e é deliberadamente mais forte que uma varredura
 * do código escritor: ela não depende de COMO o valor chegou ao seed. Qualquer
 * caminho que materialize um SQ 2026 para slug bloqueado é acusado aqui.
 */
export function conferirSeedContraEtapa2(
  seed: readonly CandidatoDoSeed[],
  indice: IndiceIdentidadeEtapa2,
): ViolacaoDeSeedEtapa2[] {
  const violacoes: ViolacaoDeSeedEtapa2[] = []

  for (const candidato of seed) {
    const entrada = indice.entrada(candidato.slug)
    if (!entrada) continue

    const porAno = candidato.ids?.tse_sq_candidato ?? {}
    const sq2026 = porAno["2026"]

    if (sq2026) {
      if (entrada.classe !== CLASSE_QUE_PROMOVE_CHAVE) {
        violacoes.push({
          slug: candidato.slug,
          ano: "2026",
          sq: sq2026,
          classe: entrada.classe,
          tipo: "classe_bloqueada",
          detalhe: `a etapa 2 classificou como ${entrada.classe} e não confirmou identidade: ${entrada.motivo}`,
        })
      } else if (entrada.chave && String(sq2026) !== entrada.chave.value) {
        violacoes.push({
          slug: candidato.slug,
          ano: "2026",
          sq: sq2026,
          classe: entrada.classe,
          tipo: "chave_divergente",
          detalhe: `a etapa 2 confirmou o SQ ${entrada.chave.value}, e o seed traz ${sq2026}`,
        })
      }
    }

    // Evidência de classe bloqueada não pode virar chave, em ano nenhum. Escopo
    // no mesmo slug de propósito: o SQ do hit pertence legitimamente a outra
    // pessoa, que pode ser outro slug do seed.
    if (entrada.classe !== CLASSE_QUE_PROMOVE_CHAVE) {
      const sqsDeEvidencia = new Set(entrada.hits.map((h) => String(h.sq)))
      for (const [ano, sq] of Object.entries(porAno)) {
        if (!sqsDeEvidencia.has(String(sq))) continue
        violacoes.push({
          slug: candidato.slug,
          ano,
          sq: String(sq),
          classe: entrada.classe,
          tipo: "evidencia_promovida",
          detalhe: `${sq} aparece em hits[] como EVIDÊNCIA de ${entrada.classe}, não como identidade confirmada`,
        })
      }
    }
  }

  return violacoes
}
