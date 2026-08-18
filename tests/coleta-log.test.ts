import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  FONTES,
  entradaDeResultado,
  escopoDaFonte,
  montarLinhas,
  normalizarEntrada,
} from "../scripts/lib/coleta-log"
import type { IngestResult } from "../scripts/lib/types"

const root = process.cwd()
const libDir = join(root, "scripts/lib")

function resultado(over: Partial<IngestResult> = {}): IngestResult {
  return {
    source: "camara",
    candidato: "lula",
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 10,
    ...over,
  }
}

/**
 * A regra que este arquivo protege e uma so: o log de coleta nunca pode inventar
 * um veredito. Cada teste abaixo e um caminho pelo qual a inferencia poderia
 * transformar "nao sei" em "e zero", que e exatamente o defeito que a tabela
 * `coleta_log` foi criada para corrigir.
 */
describe("entradaDeResultado nao inventa veredito", () => {
  it("zero linhas sem erro vira indeterminado, nunca vazio_confirmado", () => {
    const entrada = entradaDeResultado(resultado())
    assert.ok(entrada)
    assert.equal(
      entrada.resultado,
      "indeterminado",
      "varios ingests engolem falha de rede num catch que devolve lista vazia; " +
        "chamar isso de zero e a mentira que o coleta_log existe para impedir",
    )
  })

  it("vazio_confirmado so sai quando o ingest declara", () => {
    const entrada = entradaDeResultado(
      resultado({ coleta_resultado: "vazio_confirmado", coleta_detalhe: "4 cadastros vazios" }),
    )
    assert.ok(entrada)
    assert.equal(entrada.resultado, "vazio_confirmado")
    assert.equal(entrada.volume, 0)
    assert.equal(entrada.detalhe, "4 cadastros vazios")
  })

  it("skipped SEM desfecho declarado nao vira linha nenhuma", () => {
    // O skipped da Camara em modo incremental significa "o dado ja estava
    // coberto". Gravar isso sobrescreveria, em coleta_log_ultima, a ultima
    // tentativa real, trocando um encontrado por um vazio que nunca aconteceu.
    assert.equal(
      entradaDeResultado(resultado({ skipped: true, skip_reason: "ja coberto" })),
      null,
    )
  })

  it("skipped COM desfecho declarado vira linha, e o desfecho manda", () => {
    // As duas puladas nao sao a mesma coisa. A de sancoes por CPF ausente sabe
    // dizer POR QUE pulou, e essa e a informacao mais cara que o log tem: sao
    // 96 dos 194 publicaveis que nunca poderao ser consultados no Portal
    // enquanto nao tiverem CPF. Sem a linha, eles ficam indistinguiveis de quem
    // so esta na fila para ser coletado.
    const entrada = entradaDeResultado(
      resultado({
        skipped: true,
        skip_reason: "sem CPF",
        coleta_resultado: "erro",
        coleta_detalhe: "sem CPF: nenhum cadastro foi consultado",
      }),
    )
    assert.ok(entrada, "pulada com desfecho declarado precisa deixar rastro")
    assert.equal(entrada.resultado, "erro")
    assert.equal(entrada.volume, 0)
    assert.equal(entrada.detalhe, "sem CPF: nenhum cadastro foi consultado")
  })

  it("erro continua erro mesmo com escrita parcial", () => {
    const entrada = entradaDeResultado(
      resultado({ rows_upserted: 3, errors: ["HTTP 500 na quarta pagina"] }),
    )
    assert.ok(entrada)
    assert.equal(entrada.resultado, "erro")
    assert.equal(entrada.volume, 3, "o volume parcial e informacao verdadeira e vai junto")
  })

  it("escrita sem erro vira encontrado com o volume", () => {
    const entrada = entradaDeResultado(
      resultado({ rows_upserted: 12, tables_updated: ["votos_candidato"] }),
    )
    assert.ok(entrada)
    assert.equal(entrada.resultado, "encontrado")
    assert.equal(entrada.volume, 12)
  })

  it("desfecho declarado ganha da inferencia", () => {
    const entrada = entradaDeResultado(
      resultado({ rows_upserted: 5, coleta_resultado: "nao_aplicavel" }),
    )
    assert.ok(entrada)
    assert.equal(entrada.resultado, "nao_aplicavel")
    assert.equal(entrada.volume, 0)
  })

  it("volume confirmado na fonte independe de linhas novas no banco", () => {
    const entrada = entradaDeResultado(
      resultado({
        rows_upserted: 0,
        coleta_resultado: "encontrado",
        coleta_volume: 7,
      }),
    )
    assert.ok(entrada)
    assert.equal(entrada.resultado, "encontrado")
    assert.equal(entrada.volume, 7)
  })

  it("erro declarado preserva volume parcial e nunca vira vazio_confirmado", () => {
    const entrada = entradaDeResultado(
      resultado({
        rows_upserted: 2,
        coleta_resultado: "erro",
        coleta_detalhe: "HTTP 500 depois de duas linhas",
      }),
    )
    assert.ok(entrada)
    assert.equal(entrada.resultado, "erro")
    assert.equal(entrada.volume, 2)
    assert.equal(entrada.detalhe, "HTTP 500 depois de duas linhas")
  })
})

describe("normalizarEntrada respeita a constraint coleta_log_volume_coerente", () => {
  it("encontrado com volume zero vira vazio_confirmado", () => {
    const n = normalizarEntrada({ fonte: "camara", alvo: "lula", resultado: "encontrado" })
    assert.equal(n.resultado, "vazio_confirmado")
    assert.equal(n.volume, 0)
  })

  it("vazio_confirmado, nao_aplicavel e indeterminado zeram o volume", () => {
    for (const r of ["vazio_confirmado", "nao_aplicavel", "indeterminado"] as const) {
      const n = normalizarEntrada({ fonte: "camara", alvo: "lula", resultado: r, volume: 7 })
      assert.equal(n.volume, 0, `${r} nao pode carregar volume`)
    }
  })

  it("curadoria sem achado no escopo sempre zera o volume", () => {
    const n = normalizarEntrada({
      fonte: "contradicoes-curadoria",
      alvo: "fulano",
      resultado: "sem_achado_no_escopo",
      volume: 9,
    })
    assert.deepEqual(n, { resultado: "sem_achado_no_escopo", volume: 0 })
  })

  it("volume negativo ou fracionario nao chega ao banco", () => {
    assert.equal(
      normalizarEntrada({ fonte: "camara", alvo: "lula", resultado: "erro", volume: -3 }).volume,
      0,
    )
    assert.equal(
      normalizarEntrada({ fonte: "camara", alvo: "lula", resultado: "encontrado", volume: 2.9 })
        .volume,
      2,
    )
  })
})

/**
 * As linhas montadas aqui foram inseridas na tabela real de producao em
 * 2026-08-04 e aceitas pelas duas constraints (coleta_log_volume_coerente e
 * coleta_log_candidato_id_so_em_escopo_candidato), depois apagadas. Este teste
 * congela aquele formato: se o montarLinhas mudar de forma, o insert de verdade
 * quebraria em runtime, longe de qualquer gate.
 */
describe("montarLinhas produz o payload que a tabela aceita", () => {
  const ids = new Map([["lula", "00000000-0000-0000-0000-000000000001"]])

  it("resolve candidato_id por slug em escopo candidato", () => {
    const [linha] = montarLinhas(
      [{ fonte: "camara", alvo: "lula", resultado: "encontrado", volume: 12 }],
      ids,
    )
    assert.equal(linha.candidato_id, "00000000-0000-0000-0000-000000000001")
    assert.equal(linha.escopo, "candidato")
  })

  it("deixa candidato_id nulo em fonte territorial, como a constraint exige", () => {
    const [linha] = montarLinhas([{ fonte: "siconfi", alvo: "SP", resultado: "erro" }], ids)
    assert.equal(linha.escopo, "territorio")
    assert.equal(linha.candidato_id, null)
  })

  it("slug fora do banco nao impede a linha: alvo continua respondendo a consulta", () => {
    const [linha] = montarLinhas(
      [{ fonte: "camara", alvo: "candidato-novo", resultado: "erro", detalhe: "sem CPF" }],
      ids,
    )
    assert.equal(linha.candidato_id, null)
    assert.equal(linha.alvo, "candidato-novo")
  })

  it("campos ausentes viram null explicito, nunca undefined", () => {
    const [linha] = montarLinhas([{ fonte: "camara", alvo: "lula", resultado: "erro" }], ids)
    assert.equal(linha.detalhe, null)
    assert.equal(linha.url, null)
    assert.equal(linha.duracao_ms, null)
    assert.ok(linha.execucao.length > 0, "execucao identifica a rodada e nunca e vazia")
  })
})

/**
 * Fonte nova que nao entrasse no mapa cairia no default `candidato` em silencio,
 * e uma fonte territorial classificada como de candidato faz o relatorio acusar
 * 194 lacunas que nao existem. O teste le os `source:` reais dos ingests em vez
 * de confiar numa lista escrita a mao.
 */
describe("FONTES cobre todo source declarado pelos ingests", () => {
  const arquivos = readdirSync(libDir).filter(
    (f) => (f.startsWith("ingest-") || f.startsWith("enrich-")) && f.endsWith(".ts"),
  )

  const declarados = new Set<string>()
  for (const arquivo of arquivos) {
    const src = readFileSync(join(libDir, arquivo), "utf8")
    // Casa `source: "x"` apenas dentro de literal de IngestResult, que e sempre
    // seguido de `candidato:` na linha de baixo nos 20 ingests atuais.
    for (const m of src.matchAll(/source:\s*"([^"]+)",\s*\n\s*candidato:/g)) {
      declarados.add(m[1])
    }
  }

  it("encontrou os sources no codigo (guarda contra regex que parou de casar)", () => {
    assert.ok(
      declarados.size >= 20,
      `esperava 20+ sources, achei ${declarados.size}: ${[...declarados].join(", ")}`,
    )
  })

  it("nenhum source ficou fora de FONTES", () => {
    const faltando = [...declarados].filter((s) => !(s in FONTES))
    assert.deepEqual(
      faltando,
      [],
      `adicione em scripts/lib/coleta-log.ts, com o escopo certo: ${faltando.join(", ")}`,
    )
  })

  it("nenhuma entrada de FONTES virou orfa", () => {
    // `tse-cpf` e o backfill dedicado de CPF (scripts/backfill-cpf-tse.ts),
    // Fontes chamadas fora de scripts/lib ou por fluxos editoriais dedicados.
    // Essas sao as excecoes legitimas; qualquer outra e fonte esquecida.
    const excecoes = new Set([
      "wiki-historico",
      "tse-cpf",
      "processos-curadoria",
      "contradicoes-curadoria",
      // Auditorias editoriais materializadas por migration. Não são ingests
      // externos e só afirmam o recorte publicável da aba Destaques.
      "destaques-trajetoria",
      "destaques-patrimonio",
      "destaques-votacoes",
      // `camara-proposicoes` sai de scripts/lib/ingest-camara.ts, mas nao como
      // `source:` de IngestResult: e uma linha companheira que grava so a
      // cardinalidade declarada do acervo autoral, para a regua de cobertura
      // saber o denominador (issue #138). O regex acima procura literal de
      // IngestResult, entao ela nao aparece em `declarados` por construcao.
      "camara-proposicoes",
    ])
    const orfas = Object.keys(FONTES).filter(
      (f) => !declarados.has(f) && !excecoes.has(f),
    )
    assert.deepEqual(orfas, [], `fonte no mapa sem ingest correspondente: ${orfas.join(", ")}`)
  })

  it("wiki-historico usa o titulo do roster atual e devolve IngestResult", () => {
    const src = readFileSync(join(libDir, "enrich-wiki-historico.ts"), "utf8")
    assert.match(src, /cand\.wikipedia_title/)
    assert.doesNotMatch(src, /WIKI_TITLES/)
    assert.match(src, /source:\s*"wiki-historico",\s*\n\s*candidato:/)
    assert.match(src, /Promise<IngestResult\[\]>/)
    assert.match(src, /arg\.startsWith\("--slug="\)/)
    assert.match(src, /res\.headers\.get\("retry-after"\)/)
  })

  it("tse-historico registra vazio e trata linha legada sem cargo_canonico", () => {
    const src = readFileSync(join(libDir, "ingest-tse-historico.ts"), "utf8")
    assert.match(src, /coleta_resultado:\s*anosComFalha\.length === 0 \? "vazio_confirmado" : "indeterminado"/)
    assert.match(src, /\.eq\("cargo", record\.cargo\)/)
    assert.match(src, /historico legado/)
    assert.match(src, /result\.coleta_resultado = "nao_aplicavel"/)
    assert.match(src, /arg\.startsWith\("--slug="\)/)
  })

  it("filiacao usa o recurso oficial atual e falha de tarefa gera exit nao-zero", () => {
    const filiacao = readFileSync(join(libDir, "ingest-filiacao.ts"), "utf8")
    const pipeline = readFileSync(join(root, "scripts/ingest-all.ts"), "utf8")
    assert.match(filiacao, /odsele\/filiacao_partidaria\/perfil_filiacao_partidaria\.zip/)
    assert.match(filiacao, /throw new Error\(`Falha ao baixar/)
    assert.match(filiacao, /COLUNAS_FILIACAO_INDIVIDUAL/)
    assert.match(filiacao, /Arquivo oficial nao contem filiacao individual/)
    assert.match(pipeline, /let taskFailures = 0/)
    assert.match(pipeline, /totalErrors > 0 \|\| taskFailures > 0/)
    assert.match(
      pipeline,
      /try \{\s*task\.before\?\.\(\)\s*const results = await task\.run\(\)/,
      "falha no before precisa entrar no mesmo caminho de erro global da tarefa",
    )
  })

  it("wikidata-politico distingue candidato sem QID de resposta vazia", () => {
    const src = readFileSync(join(libDir, "ingest-wikidata-politico.ts"), "utf8")
    assert.match(src, /finalizarColeta\(result, \{\s*aplicavel: false/)
    assert.match(src, /sem wikidata_id: nenhuma consulta remota foi executada/)
    assert.match(src, /const sourceRows = partySource\.sourceRows \+ officeSource\.sourceRows/)
    assert.match(src, /volumeFonte: sourceRows/)
    assert.match(src, /arg\.startsWith\("--slug="\)/)
  })

  it("as fontes territoriais estao marcadas como territorio", () => {
    for (const fonte of ["siconfi", "capag", "atlas_violencia", "ibge_sidra", "inep_ideb", "ipeadata"]) {
      assert.equal(
        escopoDaFonte(fonte),
        "territorio",
        `${fonte} tem UF/agregado como alvo, nao candidato`,
      )
    }
  })
})
