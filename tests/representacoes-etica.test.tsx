import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { RepresentacoesEticaCategoria, REPRESENTACOES_ETICA_NOTA } from "@/components/RepresentacoesEticaCategoria"
import {
  FASE_REPRESENTACAO_LABEL,
  FASES_REPRESENTACAO,
  FASES_SO_REVISAO_HUMANA,
  sugerirFaseRepresentacao,
  type TramitacaoCamara,
} from "@/lib/representacoes-etica-fase"
import {
  REPRESENTACOES_ETICA_POLICY,
  dataEmBrasilia,
  getRepresentacoesEticaAprovadas,
  indexarRepresentacoesEtica,
  selectRepresentacoesEtica,
  validateRepresentacoesEticaDataset,
  type RepresentacaoEticaAprovada,
} from "@/lib/representacoes-etica"
import { stripAccents } from "@/lib/strip-accents"
import { aprovarRepresentacao } from "../scripts/aprovar-representacao-etica"
import {
  avaliarRepresentacao,
  indiceDeNomes,
  indicesDeCandidatos,
  type CandidatoSeed,
  type DeputadoLegislatura,
  type Fila,
  type ItemFila,
} from "../scripts/lib/representacoes-etica-coleta"

function tramitacao(partial: Partial<TramitacaoCamara> & Pick<TramitacaoCamara, "dataHora" | "siglaOrgao" | "codTipoTramitacao">): TramitacaoCamara {
  return {
    sequencia: 1,
    descricaoTramitacao: "",
    codSituacao: null,
    descricaoSituacao: null,
    despacho: "",
    url: null,
    ...partial,
  }
}

const aprovado: RepresentacaoEticaAprovada = {
  id: "camara-rep-2563294-dep-156190",
  candidate_slug: "tse-2026-210002547819",
  casa: "camara",
  deputado_id: 156190,
  proposicao: { id: 2563294, sigla: "REP", numero: 25, ano: 2025 },
  fase: "procedente_conselho_recurso_pendente",
  ultimo_andamento_em: "2026-05-19",
  verificado_em: "2026-09-23",
  url_oficial: "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2563294",
  identidade: { metodo: "cpf_tse_camara", conferida_em: "2026-09-23" },
  revisao: { aprovado: true, revisor_tipo: "humano", aprovado_em: "2026-09-23" },
}

describe("sugestão de fase por código", () => {
  it("processo instaurado vence apresentação e despacho anteriores", () => {
    const s = sugerirFaseRepresentacao({
      representacaoId: 1,
      tramitacoes: [
        tramitacao({ dataHora: "2026-04-16T10:00", siglaOrgao: "MESA", codTipoTramitacao: "100" }),
        tramitacao({ dataHora: "2026-04-16T12:00", siglaOrgao: "MESA", codTipoTramitacao: "1023" }),
        tramitacao({ dataHora: "2026-06-09T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "1059" }),
        tramitacao({ dataHora: "2026-08-27T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "199" }),
      ],
      situacaoAtual: { codSituacao: 915, descricaoSituacao: "Aguardando Parecer" },
      recursos: [],
    })
    assert.deepEqual([s?.fase, s?.data], ["processo_instaurado", "2026-06-09"])
  })

  it("recurso contra apensação não conta como recurso contra o Conselho", () => {
    const s = sugerirFaseRepresentacao({
      representacaoId: 1,
      tramitacoes: [tramitacao({ dataHora: "2025-10-07T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "1059" })],
      situacaoAtual: { codSituacao: null, descricaoSituacao: null },
      recursos: [
        {
          id: 9,
          numero: 19,
          ano: 2025,
          codTipo: 379,
          ementa: "Interpor recurso contra a decisão de apensamento das representações",
          dataApresentacao: "2025-10-09T09:18",
          codSituacao: 1201,
          descricaoSituacao: "Aguardando Despacho",
          tramitacoes: [],
        },
      ],
    })
    assert.equal(s?.fase, "processo_instaurado")
  })

  it("recurso na CCJ avança a fase pela tramitação do REC", () => {
    const s = sugerirFaseRepresentacao({
      representacaoId: 1,
      tramitacoes: [tramitacao({ dataHora: "2026-03-01T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "1059" })],
      situacaoAtual: { codSituacao: null, descricaoSituacao: null },
      recursos: [
        {
          id: 9,
          numero: 13,
          ano: 2026,
          codTipo: 618,
          ementa: "RECURSO contra a decisão do Conselho de Ética",
          dataApresentacao: "2026-05-19T19:35",
          codSituacao: null,
          descricaoSituacao: null,
          tramitacoes: [tramitacao({ dataHora: "2026-06-02T10:00", siglaOrgao: "CCJC", codTipoTramitacao: "500" })],
        },
      ],
    })
    assert.deepEqual([s?.fase, s?.data, s?.evidencia.origem], ["em_analise_ccj", "2026-06-02", "recurso"])
  })

  it("evento genérico tardio não faz a fase recuar (sequência real da REP 5/2024 e 22/2025)", () => {
    const s = sugerirFaseRepresentacao({
      representacaoId: 1,
      tramitacoes: [
        tramitacao({ dataHora: "2024-04-24T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "1059" }),
        tramitacao({ dataHora: "2024-06-01T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "1062" }),
        tramitacao({ dataHora: "2025-12-10T17:14", siglaOrgao: "MESA", codTipoTramitacao: "100", despacho: "Apresentação do PRC n. 86/2025" }),
        tramitacao({ dataHora: "2026-03-30T00:00", siglaOrgao: "MESA", codTipoTramitacao: "1023", despacho: "Publique-se o parecer" }),
      ],
      situacaoAtual: { codSituacao: null, descricaoSituacao: null },
      recursos: [],
    })
    assert.deepEqual([s?.fase, s?.data], ["em_instrucao", "2024-06-01"])
  })

  it("arquivamento posterior ainda encerra a fase", () => {
    const s = sugerirFaseRepresentacao({
      representacaoId: 1,
      tramitacoes: [
        tramitacao({ dataHora: "2023-08-30T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "1059" }),
        tramitacao({ dataHora: "2024-02-06T00:00", siglaOrgao: "MESA", codTipoTramitacao: "502" }),
      ],
      situacaoAtual: { codSituacao: 923, descricaoSituacao: "Arquivada" },
      recursos: [],
    })
    assert.deepEqual([s?.fase, s?.data], ["arquivada", "2024-02-06"])
  })

  it("sem tramitação conhecida devolve null em vez de inventar fase", () => {
    const s = sugerirFaseRepresentacao({
      representacaoId: 1,
      tramitacoes: [tramitacao({ dataHora: "2026-01-01T00:00", siglaOrgao: "CCP", codTipoTramitacao: "604" })],
      situacaoAtual: { codSituacao: null, descricaoSituacao: null },
      recursos: [],
    })
    assert.equal(s, null)
  })

  it("o código nunca sugere fase que depende do sentido da votação", () => {
    for (const cod of ["100", "1023", "1059", "1061", "322", "231", "336", "335", "435", "502", "192"]) {
      const s = sugerirFaseRepresentacao({
        representacaoId: 1,
        tramitacoes: [
          tramitacao({
            dataHora: "2026-01-01T00:00",
            siglaOrgao: cod === "100" || cod === "1023" || cod === "502" || cod === "192" ? "MESA" : "COETICA",
            codTipoTramitacao: cod,
            despacho: "Aprovado o parecer pela procedência, contra a decisão do Conselho de Ética",
          }),
        ],
        situacaoAtual: { codSituacao: null, descricaoSituacao: null },
        recursos: [],
      })
      assert.ok(s, `código ${cod} deveria sugerir fase`)
      assert.ok(!FASES_SO_REVISAO_HUMANA.has(s.fase), `código ${cod} sugeriu ${s.fase}`)
    }
  })
})

describe("vocabulário da ficha", () => {
  // Radicais que afirmam culpa. "Condenação" só pode aparecer negada, na nota.
  const PROIBIDAS = /\b(condenad\w*|culpad\w*|criminos\w*|crimes?|reus?|punid\w*|cassad\w*)\b/
  const semAcento = (texto: string) => stripAccents(texto).toLowerCase()

  it("nenhum rótulo de fase usa linguagem de condenação", () => {
    for (const fase of FASES_REPRESENTACAO) {
      const texto = semAcento(FASE_REPRESENTACAO_LABEL[fase])
      assert.doesNotMatch(texto, PROIBIDAS, fase)
      assert.doesNotMatch(texto, /condenacao/, fase)
    }
  })

  it("o bloco renderizado só menciona condenação para negá-la", () => {
    const html = renderToStaticMarkup(
      <RepresentacoesEticaCategoria representacoes={FASES_REPRESENTACAO.map((fase) => ({ ...aprovado, fase }))} />,
    )
    const texto = semAcento(html.replace(/<[^>]+>/g, " "))
    assert.doesNotMatch(texto, PROIBIDAS)
    assert.equal(texto.match(/condenacao/g)?.length, 1)
    assert.match(texto, /nao significa condenacao/)
    assert.ok(semAcento(REPRESENTACOES_ETICA_NOTA).includes("nao significa condenacao"))
  })

  it("todo valor do enum tem rótulo por extenso", () => {
    for (const fase of FASES_REPRESENTACAO) assert.ok(FASE_REPRESENTACAO_LABEL[fase].length > 20, fase)
  })
})

describe("dataset aprovado", () => {
  it("o dataset do repositório não publica nada sem aprovação", () => {
    const raw = JSON.parse(readFileSync("scripts/data/representacoes-conselho-etica.json", "utf8"))
    assert.deepEqual(validateRepresentacoesEticaDataset(raw).issues, [])
  })

  it("recusa item sem aprovação humana, com URL fora da Câmara ou com fase fora do enum", () => {
    const casos: Array<[string, unknown]> = [
      ["sem aprovação humana registrada", { ...aprovado, revisao: { aprovado: true, revisor_tipo: "modelo", aprovado_em: "2026-09-23" } }],
      ["url_oficial não é a ficha oficial da proposição", { ...aprovado, url_oficial: "https://exemplo.com/rep" }],
      ["fase fora do enum", { ...aprovado, fase: "condenado" }],
      ["id não bate com proposição e deputado", { ...aprovado, deputado_id: 1 }],
      ["verificado_em anterior ao último andamento", { ...aprovado, verificado_em: "2026-01-01" }],
      ["sem registro da conferência de identidade", { ...aprovado, identidade: undefined }],
      ["sem registro da conferência de identidade", { ...aprovado, identidade: { metodo: "nome", conferida_em: "2026-09-23" } }],
    ]
    for (const [motivo, item] of casos) {
      const { itens, issues } = validateRepresentacoesEticaDataset({ policy: REPRESENTACOES_ETICA_POLICY, itens: [item] })
      assert.equal(itens.length, 0)
      assert.equal(issues[0]?.motivo, motivo)
    }
  })

  it("seleciona só o candidato pedido, do andamento mais recente para o mais antigo", () => {
    const antigo = { ...aprovado, id: "camara-rep-1-dep-156190", proposicao: { ...aprovado.proposicao, id: 1 }, ultimo_andamento_em: "2024-01-01" }
    const outro = { ...aprovado, candidate_slug: "outro" }
    assert.deepEqual(selectRepresentacoesEtica([antigo, outro, aprovado], aprovado.candidate_slug).map((i) => i.id), [aprovado.id, antigo.id])
    assert.deepEqual(getRepresentacoesEticaAprovadas("slug-que-nao-existe"), [])
  })

  it("o índice por slug serve só itens válidos, com referência estável", () => {
    const invalido = { ...aprovado, id: "camara-rep-9-dep-9", url_oficial: "https://exemplo.com" }
    const buscar = indexarRepresentacoesEtica({ policy: REPRESENTACOES_ETICA_POLICY, itens: [aprovado, invalido] })
    assert.deepEqual(buscar(aprovado.candidate_slug).map((i) => i.id), [aprovado.id])
    assert.equal(buscar(aprovado.candidate_slug), buscar(aprovado.candidate_slug))
    assert.equal(buscar("outro"), buscar("mais-um"))
  })

  it("data de verificação é o dia em Brasília, não em UTC", () => {
    assert.equal(dataEmBrasilia(new Date("2026-09-24T00:30:00Z")), "2026-09-23")
  })
})

describe("aprovação", () => {
  const itemFila: ItemFila = {
    id: "camara-rep-2563294-dep-156190",
    status_revisao: "pendente",
    candidato: { slug: "tse-2026-210002547819", nome_urna: "MARCEL VAN HATTEM", cargo_disputado: "Senador", estado: "RS", metodo_identidade: "cpf_tse_camara" },
    deputado: { id: 156190, nome: "Marcel van Hattem", via_alvo: "nome_parlamentar", nome_casado: "MARCEL VAN HATTEM", url_api: "" },
    representacao: {
      id: 2563294,
      sigla: "REP",
      numero: 25,
      ano: 2025,
      ementa: "",
      data_apresentacao: "2025-09-23",
      url_oficial: "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2563294",
      url_api: "",
      apensada_a: 2563290,
      situacao_camara: null,
    },
    fase_sugerida: null,
    fase_sugerida_label: null,
    ultimo_andamento: { proposicao_id: 2563294, data: "2026-05-19", orgao: "MESA", descricao: "", despacho: "" },
    recursos: [],
    despachos_para_revisao: [],
    verificado_em: "2026-09-23",
  }
  const filaCom = (item: ItemFila) => ({ schema_version: 1, fonte: "camara-dadosabertos-v2", itens: [item] }) as unknown as Fila
  const vazio = { policy: REPRESENTACOES_ETICA_POLICY, itens: [] }
  // Nas fontes de hoje o item é idêntico ao da fila.
  const base = { fila: filaCom(itemFila), itemId: itemFila.id, aprovadoEm: "2026-09-23", dataset: vazio, substituir: false, remontado: itemFila }

  it("grava a fase escolhida pelo revisor com dados remontados nas fontes", () => {
    const { item, dataset } = aprovarRepresentacao({ ...base, fase: "procedente_conselho_recurso_pendente" })
    assert.deepEqual(item, aprovado)
    assert.equal(dataset.itens.length, 1)
    assert.deepEqual(validateRepresentacoesEticaDataset(dataset).issues, [])
  })

  it("recusa fase fora do enum, item fora da fila e reaprovação sem --substituir", () => {
    assert.throws(() => aprovarRepresentacao({ ...base, fase: "condenado" }), /--fase inválida/)
    assert.throws(() => aprovarRepresentacao({ ...base, itemId: "x", fase: "arquivada" }), /não está na fila/)
    const { dataset } = aprovarRepresentacao({ ...base, fase: "recurso_apresentado" })
    assert.throws(() => aprovarRepresentacao({ ...base, dataset, fase: "arquivada" }), /já aprovado/)
    assert.equal(aprovarRepresentacao({ ...base, dataset, fase: "arquivada", substituir: true }).dataset.itens[0].fase, "arquivada")
    assert.throws(() => aprovarRepresentacao({ ...base, fila: { itens: [itemFila] } as unknown as Fila, fase: "arquivada" }), /fila inválido/)
  })

  it("recusa número da REP e último andamento adulterados na fila", () => {
    const numero = { ...itemFila, representacao: { ...itemFila.representacao, numero: 999 } }
    assert.throws(() => aprovarRepresentacao({ ...base, fila: filaCom(numero), fase: "recurso_apresentado" }), /número da REP: fila 999, fontes 25/)
    const data = { ...itemFila, ultimo_andamento: { ...itemFila.ultimo_andamento!, data: "2026-09-23" } }
    assert.throws(() => aprovarRepresentacao({ ...base, fila: filaCom(data), fase: "recurso_apresentado" }), /último andamento: fila 2026-09-23, fontes 2026-05-19/)
  })

  it("recusa quando as fontes não sustentam o par: nome curto contido no nome de outro deputado", () => {
    // A fila aponta para "Vicentinho" (1), mas a ementa nomeia "Vicentinho Júnior" (2).
    const deputados: DeputadoLegislatura[] = [
      { id: 1, nome: "Vicentinho", nomeCivil: "VICENTE PAULO DA SILVA", cpf: "11144477735" },
      { id: 2, nome: "Vicentinho Júnior", nomeCivil: "VICENTE ALVES DE OLIVEIRA JÚNIOR", cpf: "52998224725" },
    ]
    const seedCurto: CandidatoSeed[] = [
      { slug: "cand-1", nome_urna: "V", cargo_disputado: "Senador", estado: "SP", ids: { camara: null, tse_sq_candidato: { "2026": "sq1" } } },
    ]
    const avaliacao = avaliarRepresentacao(
      {
        rep: {
          id: 50, siglaTipo: "REP", codTipo: 146, numero: 1, ano: 2026, dataApresentacao: "2026-01-01T10:00",
          ementa: "Representação em desfavor do Senhor Deputado VICENTINHO JÚNIOR, protocolizada em 1/1/2026.",
          statusProposicao: tramitacao({ dataHora: "2026-01-02T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "1059" }),
        },
        tramitacoes: [tramitacao({ dataHora: "2026-01-02T00:00", siglaOrgao: "COETICA", codTipoTramitacao: "1059" })],
        recursos: [],
      },
      { nomes: indiceDeNomes(deputados), porDeputado: new Map(deputados.map((d) => [d.id, d])), indices: indicesDeCandidatos(seedCurto, new Map([["sq1", "11144477735"]])), hoje: "2026-09-23" },
    )
    assert.equal(avaliacao.itens.some((i) => i.deputado.id === 1), false, "nome curto não liga o deputado 1")
    const adulterado = { ...itemFila, id: "camara-rep-50-dep-1", deputado: { ...itemFila.deputado, id: 1 } }
    assert.throws(
      () => aprovarRepresentacao({ ...base, fila: filaCom(adulterado), itemId: adulterado.id, remontado: avaliacao.itens.find((i) => i.id === adulterado.id) ?? null, fase: "recurso_apresentado" }),
      /as fontes de hoje não ligam/,
    )
  })

  it("recusa data de verificação no futuro e fontes mais antigas que o aprovado", () => {
    const futuro = { ...itemFila, verificado_em: "2099-12-31" }
    assert.throws(() => aprovarRepresentacao({ ...base, remontado: futuro, fase: "recurso_apresentado" }), /no futuro/)
    const novo = { ...aprovado, verificado_em: "2026-10-01", ultimo_andamento_em: "2026-09-30" }
    const comNovo = { policy: REPRESENTACOES_ETICA_POLICY, itens: [novo] }
    assert.throws(() => aprovarRepresentacao({ ...base, aprovadoEm: "2026-10-02", dataset: comNovo, substituir: true, fase: "arquivada" }), /mais antigas/)
  })
})

describe("categoria na ficha", () => {
  it("mostra fase por extenso, datas, fonte oficial e a nota de que não é condenação", () => {
    const html = renderToStaticMarkup(<RepresentacoesEticaCategoria representacoes={[aprovado]} />)
    assert.match(html, /Processos disciplinares na Câmara \(1\)/)
    assert.match(html, /Representação 25\/2025/)
    assert.match(html, /Representação aprovada no Conselho de Ética; recurso do deputado aguarda análise/)
    assert.match(html, /Último andamento em 19\/05\/2026/)
    assert.match(html, /Verificado em 23\/09\/2026/)
    assert.match(html, /href="https:\/\/www\.camara\.leg\.br\/proposicoesWeb\/fichadetramitacao\?idProposicao=2563294"/)
    assert.match(html, /Não é processo judicial e não significa condenação/)
  })

  it("não renderiza nada sem representação aprovada", () => {
    assert.equal(renderToStaticMarkup(<RepresentacoesEticaCategoria representacoes={[]} />), "")
  })
})
