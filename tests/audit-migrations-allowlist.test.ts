import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { parsePendingWrites } from "../scripts/audit/lib/pending-writes"
import {
  escritasSemAnotacao,
  naJanela,
  violacoesDeAllowlist,
  violacoesDeBaseline,
  lerArgumentos,
  violacoesDeCobertura,
  violacoesDeInventario,
  type EntradaBaseline,
  type MapaDeRecortes,
  type Recorte,
} from "../scripts/audit/check-migrations-allowlist"

const ALLOW = {
  coorte: ["mailza-assis", "thor-dantas"],
  fora_por_construcao: { slugs: [] as string[] },
  entries: [
    { tabela: "patrimonio", slug: "thor-dantas", ano: 2022, campos: ["bens", "fonte"] },
  ],
  referencias: [{ tabela: "votacoes_chave", ref: "146740", campos: ["proposicao_id"] }],
}

const REF_SQL = `-- @write tabela=votacoes_chave ref=146740 campos=proposicao_id
UPDATE public.votacoes_chave
   SET proposicao_id = '146740'
 WHERE proposicao_id = '150041';
`

test("escrita em tabela de referência é declarada, não invisível para o gate", () => {
  // Sem a anotação, o statement seria escrita órfã: é isso que o gate existe
  // para impedir, e o caminho de referência não pode virar um buraco nele.
  const semAnotacao = REF_SQL.split("\n").slice(1).join("\n")
  assert.equal(escritasSemAnotacao(semAnotacao).length, 1)
  assert.equal(escritasSemAnotacao(REF_SQL).length, 0)
})

test("ref declarada e presente na allowlist passa", () => {
  const writes = parsePendingWrites(REF_SQL, "fix.sql")
  assert.equal(writes.length, 1)
  assert.equal(writes[0].ref, "146740")
  assert.equal(writes[0].slug, "")
  assert.deepEqual(violacoesDeAllowlist(writes, ALLOW), [])
})

test("ref fora da allowlist é violação, e não passa pela porta da coorte", () => {
  const sql = REF_SQL.replace(/146740/g, "999999")
  const writes = parsePendingWrites(sql, "fix.sql")
  const erros = violacoesDeAllowlist(writes, ALLOW)
  assert.equal(erros.length, 1)
  assert.match(erros[0], /não está no bloco referencias/)
})

test("campo fora da allowlist é violação mesmo com a ref permitida", () => {
  const sql = REF_SQL.replace("campos=proposicao_id", "campos=proposicao_id,titulo")
  const erros = violacoesDeAllowlist(parsePendingWrites(sql, "fix.sql"), ALLOW)
  assert.equal(erros.length, 1)
  assert.match(erros[0], /campos fora da allowlist/)
})

test("allowlist sem bloco referencias reprova qualquer ref", () => {
  const semRef = { ...ALLOW, referencias: undefined }
  const erros = violacoesDeAllowlist(parsePendingWrites(REF_SQL, "fix.sql"), semRef)
  assert.equal(erros.length, 1)
})

test("anotação de ref exige que o statement mencione a própria ref", () => {
  // Anotação que não bate com o SQL é erro, não silêncio: mesma garantia que já
  // valia para slug.
  const mentiroso = REF_SQL.replace("SET proposicao_id = '146740'", "SET proposicao_id = '111111'")
  assert.throws(
    () => parsePendingWrites(mentiroso, "fix.sql"),
    /não menciona esse ref/
  )
})

test("slug e ref na mesma anotação é erro", () => {
  const ambos = REF_SQL.replace("ref=146740", "slug=mailza-assis ref=146740")
  assert.throws(() => parsePendingWrites(ambos, "fix.sql"), /slug e ref ao mesmo tempo/)
})

test("anotação sem slug e sem ref continua sendo erro", () => {
  const nenhum = REF_SQL.replace("ref=146740 ", "")
  assert.throws(() => parsePendingWrites(nenhum, "fix.sql"), /sem slug\/ref/)
})

test("escrita de candidato segue conferida contra a coorte", () => {
  const sql = `-- @write tabela=patrimonio slug=fulano-de-tal ano=2022 campos=bens
UPDATE public.patrimonio p SET bens = '[]'::jsonb
FROM public.candidatos c WHERE c.slug = 'fulano-de-tal';
`
  const erros = violacoesDeAllowlist(parsePendingWrites(sql, "x.sql"), ALLOW)
  assert.equal(erros.length, 1)
  assert.match(erros[0], /fora da coorte/)
})

const LOTE_SQL = `-- @write tabela=pontos_atencao ref=familia-sem-mandato-eletivo campos=despublicacao_motivo,despublicado_em
UPDATE public.pontos_atencao
   SET despublicacao_motivo = 'familia-sem-mandato-eletivo: claim que o proprio banco contradiz.',
       despublicado_em = now()
 WHERE id IN ('367f4442-4146-4be0-b20a-30e89bc27337')
   AND visivel = false;
`

test("ref que abre um literal maior conta como mencionada no statement", () => {
  // Escrita em lote rotula a propria linha: o motivo gravado COMECA com a ref e
  // continua com a explicacao, entao o literal exato `'<ref>'` nunca aparece.
  // Antes desta forma, uma escrita corretamente declarada era rejeitada, e a
  // saida do gate empurrava para afrouxar a anotacao.
  const writes = parsePendingWrites(LOTE_SQL, "limpeza.sql")
  assert.equal(writes.length, 1)
  assert.equal(writes[0].ref, "familia-sem-mandato-eletivo")
  assert.deepEqual(writes[0].campos, ["despublicacao_motivo", "despublicado_em"])
})

test("a forma frouxa nao acredita em anotacao que o SQL nao sustenta", () => {
  // O identificador continua tendo que aparecer literal: trocar o rotulo dentro
  // do SQL volta a ser erro, senao o afrouxamento viraria um buraco no gate.
  const mentiroso = LOTE_SQL.replace("'familia-sem-mandato-eletivo:", "'outra-familia:")
  assert.throws(() => parsePendingWrites(mentiroso, "limpeza.sql"), /não menciona esse ref/)
})

test("ref mencionada so em comentario nao conta como statement", () => {
  // Comentario nao e escrita: o gate le o statement, nao a prosa em volta dele.
  const soComentario = `-- @write tabela=pontos_atencao ref=familia-sem-mandato-eletivo campos=despublicacao_motivo
-- contexto: 'familia-sem-mandato-eletivo: explicacao que vive so no comentario'
UPDATE public.pontos_atencao
   SET despublicacao_motivo = 'outra-coisa'
 WHERE visivel = false;
`
  assert.throws(() => parsePendingWrites(soComentario, "limpeza.sql"), /não menciona esse ref/)
})

test("escrita em tabela temporária do próprio arquivo não é escrita de produção", () => {
  // Regressao de 08/08/2026. O checker tratava INSERT em CREATE TEMP TABLE ...
  // ON COMMIT DROP como escrita em producao e exigia entrada de allowlist para um
  // dado que some no commit. Efeito: 20260805123929 reprovava em QUALQUER recorte
  // e o comando ficou vermelho desde 05/08. Gate que falha sempre para de ser lido,
  // e foi o que aconteceu: dois documentos declararam "allowlist OK" enquanto ele
  // nao passava.
  const sql = [
    "CREATE TEMP TABLE rascunho_x (id uuid PRIMARY KEY, decisao text) ON COMMIT DROP;",
    "",
    "INSERT INTO rascunho_x (id, decisao) VALUES ('11111111-1111-1111-1111-111111111111', 'aprovar');",
    "",
    "-- @write tabela=candidatos slug=lula campos=biografia",
    "UPDATE public.candidatos SET biografia = 'x' WHERE slug = 'lula';",
  ].join("\n")

  assert.deepEqual(
    escritasSemAnotacao(sql),
    [],
    "o INSERT na temporaria nao precisa de anotacao; o UPDATE em candidatos tem a dele",
  )

  const writes = parsePendingWrites(sql, "teste.sql")
  assert.equal(writes.length, 1, "so o UPDATE em tabela real entra no gate")
  assert.equal(writes[0].tabela, "candidatos")
})

test("escrita em tabela real continua exigindo anotação", () => {
  const sql = [
    "CREATE TEMP TABLE rascunho_y (id uuid) ON COMMIT DROP;",
    "UPDATE public.candidatos SET biografia = 'x' WHERE slug = 'lula';",
  ].join("\n")

  const orfas = escritasSemAnotacao(sql)
  assert.equal(orfas.length, 1, "a temporaria nao pode servir de disfarce para escrita real")
  assert.match(orfas[0].texto, /candidatos/)
})

// --- baseline por arquivo das escritas anteriores ao gate ------------------

const BASE: Record<string, EntradaBaseline> = {
  "20260101000000_velha.sql": { statements: 3, sha256: "aaa" },
}

test("baseline intacto não acusa nada", () => {
  const atual = new Map([["20260101000000_velha.sql", { statements: 3, sha256: "aaa" }]])
  assert.deepEqual(violacoesDeBaseline(atual, BASE), [])
})

test("arquivo novo com escrita sem anotação reprova, mesmo com o baseline cheio", () => {
  // O ponto do baseline: congelar o passado NÃO pode absolver o futuro.
  const atual = new Map([
    ["20260101000000_velha.sql", { statements: 3, sha256: "aaa" }],
    ["20261231000000_nova.sql", { statements: 1, sha256: "bbb" }],
  ])
  const erros = violacoesDeBaseline(atual, BASE)
  assert.equal(erros.length, 1)
  assert.match(erros[0], /20261231000000_nova\.sql.*não está no baseline/)
})

test("escrita a mais dentro de arquivo já congelado reprova", () => {
  const atual = new Map([["20260101000000_velha.sql", { statements: 4, sha256: "ccc" }]])
  const erros = violacoesDeBaseline(atual, BASE)
  assert.equal(erros.length, 1)
  assert.match(erros[0], /passaram de 3 para 4/)
})

test("migration do baseline editada reprova mesmo mantendo a contagem", () => {
  // Trocar QUAL linha um UPDATE atinge mantém a contagem e muda a produção.
  // Sem o sha256, essa edição seria a única escrita realmente invisível que
  // sobraria depois do congelamento.
  const atual = new Map([["20260101000000_velha.sql", { statements: 3, sha256: "zzz" }]])
  const erros = violacoesDeBaseline(atual, BASE)
  assert.equal(erros.length, 1)
  assert.match(erros[0], /sha256 diferente/)
})

test("entrada obsoleta reprova, para o baseline só encolher", () => {
  const erros = violacoesDeBaseline(new Map(), BASE)
  assert.equal(erros.length, 1)
  assert.match(erros[0], /entrada obsoleta/)
})

test("baseline não guarda total: arquivo novo sem escrita não mexe em nada", () => {
  // A migration que chega por outro PR é o caso que derruba um total congelado.
  // Por arquivo, ela simplesmente não aparece.
  const atual = new Map([["20260101000000_velha.sql", { statements: 3, sha256: "aaa" }]])
  assert.deepEqual(violacoesDeBaseline(atual, BASE), [])
})

// --- mapa de recortes ------------------------------------------------------

const RECORTE = (over: Partial<Recorte>): Recorte => ({
  nome: "r",
  desde: "20260101000000",
  ate: "20260101000000",
  allowlist: "scripts/audit/allowlist-x.json",
  divida: null,
  ...over,
})

test("janela é prefixo e o teto é inclusivo", () => {
  assert.equal(naJanela("20260101000000_x.sql", "20260101000000", "20260101000000"), true)
  assert.equal(naJanela("20260101000001_x.sql", "20260101000000", "20260101000000"), false)
})

test("janelas sobrepostas reprovam", () => {
  // Sobreposição faz a mesma escrita ser conferida contra duas autorizações, e
  // passar se QUALQUER uma aceitar. É afrouxamento silencioso.
  const erros = violacoesDeCobertura(
    [
      RECORTE({ nome: "a", desde: "20260101000000", ate: "20260101020000" }),
      RECORTE({ nome: "b", desde: "20260101010000", ate: "20260101030000" }),
    ],
    []
  )
  assert.equal(erros.length, 1)
  assert.match(erros[0], /janelas sobrepostas/)
})

test("migration anotada fora de todo recorte reprova", () => {
  const erros = violacoesDeCobertura([RECORTE({})], ["20270505000000_solta.sql"])
  assert.equal(erros.length, 1)
  assert.match(erros[0], /não cai em recorte nenhum/)
})

test("recorte sem allowlist só existe como dívida nomeada", () => {
  const erros = violacoesDeCobertura([RECORTE({ allowlist: null, divida: null })], [])
  assert.equal(erros.length, 1)
  assert.match(erros[0], /allowlist=null sem divida/)
})

// --- inventário de allowlists ---------------------------------------------

const MAPA = (over: Partial<MapaDeRecortes>): MapaDeRecortes => ({
  recortes: [RECORTE({})],
  allowlists_sem_recorte: [],
  ...over,
})

test("allowlist sem recorte reprova: autorização registrada que ninguém exercita", () => {
  // Modo de falha real de 09/08/2026: allowlist criada no mesmo commit da
  // migration, migration sem uma anotação sequer, gate nunca rodou nela.
  const erros = violacoesDeInventario(MAPA({}), [
    "scripts/audit/allowlist-x.json",
    "scripts/audit/allowlist-orfa.json",
  ])
  assert.equal(erros.length, 1)
  assert.match(erros[0], /allowlist-orfa\.json não é referenciada/)
})

test("allowlist dispensada por declaração explícita não reprova", () => {
  const mapa = MAPA({
    allowlists_sem_recorte: [{ allowlist: "scripts/audit/allowlist-orfa.json", motivo: "sem recorte aberto" }],
  })
  assert.deepEqual(
    violacoesDeInventario(mapa, ["scripts/audit/allowlist-x.json", "scripts/audit/allowlist-orfa.json"]),
    []
  )
})

test("a mesma allowlist em dois recortes reprova", () => {
  const mapa = MAPA({
    recortes: [
      RECORTE({ nome: "a", desde: "20260101000000", ate: "20260101000000" }),
      RECORTE({ nome: "b", desde: "20260102000000", ate: "20260102000000" }),
    ],
  })
  const erros = violacoesDeInventario(mapa, ["scripts/audit/allowlist-x.json"])
  assert.equal(erros.length, 1)
  assert.match(erros[0], /referenciada por mais de um recorte/)
})

test("dispensa apontando para allowlist inexistente reprova", () => {
  const mapa = MAPA({
    allowlists_sem_recorte: [{ allowlist: "scripts/audit/allowlist-fantasma.json", motivo: "-" }],
  })
  const erros = violacoesDeInventario(mapa, ["scripts/audit/allowlist-x.json"])
  assert.equal(erros.length, 1)
  assert.match(erros[0], /não existe no diretório/)
})

// --- o mapa real contra a árvore real -------------------------------------

test("recortes.json cobre a árvore de migrations de hoje", () => {
  // Roda no `npm test`, que é gate de CI. É aqui que uma migration mergeada de
  // outro PR com `@write` e sem recorte aparece, em vez de virar buraco silencioso.
  const raiz = resolve(import.meta.dirname, "..")
  const dirAudit = join(raiz, "scripts", "audit")
  const dirMigrations = join(raiz, "supabase", "migrations")

  const mapa = JSON.parse(readFileSync(join(dirAudit, "recortes.json"), "utf8")) as MapaDeRecortes
  const anotadas = readdirSync(dirMigrations)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dirMigrations, f), "utf8").includes("@write"))
  const allowlists = readdirSync(dirAudit)
    .filter((f) => f.startsWith("allowlist-") && f.endsWith(".json"))
    .map((f) => `scripts/audit/${f}`)

  assert.deepEqual(violacoesDeCobertura(mapa.recortes, anotadas), [])
  assert.deepEqual(violacoesDeInventario(mapa, allowlists), [])
})

// --- parser estrito de argumentos (revisão do PR #149) --------------------

test("a forma com = é a única aceita", () => {
  const { valores, erros } = lerArgumentos([
    "--allowlist=scripts/audit/allowlist-x.json",
    "--desde=20260101000000",
    "--ate=20260101000000",
  ])
  assert.deepEqual(erros, [])
  assert.equal(valores.get("allowlist"), "scripts/audit/allowlist-x.json")
  assert.equal(valores.get("desde"), "20260101000000")
})

test("forma com espaço vira erro em vez de sumir", () => {
  // Sumir era o fail-open: sem valor, o main caía no modo completo e devolvia
  // OK sobre a árvore inteira enquanto o recorte pedido não era conferido.
  const { valores, erros } = lerArgumentos(["--allowlist", "scripts/audit/allowlist-x.json"])
  assert.equal(valores.size, 0)
  assert.equal(erros.length, 2, "a flag sem = e o valor solto são dois erros distintos")
  assert.match(erros[0], /--allowlist exige a forma --allowlist=valor/)
  assert.match(erros[1], /argumento posicional não reconhecido/)
})

test("flag desconhecida, valor vazio e flag repetida são erro", () => {
  assert.match(lerArgumentos(["--janela=x"]).erros[0], /flag desconhecida: --janela/)
  assert.match(lerArgumentos(["--desde="]).erros[0], /veio sem valor/)
  assert.match(
    lerArgumentos(["--desde=20260101000000", "--desde=20270101000000"]).erros[0],
    /repetida/
  )
})

test("allowlist referenciada por recorte e ausente do disco é violação nomeada", () => {
  // Antes esta faltava e o arquivo ausente só aparecia como ENOENT no
  // readFileSync, matando o relatório sem dizer qual recorte estava errado.
  const erros = violacoesDeInventario(MAPA({}), [])
  assert.equal(erros.length, 1)
  assert.match(erros[0], /allowlist-x\.json, referenciada pelo\(s\) recorte\(s\) r, não existe no diretório/)
})
