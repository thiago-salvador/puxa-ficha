/**
 * Confere as migrations desta branch contra a allowlist (2026-08-02).
 *
 * Duas checagens independentes, ambas obrigatórias:
 *   1. TODO statement de escrita (INSERT / UPDATE / DELETE) das migrations
 *      selecionadas tem uma anotação `-- @write` imediatamente acima. Statement
 *      de escrita sem anotação é erro: seria escrita invisível para o gate.
 *   2. TODA anotação `-- @write` está contida na allowlist informada, casando tabela, slug e,
 *      quando a allowlist especifica, ano, tema ou teto de registros. Escrita em
 *      tabela de referência é anotada com `ref=` e conferida contra o bloco
 *      `referencias`.
 *
 * Não toca banco nem rede.
 *
 * ## Dois modos, e o pelado é o que vale como gate
 *
 * **Modo completo** (`npm run audit:cobertura:allowlist`, sem flag nenhuma):
 * lê `recortes.json`, roda a checagem 2 UMA VEZ POR RECORTE, cada uma na própria
 * janela e contra a própria allowlist, e roda a checagem 1 sobre a árvore inteira
 * contra `baseline-escritas-sem-anotacao.json`. É o único modo que responde
 * "a árvore está inteira?".
 *
 * Antes disso o comando pelado caía numa allowlist default e sem janela, isto é,
 * conferia TODOS os recortes contra a autorização de UM. Em 09/08/2026 isso dava
 * exit 1 com 550 violações, das quais 208 eram "fora da coorte"/"fora por
 * construção" e outras 44 eram entrada ou referência que não casa: 252 linhas
 * vermelhas que não eram defeito de migration nenhuma, só artefato da invocação.
 * Gate que falha sempre para de ser lido, e este parou: dois documentos
 * declararam "allowlist OK" enquanto ele estava vermelho.
 *
 * **Modo recorte** (`--allowlist=... --desde=... --ate=...`): confere um recorte
 * só. É o modo de quem está AUTORANDO um recorte novo, antes de ele existir em
 * `recortes.json`. `--desde` e `--ate` são obrigatórios aqui, e não existe mais
 * allowlist default: as omissões que o default aceitava em silêncio eram
 * exatamente as que produziam relatório vermelho sem significado.
 *
 * ATENÇÃO À JANELA: `--desde` e `--ate` são comparação de PREFIXO do nome do
 * arquivo, não data, e `--ate` é inclusivo. `--ate` é obrigatório porque
 * `--desde` sozinho não tem teto, então TODO recorte criado depois entra na
 * janela dos anteriores. Isso mordeu quatro vezes entre 02 e 03/08/2026. Sem
 * teto, uma janela correta hoje quebra sozinha amanhã, quando alguém criar a
 * próxima migration.
 *
 * A lista de janelas NÃO mora mais neste comentário. Morava, listava 4 dos 13
 * recortes deste slice e ninguém a conferia. (O décimo quarto recorte,
 * `verificacao-campos-b2-20260809`, existe só no checkout combinado com o
 * trabalho da B2, e chega junto com a migration e a allowlist dele, porque
 * recorte apontando para allowlist ausente reprova.) Agora é `recortes.json`, e
 * o próprio checker
 * valida que ela cobre toda migration anotada, que as janelas não se sobrepõem e
 * que nenhuma allowlist do diretório ficou sem recorte.
 */

import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { lerPendingWrites, type PendingWrite } from "./lib/pending-writes"

/**
 * Raiz do projeto. `PF_AUDIT_RAIZ` existe só para o teste end-to-end apontar o
 * checker para uma árvore de fixture: as quatro bordas fail-closed só provam
 * alguma coisa se o processo real rodar de verdade, e provar isso mutando
 * `supabase/migrations/` de propósito deixaria lixo no repositório se o teste
 * quebrasse no meio.
 */
const RAIZ = process.env.PF_AUDIT_RAIZ
  ? resolve(process.env.PF_AUDIT_RAIZ)
  : resolve(import.meta.dirname, "..", "..")
const MIGRATIONS = join(RAIZ, "supabase", "migrations")

interface AllowEntry {
  tabela: string
  slug: string
  ano?: number
  temas?: string[]
  max_registros?: number
  campos: string[]
}

/**
 * Escrita permitida em tabela de REFERÊNCIA (sem candidato dono), declarada na
 * migration com `ref=` em vez de `slug=`. Fica em bloco separado de propósito:
 * `coorte` governa de quem se pode falar, e correção de referência não pertence
 * a ninguém da coorte.
 */
interface AllowRef {
  tabela: string
  ref: string
  campos: string[]
}

interface Allowlist {
  coorte: string[]
  fora_por_construcao: { slugs: string[] }
  entries: AllowEntry[]
  referencias?: AllowRef[]
}

const ESCRITA = /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i

/**
 * Tabelas temporárias declaradas no próprio arquivo.
 *
 * `CREATE TEMP TABLE ... ON COMMIT DROP` é rascunho: existe dentro da transação
 * da migration, some no commit e nunca chega à superfície pública. Escrever nela
 * não é escrita em produção, e exigir entrada de allowlist para isso é pedir que
 * alguém declare um dado que não persiste.
 *
 * Isso não é conveniência, é precisão do gate. Enquanto o checker tratava
 * rascunho como produção, `20260805123929` reprovava em qualquer recorte, e o
 * comando inteiro ficou vermelho desde 05/08/2026. Um gate que falha sempre para
 * de ser lido, e foi o que aconteceu: dois documentos declararam "allowlist OK"
 * enquanto ele não passava. Gate barulhento é gate desligado.
 */
export function tabelasTemporarias(sql: string): Set<string> {
  const encontradas = new Set<string>()
  const padrao = /\bCREATE\s+(?:GLOBAL\s+|LOCAL\s+)?TEMP(?:ORARY)?\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w$]*)/gi
  for (const m of sql.matchAll(padrao)) encontradas.add(m[1].toLowerCase())
  return encontradas
}

/** O statement escreve numa tabela temporária declarada neste mesmo arquivo? */
export function escreveEmTemporaria(statement: string, temporarias: Set<string>): boolean {
  if (temporarias.size === 0) return false
  const alvo =
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?([a-zA-Z_][\w$]*)/i.exec(statement)
  return alvo ? temporarias.has(alvo[1].toLowerCase()) : false
}

/** Statements de escrita sem anotação `@write` logo acima. */
export function escritasSemAnotacao(sql: string): { linha: number; texto: string }[] {
  const linhas = sql.split("\n")
  const orfas: { linha: number; texto: string }[] = []
  const temporarias = tabelasTemporarias(sql)

  for (let i = 0; i < linhas.length; i += 1) {
    if (!ESCRITA.test(linhas[i])) continue
    if (escreveEmTemporaria(linhas[i], temporarias)) continue
    let j = i - 1
    let anotada = false
    // Sobe por linhas em branco e comentários até achar (ou não) a anotação.
    while (j >= 0) {
      const t = linhas[j].trim()
      if (t === "") { j -= 1; continue }
      if (t.startsWith("--")) {
        if (/^--\s*@write\b/.test(t)) { anotada = true; break }
        j -= 1
        continue
      }
      break
    }
    if (!anotada) orfas.push({ linha: i + 1, texto: linhas[i].trim().slice(0, 120) })
  }
  return orfas
}

export function violacoesDeAllowlist(writes: PendingWrite[], allow: Allowlist): string[] {
  const erros: string[] = []
  const bloqueados = new Set(allow.fora_por_construcao.slugs)
  const contagemPorEntrada = new Map<AllowEntry, number>()

  for (const w of writes) {
    if (w.ref !== undefined) {
      const entrada = (allow.referencias ?? []).find(
        (e) => e.tabela === w.tabela && e.ref === w.ref
      )
      if (!entrada) {
        erros.push(
          `${w.arquivo}:${w.linha}: referência (${w.tabela}, ref=${w.ref}) não está no bloco referencias da allowlist`
        )
        continue
      }
      const fora = w.campos.filter((c) => !entrada.campos.includes(c))
      if (fora.length) {
        erros.push(
          `${w.arquivo}:${w.linha}: campos fora da allowlist para ${w.tabela}/ref=${w.ref}: ${fora.join(", ")}`
        )
      }
      continue
    }

    if (!allow.coorte.includes(w.slug)) {
      erros.push(`${w.arquivo}:${w.linha}: slug ${w.slug} está fora da coorte da allowlist`)
      continue
    }
    if (bloqueados.has(w.slug)) {
      erros.push(`${w.arquivo}:${w.linha}: slug ${w.slug} está fora por construção`)
      continue
    }

    const candidatas = allow.entries.filter((e) => e.tabela === w.tabela && e.slug === w.slug)
    if (!candidatas.length) {
      erros.push(`${w.arquivo}:${w.linha}: (${w.tabela}, ${w.slug}) não está na allowlist`)
      continue
    }

    const entrada = candidatas.find((e) => {
      if (e.ano !== undefined && e.ano !== w.ano) return false
      if (e.temas && (!w.tema || !e.temas.includes(w.tema))) return false
      return true
    })
    if (!entrada) {
      erros.push(
        `${w.arquivo}:${w.linha}: (${w.tabela}, ${w.slug}, ano=${w.ano ?? "-"}, tema=${w.tema ?? "-"}) não casa com nenhuma entrada da allowlist`
      )
      continue
    }

    const foraDoCampo = w.campos.filter((c) => !entrada.campos.includes(c))
    if (foraDoCampo.length) {
      erros.push(
        `${w.arquivo}:${w.linha}: campos fora da allowlist para ${w.tabela}/${w.slug}: ${foraDoCampo.join(", ")}`
      )
    }

    const n = (contagemPorEntrada.get(entrada) ?? 0) + 1
    contagemPorEntrada.set(entrada, n)
    if (entrada.max_registros !== undefined && n > entrada.max_registros) {
      erros.push(
        `${w.arquivo}:${w.linha}: ${w.tabela}/${w.slug} excede max_registros=${entrada.max_registros}`
      )
    }
  }

  return erros
}

/** Um recorte é o par (janela de migrations, allowlist que autoriza o que elas escrevem). */
export interface Recorte {
  nome: string
  desde: string
  ate: string
  /** `null` = escrita declarada com `@write` que allowlist nenhuma autoriza. Exige `divida`. */
  allowlist: string | null
  /**
   * Dívida congelada. Preenchido, as violações deste recorte são impressas e
   * nomeadas mas não derrubam o comando; o recorte segue visível em vez de
   * virar ruído que apaga o resto do relatório. Recorte novo nasce com `null`.
   */
  divida: DividaCongelada | null
}

/**
 * Dívida histórica congelada EXATA.
 *
 * `motivo` sozinho não é congelamento, é rótulo: enquanto a dívida era só uma
 * string, um arquivo novo caindo na janela e uma violação a mais dentro dela
 * passavam em silêncio, porque o recorte inteiro estava dispensado de reprovar.
 * Congelar de verdade exige as duas listas abaixo.
 */
export interface DividaCongelada {
  motivo: string
  congelado_em: string
  /** Conjunto EXATO de .sql na janela no congelamento. Arquivo novo aqui reprova. */
  arquivos: string[]
  /** Impressão digital da lista de violações e escritas declaradas. Violação a mais reprova. */
  violacoes_sha256: string
  /** Quantas linhas a impressão digital cobre. Só para o relatório ser legível. */
  violacoes: number
}

export interface MapaDeRecortes {
  recortes: Recorte[]
  allowlists_sem_recorte: { allowlist: string; motivo: string }[]
}

/** Entrada congelada do baseline: quantas escritas órfãs e o conteúdo que as produziu. */
export interface EntradaBaseline {
  statements: number
  sha256: string
}

/**
 * Roster FECHADO das dívidas históricas, medido em 09/08/2026.
 *
 * Mora no código, não no JSON, e isso é a regra e não um detalhe: se a lista
 * vivesse em `recortes.json`, criar dívida nova seria acrescentar uma linha ao
 * mesmo arquivo que já se está editando, e a dispensa de reprovar viraria a
 * saída mais barata para qualquer escrita que não passe na allowlist. Aqui,
 * declarar dívida nova exige editar o checker, o que é um ato revisado como
 * código. Dívida é dado histórico: esta lista só encolhe.
 */
export const DIVIDAS_CONGELADAS: ReadonlySet<string> = new Set([
  "correcoes-claims-pos-factcheck",
  "limpeza-familia-sem-mandato",
  "editoriais-e-homonimos-20260805",
  "historico-judicial-sem-merito-20260807",
  "marcadores-tse-residuais-20260808",
])

const MARCA_FIM = "￿"

/** A janela é comparação de prefixo do nome do arquivo, e `ate` é inclusivo. */
export function naJanela(arquivo: string, desde: string, ate: string): boolean {
  return arquivo >= desde && arquivo <= `${ate}${MARCA_FIM}`
}

/**
 * Impressão digital de um conjunto de linhas de violação.
 *
 * Ordenada e deduplicada, para não depender da ordem de leitura do diretório.
 * O que ela protege: dentro de um recorte de dívida a contagem sozinha não basta,
 * porque trocar uma violação por outra mantém o número e muda o que está sendo
 * dispensado.
 */
export function impressaoDeViolacoes(itens: string[]): string {
  const canonico = [...new Set(itens)].sort().join("\n")
  return createHash("sha256").update(canonico).digest("hex")
}

/**
 * A dívida congelada continua sendo exatamente a que foi medida?
 *
 * Três coisas reprovam: arquivo novo na janela, arquivo que sumiu da janela, e
 * impressão digital diferente. As três são a mesma pergunta feita de ângulos
 * distintos, porque dispensar um recorte de reprovar é caro demais para valer
 * por aproximação.
 */
export function violacoesDeDivida(
  recorte: Recorte,
  arquivosNaJanela: string[],
  itensAtuais: string[]
): string[] {
  const divida = recorte.divida
  if (!divida) return []

  const erros: string[] = []
  const congelados = new Set(divida.arquivos)
  const agora = new Set(arquivosNaJanela)

  for (const arquivo of [...agora].sort()) {
    if (congelados.has(arquivo)) continue
    erros.push(
      `recorte ${recorte.nome}: ${arquivo} entrou na janela de uma dívida congelada. Dívida é conjunto histórico fechado; migration nova precisa de recorte próprio com allowlist, não de carona na dispensa.`
    )
  }
  for (const arquivo of [...congelados].sort()) {
    if (agora.has(arquivo)) continue
    erros.push(
      `recorte ${recorte.nome}: ${arquivo} saiu da janela da dívida congelada. Atualize o bloco divida em recortes.json.`
    )
  }

  const impressao = impressaoDeViolacoes(itensAtuais)
  if (impressao !== divida.violacoes_sha256) {
    erros.push(
      `recorte ${recorte.nome}: as violações mudaram (${divida.violacoes} congelada(s), ${new Set(itensAtuais).size} agora; sha256 ${divida.violacoes_sha256.slice(0, 12)} != ${impressao.slice(0, 12)}). Dívida congelada não absorve violação nova.`
    )
  }

  return erros
}

/**
 * O mapa de recortes cobre a árvore de verdade?
 *
 * Os invariantes não são conveniência. Janela sobreposta faz a mesma escrita ser
 * conferida contra duas autorizações diferentes, e passa se QUALQUER uma aceitar.
 * Migration anotada fora de todo recorte é escrita declarada que o gate nunca
 * abre. Dívida fora do roster fechado é a dispensa de reprovar virando saída de
 * emergência. Os três buracos são silenciosos: o relatório fica verde dizendo
 * menos do que parece.
 */
export function violacoesDeCobertura(
  recortes: Recorte[],
  arquivosComWrite: string[],
  roster: ReadonlySet<string> = DIVIDAS_CONGELADAS
): string[] {
  const erros: string[] = []

  for (const r of recortes) {
    if (r.desde > r.ate) erros.push(`recorte ${r.nome}: janela invertida (${r.desde} > ${r.ate})`)
    if (r.allowlist === null && !r.divida) {
      erros.push(
        `recorte ${r.nome}: allowlist=null sem divida declarada. Recorte sem autorização só existe como dívida nomeada.`
      )
    }
    if (r.divida && !roster.has(r.nome)) {
      erros.push(
        `recorte ${r.nome}: declara divida e não está no roster fechado DIVIDAS_CONGELADAS. Dívida é o que já existia em 09/08/2026, não uma porta para escrita nova.`
      )
    }
    if (!r.divida && roster.has(r.nome)) {
      erros.push(
        `recorte ${r.nome}: está no roster DIVIDAS_CONGELADAS e perdeu o bloco divida. Fechar a dívida é tirar o nome do roster no código, não apagar o congelamento do JSON.`
      )
    }
  }

  const ordenados = [...recortes].sort((a, b) => a.desde.localeCompare(b.desde))
  for (let i = 1; i < ordenados.length; i += 1) {
    const anterior = ordenados[i - 1]
    const atual = ordenados[i]
    if (atual.desde <= `${anterior.ate}${MARCA_FIM}`) {
      erros.push(
        `recortes ${anterior.nome} e ${atual.nome} têm janelas sobrepostas (${anterior.desde}..${anterior.ate} x ${atual.desde}..${atual.ate})`
      )
    }
  }

  for (const arquivo of arquivosComWrite) {
    const donos = recortes.filter((r) => naJanela(arquivo, r.desde, r.ate))
    if (donos.length === 0) {
      erros.push(
        `${arquivo}: tem anotação @write e não cai em recorte nenhum de recortes.json. Escrita declarada que o gate nunca confere.`
      )
    }
  }

  return erros
}

/**
 * Toda allowlist do diretório tem dono?
 *
 * Allowlist órfã é o modo de falha mais caro achado em 09/08/2026: a autorização
 * fica registrada no repositório, ninguém a aponta para uma janela, e o gate
 * nunca a exercita. Foi o que aconteceu com `allowlist-correcoes-claims.json` e
 * `allowlist-limpeza-familia-sem-mandato.json`, criadas no MESMO commit da
 * migration que deviam governar, contra SQL que saiu sem uma anotação sequer.
 */
export function violacoesDeInventario(
  mapa: MapaDeRecortes,
  allowlistsNoDisco: string[]
): string[] {
  const erros: string[] = []
  const usos = new Map<string, string[]>()

  for (const r of mapa.recortes) {
    if (r.allowlist === null) continue
    usos.set(r.allowlist, [...(usos.get(r.allowlist) ?? []), r.nome])
  }
  for (const [allowlist, nomes] of usos) {
    if (nomes.length > 1) {
      erros.push(`allowlist ${allowlist} referenciada por mais de um recorte: ${nomes.join(", ")}`)
    }
    // Sem esta linha o arquivo faltante só aparecia como ENOENT com stack trace,
    // lá adiante no `readFileSync` de `conferirRecorte`. Gate que morre por
    // exceção não diz QUAL recorte está errado, e ainda parece defeito do
    // checker em vez de mapa desatualizado.
    if (!allowlistsNoDisco.includes(allowlist)) {
      erros.push(
        `allowlist ${allowlist}, referenciada pelo(s) recorte(s) ${nomes.join(", ")}, não existe no diretório`
      )
    }
  }

  const dispensadas = new Set(mapa.allowlists_sem_recorte.map((a) => a.allowlist))
  for (const allowlist of allowlistsNoDisco) {
    if (usos.has(allowlist) && dispensadas.has(allowlist)) {
      erros.push(`allowlist ${allowlist} está em recortes e em allowlists_sem_recorte ao mesmo tempo`)
      continue
    }
    if (!usos.has(allowlist) && !dispensadas.has(allowlist)) {
      erros.push(
        `allowlist ${allowlist} não é referenciada por recorte nenhum. Autorização registrada que o gate nunca exercita: aponte-a para uma janela ou declare o motivo em allowlists_sem_recorte.`
      )
    }
  }
  for (const allowlist of dispensadas) {
    if (!allowlistsNoDisco.includes(allowlist)) {
      erros.push(`allowlists_sem_recorte aponta para ${allowlist}, que não existe no diretório`)
    }
  }

  return erros
}

/**
 * O baseline das escritas anteriores ao gate continua sendo só o que era?
 *
 * Regressão é fail-closed POR ARQUIVO, nunca por total. Um total congelado
 * quebraria no merge da próxima migration vinda de outro PR, e ainda diria
 * "piorou" sem dizer onde. O sha256 existe para que editar uma migration já
 * aplicada não deixe a contagem igual e o conteúdo diferente: trocar qual linha
 * um UPDATE atinge é exatamente a escrita invisível que o gate existe para pegar.
 */
export function violacoesDeBaseline(
  atual: Map<string, EntradaBaseline>,
  baseline: Record<string, EntradaBaseline>
): string[] {
  const erros: string[] = []

  for (const [arquivo, agora] of atual) {
    const congelado = baseline[arquivo]
    if (!congelado) {
      erros.push(
        `${arquivo}: ${agora.statements} statement(s) de escrita sem anotação @write, e o arquivo não está no baseline. Anote com -- @write e abra o recorte em recortes.json.`
      )
      continue
    }
    if (agora.statements !== congelado.statements) {
      erros.push(
        `${arquivo}: escritas sem anotação passaram de ${congelado.statements} para ${agora.statements}. Atualize a entrada do baseline só depois de anotar o que dá para anotar.`
      )
      continue
    }
    if (agora.sha256 !== congelado.sha256) {
      erros.push(
        `${arquivo}: está no baseline com a mesma contagem, mas o conteúdo mudou (sha256 diferente). Migration do baseline é imutável: se ela precisou mudar, anote as escritas e tire o arquivo daqui.`
      )
    }
  }

  for (const arquivo of Object.keys(baseline)) {
    if (atual.has(arquivo)) continue
    erros.push(
      `${arquivo}: entrada obsoleta no baseline (o arquivo não tem mais escrita sem anotação, ou não existe mais). Remova a entrada, para o baseline só encolher.`
    )
  }

  return erros
}

/** Escritas órfãs por arquivo em toda a árvore, com o hash do conteúdo que as produziu. */
function escritasOrfasDaArvore(): Map<string, EntradaBaseline> {
  const mapa = new Map<string, EntradaBaseline>()
  for (const arquivo of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, arquivo), "utf8")
    const orfas = escritasSemAnotacao(sql)
    if (!orfas.length) continue
    mapa.set(arquivo, {
      statements: orfas.length,
      sha256: createHash("sha256").update(sql).digest("hex"),
    })
  }
  return mapa
}

/** Forma canônica de uma escrita declarada. Entra na impressão digital da dívida, então o teste end-to-end congela pelo mesmo caminho que a produção. */
export const descreve = (w: PendingWrite): string =>
  `${w.tabela}/${w.slug || `ref=${w.ref}`}${w.ano ? ` ano=${w.ano}` : ""}${w.tema ? ` tema=${w.tema}` : ""}${w.proposicao ? ` prop=${w.proposicao}` : ""} (${w.arquivo}:${w.linha})`

/**
 * Confere UM recorte: as duas checagens dentro de uma janela, contra uma allowlist.
 * É o que o modo recorte roda direto e o que o modo completo roda por recorte.
 */
function conferirRecorte(
  desde: string,
  ate: string,
  allowlistPath: string | null,
  verboso: boolean
): { erros: string[]; writes: PendingWrite[]; arquivos: string[] } {
  const arquivos = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => naJanela(f, desde, ate))
    .sort()

  const erros: string[] = []
  for (const arquivo of arquivos) {
    const sql = readFileSync(join(MIGRATIONS, arquivo), "utf8")
    for (const o of escritasSemAnotacao(sql)) {
      erros.push(`${arquivo}:${o.linha}: statement de escrita sem anotação @write -> ${o.texto}`)
    }
  }

  const writes = lerPendingWrites(MIGRATIONS, desde, ate)
  if (allowlistPath !== null) {
    const allow = JSON.parse(readFileSync(resolve(RAIZ, allowlistPath), "utf8")) as Allowlist
    erros.push(...violacoesDeAllowlist(writes, allow))
  }

  // Duas listas, nunca uma só. Escrita endereçada por chave (`chave=`) tem o
  // identificador provado contra o SQL, mas o slug declarado NÃO: resolver
  // `chave='<uuid>'` para um candidato exige o banco, e este checker não toca
  // banco. Misturar as duas na mesma lista de `OK` faria o relatório afirmar
  // uma prova que não existe. Seção separada é o preço de aceitar a forma:
  // a escrita fica visível e nomeada para revisão humana, em vez de aceita
  // em silêncio no meio de duzentas linhas iguais.
  const verificadas = writes.filter((w) => w.chave === undefined)
  const porChave = writes.filter((w) => w.chave !== undefined)

  if (verboso) {
    for (const w of verificadas) console.error(`  OK ${descreve(w)}`)
    if (porChave.length) {
      console.error(
        `\n[nao verificavel estaticamente] ${porChave.length} escrita(s) endereçada(s) por chave.` +
          ` A chave declarada aparece literal no SQL; o slug/ref declarado NÃO, e só a allowlist responde por ele.`
      )
      for (const w of porChave) console.error(`  CHAVE chave=${w.chave} ${descreve(w)}`)
    }
  } else if (porChave.length) {
    console.error(`     ${porChave.length} endereçada(s) por chave, não verificável estaticamente`)
  }

  return { erros, writes, arquivos }
}

/**
 * As linhas que a impressão digital de uma dívida cobre.
 *
 * Violações E escritas declaradas, porque as duas mudam o que está sendo
 * dispensado: uma escrita nova dentro de um recorte de dívida não produz
 * "violação" quando não há allowlist contra a qual violar, e ainda assim é
 * exatamente o que não pode entrar de carona.
 */
function itensDaDivida(erros: string[], writes: PendingWrite[]): string[] {
  return [...erros, ...writes.map((w) => `write ${descreve(w)}`)]
}

/** As três únicas flags que existem. Qualquer outra coisa no argv é erro de invocação. */
const FLAGS_CONHECIDAS = ["allowlist", "desde", "ate"]

/**
 * Parser estrito de argumentos, e o "estrito" é a correção de um fail-open real.
 *
 * A versão anterior procurava `--nome=` e devolvia `undefined` quando não achava.
 * Consequência medida em 09/08/2026: `--allowlist X --desde Y --ate Z`, na forma
 * com ESPAÇO, fazia os três lookups voltarem `undefined`, o comando caía no modo
 * completo e imprimia `OK` com exit 0. Quem estava autorando um recorte novo lia
 * verde e concluía que o recorte dele passou, quando nada dele tinha sido
 * conferido. Gate que devolve verde sobre a coisa errada é pior que gate
 * vermelho, e este PR existe justamente para acabar com essa classe de bug.
 *
 * Por isso não há tolerância: forma com espaço, flag desconhecida, argumento
 * posicional, valor vazio e flag repetida saem todos com exit 2. Nunca cair no
 * modo completo por omissão.
 */
export function lerArgumentos(argv: string[]): { valores: Map<string, string>; erros: string[] } {
  const valores = new Map<string, string>()
  const erros: string[] = []

  for (const bruto of argv) {
    const casamento = /^--([^=]+)(?:=(.*))?$/.exec(bruto)
    if (!casamento) {
      erros.push(
        `argumento posicional não reconhecido: ${JSON.stringify(bruto)}. Provavelmente é o valor de uma flag escrita com espaço em vez de "=".`
      )
      continue
    }

    const [, nome, valor] = casamento
    if (!FLAGS_CONHECIDAS.includes(nome)) {
      erros.push(`flag desconhecida: --${nome}`)
      continue
    }
    if (valor === undefined) {
      erros.push(
        `--${nome} exige a forma --${nome}=valor. A forma com espaço faria o argumento sumir e o comando cair no modo completo, devolvendo OK sobre a árvore inteira sem conferir o recorte que você queria.`
      )
      continue
    }
    if (valor === "") {
      erros.push(`--${nome}= veio sem valor`)
      continue
    }
    if (valores.has(nome)) {
      erros.push(`--${nome} repetida; a segunda ocorrência seria silenciosamente ignorada`)
      continue
    }
    valores.set(nome, valor)
  }

  return { valores, erros }
}

/** Modo recorte: um recorte só, janela e allowlist explícitas. Para AUTORAR um recorte novo. */
function modoRecorte(desde: string | undefined, ate: string | undefined, allowlistPath: string): void {
  if (!desde || !ate) {
    console.error(
      "--allowlist exige --desde e --ate. Sem teto, a janela deste recorte engole toda migration criada depois dele."
    )
    process.exit(2)
  }

  const { erros, writes, arquivos } = conferirRecorte(desde, ate, allowlistPath, true)
  console.error(
    `\n[allowlist] ${arquivos.length} migration(s) na janela, ${writes.length} write(s) declarado(s) contra ${allowlistPath}`
  )

  // Janela vazia é a segunda forma do fail-open que o parser estrito fechou.
  // Este modo existe para PROVAR que uma migration nova está autorizada; janela
  // que não pega arquivo nenhum não prova nada e ainda assim saía `OK` com exit
  // 0, então um prefixo digitado errado virava aprovação. A janela é comparação
  // de PREFIXO do nome do arquivo, não data, que é justamente onde o erro de
  // digitação acontece.
  if (arquivos.length === 0) {
    console.error(
      `\n1 violação(ões):\n  FAIL a janela ${desde}..${ate} não pega migration nenhuma. ` +
        "Janela vazia não prova autorização: confira o prefixo, que é comparação de nome de arquivo e não data."
    )
    process.exit(1)
  }

  // Violação concreta fala antes do guard genérico abaixo: escrita sem anotação
  // é diagnóstico melhor do que "a allowlist não exercitou nada", e as duas
  // condições aparecem juntas quando a janela pega migration legada.
  if (erros.length) {
    console.error(`\n${erros.length} violação(ões):`)
    for (const e of erros) console.error(`  FAIL ${e}`)
    process.exit(1)
  }

  // Espelha a regra de inventário do modo completo: allowlist que não exercita
  // escrita nenhuma é autorização que ninguém checou.
  if (writes.length === 0) {
    console.error(
      `\n1 violação(ões):\n  FAIL a allowlist ${allowlistPath} não conferiu escrita nenhuma nesta janela. ` +
        "Allowlist que não exercita nada é autorização que ninguém checou."
    )
    process.exit(1)
  }
  console.error("\nOK: toda escrita declarada está dentro da allowlist.")
}

/** Modo completo: a árvore inteira, cada recorte contra a própria allowlist. */
function modoCompleto(): void {
  const mapa = JSON.parse(
    readFileSync(join(RAIZ, "scripts", "audit", "recortes.json"), "utf8")
  ) as MapaDeRecortes
  const baseline = JSON.parse(
    readFileSync(join(RAIZ, "scripts", "audit", "baseline-escritas-sem-anotacao.json"), "utf8")
  ) as { arquivos: Record<string, EntradaBaseline> }

  const erros: string[] = []
  const dividas: string[] = []

  // PRÉ-VOO, e a ordem importa. Conferir os recortes exige ler as allowlists que
  // eles apontam; mapa inválido tem que reprovar como violação NOMEADA antes
  // disso, senão o primeiro arquivo faltante mata o processo por ENOENT e o
  // relatório inteiro morre junto, sem dizer qual recorte estava errado.
  console.error(`[1/3] mapa: inventário de allowlists e cobertura das janelas`)
  const anotadas = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(MIGRATIONS, f), "utf8").includes("@write"))
    .sort()
  const allowlistsNoDisco = readdirSync(join(RAIZ, "scripts", "audit"))
    .filter((f) => f.startsWith("allowlist-") && f.endsWith(".json"))
    .map((f) => `scripts/audit/${f}`)
    .sort()
  const errosDeMapa = [
    ...violacoesDeInventario(mapa, allowlistsNoDisco),
    ...violacoesDeCobertura(mapa.recortes, anotadas),
  ]
  console.error(
    `      ${mapa.recortes.length} recorte(s), ${anotadas.length} migration(s) anotada(s), ${allowlistsNoDisco.length} allowlist(s) no diretório, ${mapa.allowlists_sem_recorte.length} sem recorte por declaração`
  )
  if (errosDeMapa.length) {
    console.error(`\n${errosDeMapa.length} violação(ões) no mapa, antes de conferir recorte nenhum:`)
    for (const e of errosDeMapa) console.error(`  FAIL ${e}`)
    process.exit(1)
  }

  console.error(`\n[2/3] escritas sem anotação @write, árvore inteira, contra o baseline`)
  const orfas = escritasOrfasDaArvore()
  const errosBaseline = violacoesDeBaseline(orfas, baseline.arquivos)
  erros.push(...errosBaseline)
  console.error(
    `      ${orfas.size} arquivo(s) com escrita sem anotação, ${Object.keys(baseline.arquivos).length} congelado(s) no baseline` +
      `${errosBaseline.length ? `, ${errosBaseline.length} fora do baseline` : ", nenhuma novidade"}`
  )

  console.error(`\n[3/3] ${mapa.recortes.length} recorte(s), cada um na própria janela`)
  for (const r of mapa.recortes) {
    const { erros: errosRecorte, writes, arquivos } = conferirRecorte(
      r.desde,
      r.ate,
      r.allowlist,
      false
    )

    if (r.divida) {
      // Dívida NÃO é dispensa de conferir, é congelamento do que já foi medido.
      // Conjunto de arquivos e impressão digital das violações são conferidos
      // aqui exatamente como o baseline é conferido lá em cima.
      const errosDivida = violacoesDeDivida(r, arquivos, itensDaDivida(errosRecorte, writes))
      erros.push(...errosDivida)

      // O ramo da dívida pula a checagem de "allowlist que não conferiu escrita
      // nenhuma", lá embaixo. Sem dizer isso em voz alta, esses recortes ficavam
      // com a autorização registrada, referenciada no inventário e nunca
      // exercitada: exatamente o defeito que este trabalho fecha para allowlist
      // órfã, sobrevivendo em outra forma. Não vira erro, porque é dívida
      // histórica congelada e erro permanente devolve o gate ao vermelho por
      // construção. Vira rótulo explícito no relatório.
      const naoExercitada = r.allowlist !== null && writes.length === 0
      const rotulo = naoExercitada ? " ALLOWLIST NÃO EXERCITADA" : ""
      dividas.push(
        `${r.nome} (${r.desde}..${r.ate}):${rotulo} ${r.divida.violacoes} linha(s) congelada(s) em ${r.divida.arquivos.length} arquivo(s). ${r.divida.motivo}` +
          (naoExercitada
            ? ` A allowlist ${r.allowlist} está declarada e não confere escrita nenhuma, porque a migration saiu sem anotação @write. Anotá-la fecha esta dívida e passa a exercitar uma autorização que já está aprovada.`
            : "")
      )
      console.error(
        `  ${errosDivida.length ? "FAIL  " : "DIVIDA"} ${r.nome}: ${r.divida.violacoes} linha(s) congelada(s)` +
          `${naoExercitada ? ", ALLOWLIST NÃO EXERCITADA" : ""}` +
          `${errosDivida.length ? `, ${errosDivida.length} desvio(s) do congelamento` : ""}`
      )
      continue
    }

    if (r.allowlist === null) {
      // Barrado antes daqui por violacoesDeCobertura, que exige divida quando
      // não há allowlist. A guarda fica porque a ordem das checagens não pode
      // ser o que impede um recorte sem autorização de passar em silêncio.
      erros.push(`recorte ${r.nome}: allowlist=null sem divida congelada.`)
      continue
    }
    if (writes.length === 0) {
      erros.push(
        `recorte ${r.nome}: a allowlist ${r.allowlist} não conferiu escrita nenhuma. Allowlist que não exercita nada é autorização que ninguém checou.`
      )
    }
    erros.push(...errosRecorte.map((e) => `[${r.nome}] ${e}`))
    console.error(
      `  ${errosRecorte.length ? "FAIL" : "OK  "} ${r.nome}: ${writes.length} write(s) conferido(s) contra ${r.allowlist.replace("scripts/audit/", "")}`
    )
  }

  if (dividas.length) {
    console.error(`\n=== DÍVIDA CONGELADA (${dividas.length}), não derruba o comando ===`)
    for (const d of dividas) console.error(`  DIVIDA ${d}`)
  }

  if (erros.length) {
    console.error(`\n${erros.length} violação(ões):`)
    for (const e of erros) console.error(`  FAIL ${e}`)
    process.exit(1)
  }
  console.error(
    "\nOK: nenhuma escrita nova sem anotação, todo recorte dentro da própria allowlist, todo @write coberto."
  )
}

function main(): void {
  const { valores, erros } = lerArgumentos(process.argv.slice(2))
  if (erros.length) {
    console.error(`${erros.length} erro(s) de invocação:`)
    for (const e of erros) console.error(`  ARG ${e}`)
    console.error(
      "\nFormas aceitas:\n" +
        "  check-migrations-allowlist.ts\n" +
        "  check-migrations-allowlist.ts --allowlist=<arquivo> --desde=<prefixo> --ate=<prefixo>"
    )
    process.exit(2)
  }

  const allowlistPath = valores.get("allowlist")
  const desde = valores.get("desde")
  const ate = valores.get("ate")

  if (allowlistPath) {
    modoRecorte(desde, ate, allowlistPath)
    return
  }
  if (desde || ate) {
    console.error(
      "--desde/--ate sem --allowlist não define recorte nenhum. Rode sem flag para conferir a árvore inteira, ou passe as três."
    )
    process.exit(2)
  }
  modoCompleto()
}

if (import.meta.filename === process.argv[1]) {
  main()
}
