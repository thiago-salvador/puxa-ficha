/**
 * Leitura das migrations ainda **não aplicadas** em produção (2026-08-02).
 *
 * Migrations de dado geradas por este fluxo carregam, antes de cada statement,
 * uma linha de anotação legível por máquina:
 *
 *   -- @write tabela=patrimonio slug=hertz-dias ano=2020 campos=valor_total,bens
 *
 * A anotação existe para dois consumidores:
 *   1. `coverage-report.ts --com-migrations-pendentes`, que sobrepõe o efeito
 *      planejado ao snapshot de produção e mostra como a cobertura fica DEPOIS
 *      da aplicação, sem escrever nada;
 *   2. `check-migrations-allowlist.ts`, que confere statement a statement contra
 *      `allowlist-presidenciaveis.json`.
 *
 * A anotação nunca é acreditada sozinha: o parser exige que o statement logo
 * abaixo mencione a mesma tabela e o mesmo slug. Anotação que não bate com o SQL
 * vira erro, não silêncio.
 *
 * ## Escrita endereçada por chave (`chave=`)
 *
 * Existe uma classe de escrita legítima em que o slug NÃO aparece no SQL: a
 * linha é endereçada pela chave (o UUID da PK, o literal de uma coluna, o
 * literal do predicado de um lote), e o slug do candidato é conhecido só pela
 * curadoria. `DELETE FROM posicoes_declaradas WHERE id = '<uuid>'` é o caso
 * fundador: o statement é preciso, o slug é verdadeiro, e mesmo assim a regra
 * de menção o reprovava. Reprovar para sempre uma anotação correta é o começo
 * de um gate que ninguém lê.
 *
 * A forma nova é `chave=<literal>`, e ela NÃO afrouxa nada:
 *   - o literal declarado tem que aparecer no SQL, dentro de string literal,
 *     exatamente como a regra antiga exige do slug. Anotação continua sem
 *     poder se auto-declarar verdadeira;
 *   - `tabela=` e `slug=`/`ref=` continuam obrigatórios, e a allowlist continua
 *     conferindo os dois. `chave=` acrescenta uma prova, não substitui nenhuma;
 *   - anotação SEM `chave=` cujo slug/ref não aparece literal no statement continua
 *     reprovando, igual a antes.
 *
 * O que `chave=` NÃO garante, e é por isso que essas escritas saem em seção
 * separada de `check-migrations-allowlist.ts`, rotulada como não verificável
 * estaticamente:
 *   - não prova que a linha daquela chave pertence ao slug declarado. Ninguém
 *     resolve `id = 'ecb064e3-…'` para `flavio-bolsonaro` sem consultar o banco,
 *     e este módulo não toca banco;
 *   - não prova cardinalidade. Um literal de predicado (`chave="Candidatura a "`)
 *     endereça um lote de tamanho desconhecido em tempo de leitura;
 *   - não prova que a chave é a ÚNICA condição do `WHERE`.
 * O que ela garante é o mínimo que o gate existe para garantir: a escrita está
 * declarada, o alvo declarado existe no SQL, e o par (tabela, slug/ref, campos)
 * passou pela allowlist. O resto vira revisão humana com nome e endereço, em
 * vez de aceitação silenciosa.
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

export interface PendingWrite {
  arquivo: string
  linha: number
  tabela: string
  /** Vazio quando a escrita é de tabela de referência (ver `ref`). */
  slug: string
  ano?: number
  tema?: string
  proposicao?: string
  /**
   * Escrita em tabela de REFERÊNCIA, que não pertence a um candidato
   * (`votacoes_chave`, por exemplo). Anotada com `ref=<identificador>` em vez de
   * `slug=`, e conferida contra o bloco `referencias` da allowlist. Existe para
   * que correção de dado de referência continue sendo escrita DECLARADA, em vez
   * de escapar do gate por não ter slug para declarar.
   */
  ref?: string
  /**
   * Chave literal declarada com `chave=`: o valor que endereça a escrita no SQL
   * (UUID de PK, literal de coluna, literal de predicado de lote). Quando está
   * presente, `slug`/`ref` são metadado descritivo, NÃO verificado contra o
   * statement, e a escrita sai em seção separada do relatório do gate.
   */
  chave?: string
  campos: string[]
  /** Statement SQL bruto associado à anotação. */
  statement: string
}

const ANOTACAO = /^--\s*@write\s+(.+)$/

/**
 * `chave=valor`, com o valor entre aspas duplas quando contém espaço. As aspas
 * existem para literal de predicado (`chave="Candidatura a "`), que sem elas seria
 * declarado pela metade e viraria uma prova mais fraca do que a disponível.
 */
const ATRIBUTO = /([a-zA-Z_][\w]*)=(?:"([^"]*)"|(\S*))/g

function parseAtributos(texto: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of texto.trim().matchAll(ATRIBUTO)) out[m[1]] = m[2] ?? m[3]
  return out
}

/**
 * Se `pos` abre um corpo dollar-quoted (`$$`, `$tag$`), devolve o corpo (sem os
 * marcadores) e o índice logo após o fechamento; senão, `null`.
 *
 * Sem isso, o scanner fechava o statement no primeiro `;` de dentro de um bloco
 * `DO $$ DECLARE n integer; …`, extraía só o cabeçalho do bloco e depois acusava
 * que o statement não mencionava a tabela anotada. Era diagnóstico errado: o SQL
 * estava certo e o parser é que lia pela metade. Foi o caso de 20260805137000.
 */
function dollarQuote(texto: string, pos: number): { corpo: string; fim: number } | null {
  const abre = /^\$(?:[A-Za-z_]\w*)?\$/.exec(texto.slice(pos))
  if (!abre) return null
  const tag = abre[0]
  const fecha = texto.indexOf(tag, pos + tag.length)
  if (fecha === -1) return { corpo: texto.slice(pos + tag.length), fim: texto.length }
  return { corpo: texto.slice(pos + tag.length, fecha), fim: fecha + tag.length }
}

interface VarreduraSql {
  /** Conteúdo dos string literals de aspas simples, em ordem, fora de comentário. */
  literais: string[]
  /** Índice do primeiro `;` executável, ou -1 se o texto não fecha statement. */
  fimDoStatement: number
}

/**
 * Varredura única do SQL, e a razão de ela ser única é que as duas perguntas do
 * módulo ("quais são os literais?" e "onde termina o statement?") só respondem
 * certo se concordarem sobre o que é código e o que não é.
 *
 * Quatro regiões não são código, e nenhuma delas conta:
 *   - comentário de linha (`-- …`) e de bloco (`/* … *\/`, que o Postgres
 *     aninha). Sem isso, `-- corrige 'renato-gomes'` dava a um UPDATE a prova de
 *     menção que o SQL dele não tinha, e um `;` escrito dentro de um comentário
 *     truncava o statement no meio;
 *   - identificador entre aspas duplas, que não é string literal;
 *   - o corpo dollar-quoted, para efeito de terminador.
 *
 * Para efeito de LITERAL, o corpo dollar-quoted conta e é varrido por recursão:
 * é lá que mora o literal de um `DO $$ … $$`, e ignorá-lo reprovaria anotação
 * correta.
 */
function varrerSql(texto: string): VarreduraSql {
  const literais: string[] = []
  let fimDoStatement = -1
  let k = 0

  while (k < texto.length) {
    const ch = texto[k]

    if (ch === "-" && texto[k + 1] === "-") {
      const quebra = texto.indexOf("\n", k)
      k = quebra === -1 ? texto.length : quebra + 1
      continue
    }

    if (ch === "/" && texto[k + 1] === "*") {
      let profundidade = 1
      k += 2
      while (k < texto.length && profundidade > 0) {
        if (texto[k] === "/" && texto[k + 1] === "*") { profundidade += 1; k += 2; continue }
        if (texto[k] === "*" && texto[k + 1] === "/") { profundidade -= 1; k += 2; continue }
        k += 1
      }
      continue
    }

    if (ch === '"') {
      k += 1
      while (k < texto.length) {
        if (texto[k] === '"') {
          // `""` é aspa escapada dentro do identificador, não fecha.
          if (texto[k + 1] === '"') { k += 2; continue }
          k += 1
          break
        }
        k += 1
      }
      continue
    }

    if (ch === "'") {
      k += 1
      let buffer = ""
      while (k < texto.length) {
        if (texto[k] === "'") {
          // `''` é aspa escapada dentro da string, não fecha.
          if (texto[k + 1] === "'") { buffer += "'"; k += 2; continue }
          k += 1
          break
        }
        buffer += texto[k]
        k += 1
      }
      literais.push(buffer)
      continue
    }

    if (ch === "$") {
      const bloco = dollarQuote(texto, k)
      if (bloco) {
        literais.push(...varrerSql(bloco.corpo).literais)
        k = bloco.fim
        continue
      }
    }

    if (ch === ";" && fimDoStatement === -1) fimDoStatement = k
    k += 1
  }

  return { literais, fimDoStatement }
}

/** String literals do statement, em ordem, ignorando comentário. */
function literaisDe(statement: string): string[] {
  return varrerSql(statement).literais
}

/**
 * A chave declarada aparece ancorada em algum literal do statement?
 *
 * Ancorada quer dizer: o literal É a chave, começa por ela ou termina nela.
 * `'ecb064e3-…'` casa por igualdade; `'Candidatura a %'` casa por prefixo;
 * `'^Candidatura a '` casa por sufixo. Substring solta no meio do literal NÃO
 * conta, para que uma chave curta e genérica não passe a casar com qualquer
 * texto grande que a migration por acaso escreva. Literal escrito dentro de
 * comentário também não conta: prosa não endereça linha.
 *
 * O que continua fora do alcance desta função, de propósito: ela não distingue
 * o literal que está no `WHERE` do que está no `SET`. Distinguir exigiria um
 * parser de SQL de verdade, e a precisão que ele daria seria falsa de qualquer
 * jeito, porque nem o `WHERE` prova que a linha endereçada pertence ao slug
 * declarado. É por isso que a escrita com `chave=` sai em seção separada do
 * relatório, rotulada como não verificável estaticamente, em vez de aceita em
 * silêncio: o destino dela é revisão humana, não um carimbo automático.
 */
function chaveAncorada(statement: string, chave: string): boolean {
  return literaisDe(statement).some(
    (lit) => lit === chave || lit.startsWith(chave) || lit.endsWith(chave)
  )
}

/**
 * Extrai o statement que começa na primeira linha não vazia e não comentada,
 * até o primeiro `;` executável. Ponto e vírgula dentro de aspas simples é
 * conteúdo (aparece em texto de `descricao`, por exemplo), dentro de `DO $$ … $$`
 * é corpo do bloco e dentro de comentário é prosa: nenhum dos três termina o
 * statement.
 */
function statementApos(linhas: string[], inicio: number): string {
  let i = inicio
  while (i < linhas.length && (linhas[i].trim() === "" || linhas[i].trim().startsWith("--"))) i += 1
  if (i >= linhas.length) return ""

  const texto = linhas.slice(i).join("\n")
  const { fimDoStatement } = varrerSql(texto)
  return fimDoStatement === -1 ? texto.trim() : texto.slice(0, fimDoStatement + 1).trim()
}

/**
 * O texto sem as regiões de comentário, para as checagens que perguntam se um
 * identificador NÃO citável (nome de tabela) aparece no statement. `-- mexe em
 * patrimonio` não é mexer em `patrimonio`.
 */
function semComentarios(texto: string): string {
  let out = ""
  let k = 0
  while (k < texto.length) {
    const ch = texto[k]
    if (ch === "-" && texto[k + 1] === "-") {
      const quebra = texto.indexOf("\n", k)
      k = quebra === -1 ? texto.length : quebra
      continue
    }
    if (ch === "/" && texto[k + 1] === "*") {
      let profundidade = 1
      k += 2
      while (k < texto.length && profundidade > 0) {
        if (texto[k] === "/" && texto[k + 1] === "*") { profundidade += 1; k += 2; continue }
        if (texto[k] === "*" && texto[k + 1] === "/") { profundidade -= 1; k += 2; continue }
        k += 1
      }
      out += " "
      continue
    }
    if (ch === "'" || ch === '"') {
      const aspa = ch
      out += ch
      k += 1
      while (k < texto.length) {
        out += texto[k]
        if (texto[k] === aspa) {
          if (texto[k + 1] === aspa) { out += texto[k + 1]; k += 2; continue }
          k += 1
          break
        }
        k += 1
      }
      continue
    }
    out += ch
    k += 1
  }
  return out
}

/**
 * Tabelas temporárias declaradas no próprio arquivo. Duplicado de propósito em
 * `check-migrations-allowlist.ts`: os dois módulos precisam concordar sobre o que
 * é rascunho, e uma dependência cruzada entre eles inverteria a direção do import
 * (o checker é quem consome este arquivo, não o contrário).
 */
function tabelasTemporarias(sql: string): Set<string> {
  const encontradas = new Set<string>()
  const padrao = /\bCREATE\s+(?:GLOBAL\s+|LOCAL\s+)?TEMP(?:ORARY)?\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w$]*)/gi
  for (const m of sql.matchAll(padrao)) encontradas.add(m[1].toLowerCase())
  return encontradas
}

/** A anotação da linha `i` precede um statement que escreve em tabela temporária? */
function attrs_ehTemporaria(linhas: string[], i: number, temporarias: Set<string>): boolean {
  if (temporarias.size === 0) return false
  const statement = statementApos(linhas, i + 1)
  if (!statement) return false
  const alvo =
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?([a-zA-Z_][\w$]*)/i.exec(statement)
  return alvo ? temporarias.has(alvo[1].toLowerCase()) : false
}

export function parsePendingWrites(sql: string, arquivo: string): PendingWrite[] {
  const linhas = sql.split("\n")
  const writes: PendingWrite[] = []
  const temporarias = tabelasTemporarias(sql)

  for (let i = 0; i < linhas.length; i += 1) {
    const m = ANOTACAO.exec(linhas[i].trim())
    if (!m) continue

    // Escrita em tabela temporária declarada neste arquivo não persiste e não
    // entra no gate. A anotação, se existir, é ruído: o `ref` dela nomeia a fila
    // de curadoria, não um literal do SQL, e a checagem de menção abaixo a
    // reprovaria para sempre. Foi esse o caso de 20260805123929, que deixou o
    // comando inteiro vermelho desde 05/08/2026.
    if (attrs_ehTemporaria(linhas, i, temporarias)) continue

    const attrs = parseAtributos(m[1])
    const tabela = attrs.tabela ?? ""
    const slug = attrs.slug ?? ""
    const ref = attrs.ref
    if (slug && ref !== undefined) {
      throw new Error(
        `${arquivo}:${i + 1}: anotação @write tem slug e ref ao mesmo tempo; use um ou outro`
      )
    }
    if (!tabela || (!slug && !ref)) {
      throw new Error(`${arquivo}:${i + 1}: anotação @write sem tabela ou sem slug/ref`)
    }

    const statement = statementApos(linhas, i + 1)
    if (!statement) {
      throw new Error(`${arquivo}:${i + 1}: anotação @write sem statement logo abaixo`)
    }
    if (!semComentarios(statement).includes(tabela)) {
      throw new Error(
        `${arquivo}:${i + 1}: anotação diz tabela=${tabela} mas o statement não menciona essa tabela`
      )
    }
    // Escrita endereçada por chave: a prova de menção é feita contra o literal
    // declarado em `chave=`, e não contra o slug/ref, que aqui é descritivo e não
    // aparece no SQL. A troca é de UMA prova por OUTRA, nunca por nenhuma: sem
    // o literal no statement, reprova igual.
    const chave = attrs.chave
    if (chave !== undefined) {
      if (!chave) {
        throw new Error(`${arquivo}:${i + 1}: anotação @write com chave= vazio`)
      }
      if (!chaveAncorada(statement, chave)) {
        throw new Error(
          `${arquivo}:${i + 1}: anotação diz chave=${chave} mas o statement não menciona essa chave literal`
        )
      }
      writes.push({
        arquivo,
        linha: i + 1,
        tabela,
        slug,
        ano: attrs.ano ? Number(attrs.ano) : undefined,
        tema: attrs.tema,
        proposicao: attrs.proposicao,
        ref,
        chave,
        campos: attrs.campos ? attrs.campos.split(",").filter(Boolean) : [],
        statement,
      })
      continue
    }

    // A anotação nunca é acreditada sozinha: o statement tem que mencionar o
    // mesmo identificador que ela declara, seja slug de candidato ou ref.
    //
    // Duas formas contam como menção, e só elas. O literal exato `'<id>'`, que é
    // o caso de slug de candidato e de ref simples; e `'<id>:`, que é o caso da
    // escrita em lote cujo rótulo abre um literal maior, como o UPDATE que grava
    // `despublicacao_motivo = 'familia-sem-mandato-eletivo: <explicação>'`. Sem a
    // segunda forma, uma escrita em lote perfeitamente declarada é rejeitada e a
    // saída empurra quem lê para afrouxar a anotação, que é o oposto do que este
    // gate existe para fazer. O identificador continua tendo que aparecer literal
    // no SQL: nenhuma das duas formas acredita na anotação sozinha.
    //
    // A conferência é contra a lista de literais, não contra o texto cru, para
    // que `-- corrige 'renato-gomes'` não valha como menção. Comentário é prosa
    // do autor da migration, e prosa não é o SQL que vai rodar.
    const identificador = slug || (ref as string)
    const rotulo = slug ? "slug" : "ref"
    const literais = literaisDe(statement)
    const mencionado = literais.some(
      (lit) => lit === identificador || lit.startsWith(`${identificador}:`)
    )
    if (!mencionado) {
      throw new Error(
        `${arquivo}:${i + 1}: anotação diz ${rotulo}=${identificador} mas o statement não menciona esse ${rotulo}`
      )
    }

    writes.push({
      arquivo,
      linha: i + 1,
      tabela,
      slug,
      ano: attrs.ano ? Number(attrs.ano) : undefined,
      tema: attrs.tema,
      proposicao: attrs.proposicao,
      ref,
      campos: attrs.campos ? attrs.campos.split(",").filter(Boolean) : [],
      statement,
    })
  }

  return writes
}

/**
 * Lê todas as migrations do diretório e devolve as anotadas.
 * `desde` e `ate` filtram por prefixo de timestamp (nome do arquivo), para
 * restringir às migrations de UM recorte.
 *
 * `ate` é inclusivo no prefixo e existe porque `desde` sozinho não tem teto: a
 * migration de qualquer recorte criado DEPOIS entra na janela e é reprovada
 * pela allowlist do recorte anterior, que legitimamente não a conhece. Isso já
 * mordeu quatro vezes entre 2026-08-02 e 2026-08-03, sempre com o mesmo
 * diagnóstico errado de "violação" onde havia só janela aberta demais.
 */
export function lerPendingWrites(dir: string, desde?: string, ate?: string): PendingWrite[] {
  const arquivos = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (desde ? f >= desde : true))
    .filter((f) => (ate ? f <= `${ate}￿` : true))
    .sort()

  const writes: PendingWrite[] = []
  for (const arquivo of arquivos) {
    const sql = readFileSync(join(dir, arquivo), "utf8")
    if (!sql.includes("@write")) continue
    writes.push(...parsePendingWrites(sql, arquivo))
  }
  return writes
}
