import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  prepararPacoteProcessos,
  type LinhaProcesso,
  tipoProcessual,
  urlComunicaPjePorCnj,
} from "../scripts/gerar-migration-processos-curadoria"
import { parsePendingWrites } from "../scripts/audit/lib/pending-writes"

const item = (overrides: Record<string, unknown> = {}) => ({
  slug: "candidata",
  numero_cnj: "7000047-10.2021.8.22.0007",
  decisao: "publicar",
  identidade_confirmada: true,
  motivo: "Texto factual equilibrado.",
  estado_oficial: "Em andamento, sem decisão de mérito.",
  fontes_oficiais: [
    {
      url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007",
      titulo: "Comunica PJe",
      consultado_em: "2026-08-05T00:00:00Z",
    },
  ],
  ...overrides,
})

const processo = (overrides: Record<string, unknown> = {}) => ({
  numero_cnj: "7000047-10.2021.8.22.0007",
  tribunal: "TJXX",
  classe: "PROCEDIMENTO COMUM CÍVEL",
  url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007&itensPorPagina=25",
  ...overrides,
})

describe("gerar migration de processos da curadoria", () => {
  it("amarra e canonicaliza a URL individual do Comunica PJe ao proprio CNJ", () => {
    assert.equal(
      urlComunicaPjePorCnj(
        "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007&itensPorPagina=25",
        "7000047-10.2021.8.22.0007",
      ),
      "https://comunica.pje.jus.br/consulta?numeroProcesso=70000471020218220007",
    )
  })

  it("mapeia tipos apenas quando a classe ou familia sustentam a categoria", () => {
    assert.equal(tipoProcessual("AÇÃO PENAL - PROCEDIMENTO ORDINÁRIO", "outro"), "criminal")
    assert.equal(tipoProcessual("AÇÃO CIVIL DE IMPROBIDADE ADMINISTRATIVA", "outro"), "improbidade")
    assert.equal(tipoProcessual("CUMPRIMENTO DE SENTENÇA", "propaganda eleitoral irregular"), "eleitoral")
    assert.equal(tipoProcessual("AÇÃO POPULAR", "ato de gestão"), "civil")
  })

  it("gera migration e rollback pareados com preflight, dedupe e contagem exata", () => {
    const pacote = prepararPacoteProcessos({
      itensRevisao: [item()],
      processosCuradoria: [processo()],
      esperadoProcessos: 1,
      esperadoFichas: 1,
      timestamp: "20260810122000",
      aprovadoEditorialmente: true,
    })

    assert.equal(pacote.linhas.length, 1)
    assert.doesNotMatch(pacote.migration, /\b(?:BEGIN|COMMIT);/)
    assert.match(pacote.migration, /@write tabela=processos slug=candidata/)
    assert.equal(parsePendingWrites(pacote.migration, "proposta.sql").length, 1)
    assert.match(pacote.migration, /regexp_replace\(p\.numero_processo/)
    assert.match(pacote.migration, /esperados 1 CNJs/)
    assert.match(pacote.migration, /gravidade, fonte, url_fonte/)
    assert.match(pacote.migration, /'curadoria-djen-20260805: Comunica PJe'/)
    assert.match(pacote.migration, /URLs nao provam o proprio CNJ/)
    assert.match(pacote.rollback, /ROLLBACK CIRURGICO/)
    assert.match(pacote.rollback, /DELETE FROM public\.processos/)
    assert.match(pacote.rollback, /preservar curadoria posterior/)
    assert.match(pacote.rollback, /DELETE FROM supabase_migrations\.schema_migrations/)
    assert.match(pacote.rollback, /encontrados % registros do lote/)
    assert.match(pacote.readback, /READBACK SOMENTE LEITURA/)
    assert.match(pacote.readback, /missing_expected/)
    assert.match(pacote.readback, /unexpected_marker/)
    assert.match(pacote.readback, /payload_mismatch/)
    assert.match(pacote.readback, /inferred_fields/)
    assert.match(pacote.readback, /\^https:\/\//)
    assert.match(pacote.readback, /source_cnj_mismatch/)
    assert.match(pacote.readback, /identity_mismatch/)
    assert.match(pacote.readback, /20260811102100/)
    assert.match(pacote.readback, /a\.candidato_id = e\.candidato_id/)
    assert.equal(JSON.parse(pacote.manifesto).estado, "aprovado_editorialmente_nao_aplicado")
    assert.match(pacote.allowlist._comentario, /APROVADO EDITORIALMENTE/)
    assert.equal(pacote.allowlist.entries.length, 1)
    assert.deepEqual(pacote.allowlist.entries[0], {
      tabela: "processos",
      slug: "candidata",
      campos: [
        "candidato_id",
        "tipo",
        "tribunal",
        "numero_processo",
        "descricao",
        "status",
        "data_inicio",
        "data_decisao",
        "gravidade",
        "fonte",
        "url_fonte",
      ],
      max_registros: 1,
    })
  })

  it("ancora os dois CNJs de Orleans no governador histórico após o split", () => {
    const cnjs = ["0864077-55.2025.8.10.0001", "0865198-21.2025.8.10.0001"]
    const pacote = prepararPacoteProcessos({
      itensRevisao: cnjs.map((numero_cnj) => item({
        slug: "orleans-brandao",
        numero_cnj,
        fontes_oficiais: [{
          url: `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${numero_cnj.replace(/\D/g, "")}`,
          titulo: "Comunica PJe",
        }],
      })),
      processosCuradoria: cnjs.map((numero_cnj) => processo({
        numero_cnj,
        url: `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${numero_cnj.replace(/\D/g, "")}`,
      })),
      esperadoProcessos: 2,
      esperadoFichas: 1,
      timestamp: "20260810122000",
    })

    assert.match(pacote.readback, /47a1de10-1cf7-47f8-837b-dbbf94480421/)
    assert.match(pacote.readback, /Carlos Orleans Brandão Junior/)
    assert.match(pacote.readback, /carlos-brandao-ma-historico/)
    for (const numero of cnjs) assert.ok(pacote.readback.includes(numero))
  })

  it("gerador publica portal humano e mantém 69/21 sem JSON da API", () => {
    const path = "QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/manifesto-processos-curadoria-69.json"
    const manifesto = JSON.parse(readFileSync(path, "utf8")) as {
      linhas: Array<{
        slug: string
        numero_cnj: string
        tipo: LinhaProcesso["tipo"]
        tribunal: string
        descricao: string
        status: string
        fonte: string
        url_fonte: string
      }>
    }
    const pacote = prepararPacoteProcessos({
      itensRevisao: manifesto.linhas.map((linha) => ({
        slug: linha.slug,
        numero_cnj: linha.numero_cnj,
        decisao: "publicar",
        identidade_confirmada: true,
        motivo: linha.descricao,
        estado_oficial: linha.status,
        fontes_oficiais: [{
          url: linha.url_fonte,
          titulo: linha.fonte.replace(/^curadoria-djen-20260805: /, ""),
        }],
      })),
      processosCuradoria: manifesto.linhas.map((linha) => ({
        numero_cnj: linha.numero_cnj,
        tribunal: linha.tribunal,
        classe: linha.tipo,
        url: linha.url_fonte.includes("comunicaapi.pje.jus.br")
          ? linha.url_fonte
          : `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${linha.numero_cnj.replace(/\D/g, "")}`,
      })),
      esperadoProcessos: 69,
      esperadoFichas: 21,
      timestamp: "20260810122000",
      aprovadoEditorialmente: true,
    })

    assert.equal(pacote.linhas.length, 69)
    for (const linha of pacote.linhas) {
      assert.doesNotMatch(linha.url_fonte, /comunicaapi\.pje\.jus\.br/)
      if (linha.url_fonte.includes("comunica.pje.jus.br")) {
        assert.match(linha.url_fonte, /^https:\/\/comunica\.pje\.jus\.br\/consulta\?numeroProcesso=\d{20}$/)
      }
    }
    assert.doesNotMatch(pacote.migration, /comunicaapi\.pje\.jus\.br/)
    assert.match(pacote.readback, /AS invalid_source_urls/)
    assert.match(pacote.readback, /url_fonte !~ '\^https:\/\/'/)
  })

  it("ignora fonte editorial representativa e usa a URL individual do processo", () => {
    const pacote = prepararPacoteProcessos({
      itensRevisao: [
        item({
          fontes_oficiais: [
            {
              url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=00104542320255030012",
              titulo: "Fonte representativa de outro processo",
            },
            {
              url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007",
              titulo: "Fonte individual do processo",
            },
          ],
        }),
      ],
      processosCuradoria: [processo()],
      esperadoProcessos: 1,
      esperadoFichas: 1,
      timestamp: "20260810122000",
    })
    assert.equal(
      pacote.linhas[0].url_fonte,
      "https://comunica.pje.jus.br/consulta?numeroProcesso=70000471020218220007",
    )
    assert.doesNotMatch(pacote.migration, /00104542320255030012/)
  })

  it("recusa URL individual que nao prova exatamente o proprio CNJ", () => {
    const invalidas = [
      "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=00104542320255030012",
      "http://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007",
      "https://example.com/api/v1/comunicacao?numeroProcesso=70000471020218220007",
      "https://comunicaapi.pje.jus.br/outro?numeroProcesso=70000471020218220007",
      "https://comunicaapi.pje.jus.br/api/v1/comunicacao",
      "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007&numeroProcesso=70000471020218220007",
      "https://usuario@comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007",
      "https://comunicaapi.pje.jus.br:444/api/v1/comunicacao?numeroProcesso=70000471020218220007",
      "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007#fragmento",
    ]
    for (const url of invalidas) {
      assert.throws(
        () =>
          prepararPacoteProcessos({
            itensRevisao: [item()],
            processosCuradoria: [processo({ url })],
            esperadoProcessos: 1,
            esperadoFichas: 1,
            timestamp: "20260810122000",
          }),
        /URL do Comunica PJe nao prova o proprio CNJ/,
      )
    }
  })

  it("falha antes de gerar SQL quando a evidencia diverge da matriz", () => {
    assert.throws(
      () =>
        prepararPacoteProcessos({
          itensRevisao: [item(), item({ numero_cnj: "7000071-67.2023.8.22.0007" })],
          processosCuradoria: [
            processo(),
            processo({ numero_cnj: "7000071-67.2023.8.22.0007" }),
          ],
          esperadoProcessos: 1,
          esperadoFichas: 1,
          timestamp: "20260810122000",
        }),
      /evidencia aprovada tem 2 processos; matriz exige 1/,
    )
  })

  it("recusa duplicidade, fonte ausente e identidade nao confirmada", () => {
    assert.throws(
      () =>
        prepararPacoteProcessos({
          itensRevisao: [item(), item()],
          processosCuradoria: [processo()],
          esperadoProcessos: 2,
          esperadoFichas: 1,
          timestamp: "20260810122000",
        }),
      /CNJ duplicado/,
    )
    assert.throws(
      () =>
        prepararPacoteProcessos({
          itensRevisao: [item({ fontes_oficiais: [] })],
          processosCuradoria: [processo()],
          esperadoProcessos: 1,
          esperadoFichas: 1,
          timestamp: "20260810122000",
        }),
      /fonte oficial ausente/,
    )
    assert.throws(
      () =>
        prepararPacoteProcessos({
          itensRevisao: [item({ identidade_confirmada: false })],
          processosCuradoria: [processo()],
          esperadoProcessos: 1,
          esperadoFichas: 1,
          timestamp: "20260810122000",
        }),
      /identidade nao confirmada/,
    )
  })
})
