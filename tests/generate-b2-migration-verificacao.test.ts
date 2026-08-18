import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  conferirIdentidadeDasLinhas,
  construirLinhasB2,
  type PerfilB2,
} from "../scripts/lib/b2-perfil-builder"
import { carregarIdentidadeEtapa2 } from "../scripts/lib/identidade-etapa2"
import {
  COMPOSICAO_DAS_CHAVES,
  agregarChave,
  derivarResolucoes,
  estadoDoCampo,
} from "../scripts/lib/verificacao-campos-ledger-b2"

/**
 * Contrato de escrita de `verificacao_campos`, julgado sobre o NUCLEO que o
 * executavel usa.
 *
 * O teste NAO roda o CLI sobre uma fixture, e isso e deliberado: o CLI passou a
 * recusar qualquer ledger cujo SHA-256 nao seja o congelado, fail-closed, e um
 * escape para teste no executavel foi exatamente o defeito das duas rodadas
 * anteriores (primeiro por variavel de ambiente, depois por caminho de arquivo).
 * O teste chama `construirLinhasB2`, a mesma funcao que o CLI chama.
 *
 * Duas propriedades do jsonb produzido:
 *
 * - campo verificado (`publicado` ou `vazio_confirmado`) sai COM data;
 * - campo nao verificado sai com a CHAVE AUSENTE, nunca `"chave": null`. O merge
 *   no banco e `COALESCE(verificacao_campos,'{}') || d.verificacao_campos`, e em
 *   jsonb o `||` com null SOBRESCREVE, entao um null apagaria a data boa.
 */

const REPO = join(import.meta.dirname, "..")
const GERADOR = join(REPO, "scripts/generate-b2-current-profile-migration.ts")

function perfis(arquivo: string): PerfilB2[] {
  return readFileSync(join(REPO, "tests/fixtures/verificacao-campos", arquivo), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((linha) => JSON.parse(linha) as PerfilB2)
}

function verificacaoPorSlug(arquivo = "ledger-sintetico.jsonl"): Map<string, Record<string, string>> {
  return new Map(construirLinhasB2(perfis(arquivo)).map((l) => [l.slug, l.verification]))
}

describe("gerador da B2: o jsonb produzido obedece o contrato", () => {
  const porSlug = verificacaoPorSlug()
  const fonteDoGerador = readFileSync(GERADOR, "utf8")

  it("a fixture produziu as 5 linhas, e o laco nao e vazio", () => {
    assert.equal(porSlug.size, 5)
  })

  it("tres frentes resolvidas saem com data nas tres", () => {
    const v = porSlug.get("fx-tres-de-tres")!
    assert.equal(v.candidate_registration, "2026-08-06")
    assert.equal(v.candidate_complement, "2026-08-06")
    assert.equal(v.social_networks, "2026-08-06")
  })

  it("no_row_for_safe_sq vira vazio_confirmado E ganha data", () => {
    // O defeito corrigido: cleber-rabelo e gilberto-vasconcelos saiam com null
    // aqui, apesar de a fonte ter sido consultada com SQ seguro e ter respondido
    // sem registros, que Settings/OBJECTIVE.md define como vazio_confirmado.
    const v = porSlug.get("fx-vazio-confirmado")!
    assert.equal(v.social_networks, "2026-08-06")
  })

  it("no_safe_current_sq produz CHAVE AUSENTE, nunca null", () => {
    const v = porSlug.get("fx-nao-coletado")!
    for (const chave of ["candidate_registration", "candidate_complement", "social_networks"]) {
      assert.equal(Object.hasOwn(v, chave), false, `${chave} deveria estar ausente`)
    }
  })

  it("nenhum jsonb emitido contem null, em nenhuma linha", () => {
    for (const [slug, v] of porSlug) {
      assert.equal(
        JSON.stringify(v).includes("null"),
        false,
        `${slug} emitiu null: ${JSON.stringify(v)}`,
      )
      for (const [chave, valor] of Object.entries(v)) {
        assert.equal(typeof valor, "string", `${slug}.${chave} nao e string`)
      }
    }
  })

  it("o merge com || preserva a data anterior quando a chave esta ausente", () => {
    // Simula a semantica de `COALESCE(atual,'{}') || patch`: em jsonb, chave
    // ausente no lado direito preserva; chave com null sobrescreveria.
    const anterior = { social_networks: "2026-06-01", candidate_registration: "2026-06-01" }
    const patch = porSlug.get("fx-nao-coletado")!
    assert.deepEqual({ ...anterior, ...patch }, {
      social_networks: "2026-06-01",
      candidate_registration: "2026-06-01",
      news_query: "2026-08-07T03:37:55.943Z",
      existing_profile_aggregate: "2026-04-14T00:00:00.000Z",
    })
  })

  it("campaign_proposals e photo nunca saem datados", () => {
    for (const [slug, v] of porSlug) {
      assert.equal(Object.hasOwn(v, "campaign_proposals"), false, slug)
      assert.equal(Object.hasOwn(v, "photo"), false, slug)
    }
  })

  it("existing_profile_aggregate e preservado verbatim", () => {
    assert.equal(
      porSlug.get("fx-tres-de-tres")!.existing_profile_aggregate,
      "2026-06-09T14:31:33.240661+00:00",
    )
  })

  it("o SQL do gerador conserva o merge aditivo e o aviso do contrato", () => {
    // Asserção sobre o texto-fonte do gerador, que é versionado e existe em
    // qualquer checkout. Rodar o CLI aqui exigiria um ledger congelado de 2,98 MB
    // que é gitignorado, ou um escape no executável, e escape foi o defeito.
    assert.match(
      fonteDoGerador,
      /verificacao_campos = COALESCE\(c\.verificacao_campos, '\{\}'::jsonb\) \|\| d\.verificacao_campos/,
    )
    assert.match(fonteDoGerador, /Chave AUSENTE/)
  })

  it("o CLI é fail-closed: ledger fora do congelado não gera nada", () => {
    assert.match(fonteDoGerador, /ledger nao reconhecido/)
    assert.match(fonteDoGerador, /if \(ledgerSha !== LEDGER_B2_SHA256\)/)
    // E não sobrou nenhum escape de teste no CÓDIGO do executável. A checagem
    // ignora comentários de propósito: o arquivo explica por escrito quais
    // bypasses existiram e por que morreram, e essa memória tem de sobreviver.
    const statementsDoCli = fonteDoGerador
      .split("\n")
      .filter((linha) => {
        const t = linha.trimStart()
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
      })
      .join("\n")
    assert.doesNotMatch(statementsDoCli, /PF_B2_SEM_CARDINALIDADE/)
    assert.doesNotMatch(statementsDoCli, /tests[\\/]+fixtures/)
  })

  it("o gerador NÃO emite mais schema: uma regeneração não recria migration mista", () => {
    // Antes de 09/08/2026 este gerador emitia `ALTER TABLE ... ADD COLUMN`,
    // `GRANT SELECT (verificacao_campos)` e um `CREATE OR REPLACE VIEW`
    // completo. Com o schema já morando em 20260809060000, continuar emitindo
    // DDL faria a próxima regeneração produzir migration MISTA, que é
    // exatamente o que a issue #136 proíbe e o que a separação existe para
    // impedir. Era também uma quarta cópia da definição da view.
    const statements = fonteDoGerador
      .split("\n")
      .filter((linha) => !linha.trimStart().startsWith("--"))
      .join("\n")
    assert.doesNotMatch(statements, /ALTER\s+TABLE/i)
    assert.doesNotMatch(statements, /CREATE\s+OR\s+REPLACE\s+VIEW/i)
    assert.doesNotMatch(statements, /GRANT\s+SELECT/i)
    // A tabela temporária continua, porque não é objeto persistente.
    assert.match(statements, /CREATE TEMP TABLE _pf_current_profile/)
    // E o arquivo aponta para onde o schema mora agora.
    assert.match(fonteDoGerador, /20260809060000_verificacao_campos_schema_publico\.sql/)
  })

  it("o SQL gerado não carrega fronteira de transação própria", () => {
    // Mesma regra que a 20260809060000 passou a seguir (Settings/WORKFLOWS.md):
    // quem aplica envolve o arquivo mais a linha do ledger numa transação
    // externa única, e um `COMMIT` no meio a encerraria antes da gravação do
    // ledger. O template do gerador ainda abria com `BEGIN;` e fechava com
    // `COMMIT;`, então a saída futura contradiria a regra escrita no mesmo PR.
    //
    // A transação externa não é opcional: `_pf_current_profile` é
    // `ON COMMIT DROP`. Medido em Postgres 17, sob `--single-transaction` a
    // temp table sobrevive entre statements; em autocommit ela morre no primeiro
    // COMMIT implícito e o INSERT seguinte falha na hora, alto e claro.
    const template = fonteDoGerador.slice(fonteDoGerador.indexOf("const sql = `"))
    assert.doesNotMatch(template, /^BEGIN;$/m)
    assert.doesNotMatch(template, /^COMMIT;$/m)
    assert.match(template, /ON COMMIT DROP/)
    assert.match(fonteDoGerador, /transacao externa/)
  })
})

describe("porta da etapa 2 dentro do escritor real", () => {
  it("registro para slug de identidade NÃO confirmada barra a geração inteira", () => {
    const linhas = construirLinhasB2(perfis("ledger-identidade-bloqueada.jsonl"))
    const seed = JSON.parse(readFileSync(join(REPO, "data/candidatos.json"), "utf8")) as {
      slug: string
      ids?: { tse_sq_candidato?: Record<string, string> | null } | null
    }[]
    assert.throws(
      () => conferirIdentidadeDasLinhas(linhas, seed),
      (erro: Error) =>
        /materializacao barrada pela etapa 2/.test(erro.message) &&
        /witer-naves/.test(erro.message) &&
        /revisao_identidade/.test(erro.message),
    )
  })

  it("registro para slug FORA do seed bloqueia, em vez de ser ignorado", () => {
    // A versao anterior excluia da comparacao o slug ausente do seed, o que
    // permitia materializar sem identidade canonica comparavel.
    const linhas = construirLinhasB2(perfis("ledger-sintetico.jsonl"))
    assert.ok(linhas.some((l) => l.registration), "a fixture precisa ter registro")
    assert.throws(
      () => conferirIdentidadeDasLinhas(linhas, [], carregarIdentidadeEtapa2(REPO)),
      /nao existe em data\/candidatos\.json/,
    )
  })

  it("nenhum slug do seed com SQ 2026 está bloqueado no registro", () => {
    // Esta é a prova VERSIONADA, sobre os 271 slugs de `data/candidatos.json`,
    // e não sobre as 5 fixtures sintéticas. O teste anterior se chamava "a fila
    // real passa pela porta" e rodava sobre a fixture: sobredeclarava.
    //
    // A fila real (`proposals.jsonl`) é gitignorada e não pode ser afirmada em
    // CI. O que é verificável aqui é o invariante equivalente e mais forte:
    // nenhum slug que já carrega `tse_sq_candidato["2026"]` no seed pode estar
    // numa classe bloqueada, porque é isso que a etapa 9 materializaria.
    const seed = JSON.parse(readFileSync(join(REPO, "data/candidatos.json"), "utf8")) as {
      slug: string
      ids?: { tse_sq_candidato?: Record<string, string> | null } | null
    }[]
    const comSq2026 = seed.filter((c) => c.ids?.tse_sq_candidato?.["2026"])
    assert.ok(comSq2026.length > 0, "seed sem nenhum SQ 2026: o laço não provaria nada")

    const indice = carregarIdentidadeEtapa2(REPO)
    const bloqueados = comSq2026.filter((c) => {
      const entrada = indice.entrada(c.slug)
      return entrada != null && entrada.classe !== "match_fresco"
    })
    assert.deepEqual(bloqueados.map((c) => c.slug), [])
  })
})

describe("classificação de rede social por host", () => {
  function redesDe(url: string): Record<string, string> {
    const perfil: PerfilB2 = {
      candidate_slug: "fx-rede",
      proposals: [
        {
          field: "social_networks",
          query_result: "found_for_safe_sq",
          source_date: "2026-08-06",
          proposed_state: "official_self_declared_merge_fill_only",
          proposed_value: [{ url }],
        } as never,
        { field: "current_candidacy_status", query_result: "no_safe_match" },
        { field: "profession", query_result: "no_safe_match" },
        { field: "education", query_result: "no_safe_match" },
        { field: "campaign_proposals", query_result: "dated_news_lead_found" },
        { field: "photo", query_result: "existing_photo" },
        { field: "news", query_result: "found", verified_at: "2026-08-07T00:00:00Z" },
      ],
    }
    return construirLinhasB2([perfil])[0].networks
  }

  it("host que apenas CONTÉM o domínio não vira a rede oficial", () => {
    // CodeQL js/incomplete-url-substring-sanitization, 7 alertas altos no PR
    // #146. `host.includes("instagram.com")` casava com
    // `instagram.com.dominio-de-terceiro.net` e com `naoinstagram.com`, e o
    // valor ia parar na ficha pública como a rede declarada do candidato.
    assert.deepEqual(redesDe("https://instagram.com.dominio-de-terceiro.net/x"), {})
    assert.deepEqual(redesDe("https://naoinstagram.com/x"), {})
    assert.deepEqual(redesDe("https://facebook.com.evil.net/x"), {})
    assert.deepEqual(redesDe("https://tiktok.com.evil.net/x"), {})
    assert.deepEqual(redesDe("https://youtube.com.evil.net/x"), {})
    assert.deepEqual(redesDe("https://linkedin.com.evil.net/x"), {})
    assert.deepEqual(redesDe("https://kwai.com.evil.net/x"), {})
    assert.deepEqual(redesDe("https://telegram.evil.net/x"), {})
  })

  it("domínio exato e subdomínio legítimo continuam classificando", () => {
    assert.deepEqual(redesDe("https://www.instagram.com/x/"), {
      instagram: "https://www.instagram.com/x/",
    })
    assert.deepEqual(redesDe("https://br.linkedin.com/in/x"), {
      linkedin: "https://br.linkedin.com/in/x",
    })
    assert.equal(Object.keys(redesDe("https://x.com/x"))[0], "twitter")
    assert.equal(Object.keys(redesDe("https://twitter.com/x"))[0], "twitter")
    assert.equal(Object.keys(redesDe("https://t.me/x"))[0], "telegram")
    assert.equal(Object.keys(redesDe("https://youtu.be/x"))[0], "youtube")
  })
})

describe("mapeamento (campo, query_result)", () => {
  it("traduz cada par declarado", () => {
    assert.equal(estadoDoCampo("current_candidacy_status", "safe_official_registration_found"), "publicado")
    assert.equal(estadoDoCampo("current_candidacy_status", "no_safe_match"), "nao_coletado")
    assert.equal(estadoDoCampo("social_networks", "no_row_for_safe_sq"), "vazio_confirmado")
    assert.equal(estadoDoCampo("social_networks", "no_safe_current_sq"), "nao_coletado")
  })

  it("par desconhecido lanca, em vez de virar nao_coletado por omissao", () => {
    assert.throws(
      () => estadoDoCampo("profession", "query_result_inventado"),
      /par \(campo, query_result\) desconhecido/,
    )
  })

  it("a data vem da origem declarada por campo, nao de um default", () => {
    // As duas semanticas convivem no ledger. Frente TSE data a FONTE
    // (source_date, o snapshot de 06/08); news_query data a CONSULTA
    // (verified_at, com milissegundo). Um default unico erraria num dos lados,
    // e errou: a primeira versao do porte trocou o carimbo de milissegundo do
    // news_query por uma data seca em todas as 194 linhas.
    const tse = agregarChave("candidate_registration", [
      {
        field: "current_candidacy_status",
        query_result: "safe_official_registration_found",
        source_date: "2026-08-06",
        verified_at: "2026-08-07T03:42:25.708Z",
      },
    ])
    assert.equal(tse.verificadoEm, "2026-08-06")

    const news = agregarChave("news_query", [
      {
        field: "news",
        query_result: "found",
        source_date: "2026-08-07",
        verified_at: "2026-08-07T03:37:56.233Z",
      },
    ])
    assert.equal(news.verificadoEm, "2026-08-07T03:37:56.233Z")
  })

  it("campo que avança SEM data utilizável LANÇA, não vira skip silencioso", () => {
    // Rebaixar para `nao_coletado` transformava o caso em `preservada`, e o
    // escritor só lança em `rejeitadas`: uma fonte que disse `publicado` com
    // `source_date` ausente ou corrompido produzia zero erro e zero log. É o
    // oposto da regra do resto do módulo, onde par desconhecido derruba a rodada.
    assert.throws(
      () =>
        agregarChave("candidate_registration", [
          { field: "current_candidacy_status", query_result: "safe_official_registration_found" },
        ]),
      /estado que avanca frescor[\s\S]*data inutilizavel/,
    )
  })

  it("data impossível ou fora do formato também lança", () => {
    for (const ruim of ["2026-02-30", "2026-13-45", "Aug 6 2026", "2026", "", "2026-08-06T23:30:00"]) {
      assert.throws(
        () =>
          agregarChave("candidate_registration", [
            {
              field: "current_candidacy_status",
              query_result: "safe_official_registration_found",
              source_date: ruim,
            },
          ]),
        /data inutilizavel/,
        `"${ruim}" foi aceita como data`,
      )
    }
  })

  it("estado que NÃO avança sem data continua sendo ausência, não erro", () => {
    // O contraste importa: `no_safe_match` sem data é ausência de busca, e isso
    // é informação legítima, não defeito de dado.
    const r = agregarChave("candidate_registration", [
      { field: "current_candidacy_status", query_result: "no_safe_match" },
    ])
    assert.equal(r.estado, "nao_coletado")
    assert.equal(r.verificadoEm, null)
  })

  it("candidate_complement exige data válida em CADA constituinte", () => {
    // O buraco anterior: bastava UM dos dois ter data para a chave inteira ser
    // carimbada, e a data de `profession` passava a afirmar cobertura de
    // `education` também.
    assert.throws(
      () =>
        agregarChave("candidate_complement", [
          { field: "profession", query_result: "found_in_safe_current_registration", source_date: "2026-08-06" },
          { field: "education", query_result: "found_in_safe_current_registration" },
        ]),
      /data inutilizavel/,
    )
    assert.throws(
      () =>
        agregarChave("candidate_complement", [
          { field: "profession", query_result: "found_in_safe_current_registration", source_date: "2026-08-06" },
          { field: "education", query_result: "found_in_safe_current_registration", source_date: "2026-02-30" },
        ]),
      /data inutilizavel/,
    )
    // Mas os dois NÃO resolvidos seguem sendo ausência, não erro.
    const nenhum = agregarChave("candidate_complement", [
      { field: "profession", query_result: "no_safe_match" },
      { field: "education", query_result: "no_safe_match" },
    ])
    assert.equal(nenhum.estado, "nao_coletado")
  })

  it("a mais antiga é por INSTANTE, com ordem lexical DIVERGENTE da cronológica", () => {
    // O par foi escolhido para que as duas ordens discordem, senão o teste
    // passaria também com `.sort()` de strings e não provaria nada:
    //
    //   "2026-08-06T23:00:00Z"      -> 2026-08-06T23:00Z
    //   "2026-08-07T00:30:00+03:00" -> 2026-08-06T21:30Z  (MAIS ANTIGO)
    //
    // Lexicalmente o primeiro vem antes; cronologicamente o segundo. A resposta
    // certa é o segundo.
    const antigoNoRelogio = "2026-08-07T00:30:00+03:00"
    const antigoNoAlfabeto = "2026-08-06T23:00:00Z"
    assert.ok(antigoNoAlfabeto < antigoNoRelogio, "as strings não divergem: o caso perdeu a graça")
    assert.ok(
      new Date(antigoNoRelogio).getTime() < new Date(antigoNoAlfabeto).getTime(),
      "os instantes não divergem: o caso perdeu a graça",
    )

    const r = agregarChave("candidate_complement", [
      { field: "profession", query_result: "found_in_safe_current_registration", source_date: antigoNoAlfabeto },
      { field: "education", query_result: "found_in_safe_current_registration", source_date: antigoNoRelogio },
    ])
    assert.equal(r.verificadoEm, antigoNoRelogio)
  })

  it("chave sem composição declarada lança", () => {
    assert.throws(() => agregarChave("chave_inventada", []), /sem composicao declarada/)
  })

  it("a chave e composta: query_result valido em OUTRO campo nao traduz", () => {
    // `no_safe_match` existe em profession, education e current_candidacy_status,
    // mas tambem em `biography`, que NAO sustenta chave nenhuma. Um mapa so por
    // query_result traduziria os dois igual.
    assert.equal(estadoDoCampo("profession", "no_safe_match"), "nao_coletado")
    assert.throws(() => estadoDoCampo("biography", "no_safe_match"), /desconhecido/)
    // `found` e valido em news, e nao em social_networks.
    assert.equal(estadoDoCampo("news", "found"), "publicado")
    assert.throws(() => estadoDoCampo("social_networks", "found"), /desconhecido/)
  })
})

describe("agregação explícita de candidate_complement", () => {
  it("a composição declarada é profession + education", () => {
    assert.deepEqual([...COMPOSICAO_DAS_CHAVES.candidate_complement], ["profession", "education"])
    assert.deepEqual([...COMPOSICAO_DAS_CHAVES.candidate_registration], ["current_candidacy_status"])
  })

  it("ambos resolvidos: a chave avança", () => {
    const r = agregarChave("candidate_complement", [
      { field: "profession", query_result: "found_in_safe_current_registration", source_date: "2026-08-06" },
      { field: "education", query_result: "found_in_safe_current_registration", source_date: "2026-08-06" },
    ])
    assert.equal(r.estado, "publicado")
    assert.equal(r.verificadoEm, "2026-08-06")
  })

  it("ambos resolvidos com datas distintas: vence a MAIS ANTIGA", () => {
    const r = agregarChave("candidate_complement", [
      { field: "profession", query_result: "found_in_safe_current_registration", source_date: "2026-07-02" },
      { field: "education", query_result: "found_in_safe_current_registration", source_date: "2026-08-06" },
    ])
    assert.equal(r.verificadoEm, "2026-07-02")
  })

  it("MISTO: um resolvido e outro não, a chave NÃO avança", () => {
    // Caso inexistente no dado real (45/45 e 149/149 alinham), e por isso mesmo
    // so exercitavel aqui. Uma data so pode cobrir os dois campos se os dois
    // foram verificados.
    const r = agregarChave("candidate_complement", [
      { field: "profession", query_result: "found_in_safe_current_registration", source_date: "2026-08-06" },
      { field: "education", query_result: "no_safe_match", source_date: "2026-08-06" },
    ])
    assert.equal(r.estado, "nao_coletado")
    assert.equal(r.verificadoEm, null)
  })

  it("o misto chega até o SQL como chave ausente", () => {
    const v = verificacaoPorSlug().get("fx-complemento-misto")!
    assert.equal(Object.hasOwn(v, "candidate_complement"), false)
    assert.equal(v.candidate_registration, "2026-08-06")
    assert.equal(v.social_networks, "2026-08-06")
  })

  it("datas distintas chegam ao SQL pela mais antiga", () => {
    const v = verificacaoPorSlug().get("fx-complemento-datas-distintas")!
    assert.equal(v.candidate_complement, "2026-07-02")
  })

  it("campo com MAIS DE UMA proposta não usa desempate silencioso", () => {
    // Medido: `campaign_proposals` aparece duas vezes em 59 dos 194 perfis reais.
    // Pegar a primeira seria um desempate não declarado; todas entram, e o
    // estado que não avança domina.
    const bloqueada = agregarChave("campaign_proposals", [
      { field: "campaign_proposals", query_result: "dated_news_lead_found", source_date: "2026-08-06" },
      {
        field: "campaign_proposals",
        query_result: "official_resource_absent_and_no_scoped_lead",
        source_date: "2026-08-06",
      },
    ])
    assert.equal(bloqueada.estado, "nao_coletado")
    assert.equal(bloqueada.verificadoEm, null)

    // E o mesmo vale quando uma avança e a outra não: a que não avança vence.
    const mista = agregarChave("social_networks", [
      { field: "social_networks", query_result: "found_for_safe_sq", source_date: "2026-08-06" },
      { field: "social_networks", query_result: "no_safe_current_sq", source_date: "2026-08-06" },
    ])
    assert.equal(mista.estado, "nao_coletado")
    assert.equal(mista.verificadoEm, null)
  })

  it("campo constituinte ausente do ledger não vira confirmação", () => {
    const r = agregarChave("candidate_complement", [
      { field: "profession", query_result: "found_in_safe_current_registration", source_date: "2026-08-06" },
    ])
    assert.equal(r.estado, "nao_coletado")
    assert.equal(r.verificadoEm, null)
  })

  it("derivarResolucoes cobre as 7 chaves", () => {
    const r = derivarResolucoes(
      [
        { field: "current_candidacy_status", query_result: "no_safe_match" },
        { field: "profession", query_result: "no_safe_match" },
        { field: "education", query_result: "no_safe_match" },
        { field: "social_networks", query_result: "no_safe_current_sq" },
        { field: "campaign_proposals", query_result: "dated_news_lead_found" },
        { field: "photo", query_result: "existing_photo" },
        { field: "news", query_result: "found", verified_at: "2026-08-07T00:00:00Z" },
      ],
      "2026-04-14T00:00:00.000Z",
    )
    assert.deepEqual(
      r.map((x) => x.chave).sort(),
      [
        "campaign_proposals",
        "candidate_complement",
        "candidate_registration",
        "existing_profile_aggregate",
        "news_query",
        "photo",
        "social_networks",
      ],
    )
  })
})
