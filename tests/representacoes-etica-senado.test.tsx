import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { RepresentacoesEticaCategoria } from "@/components/RepresentacoesEticaCategoria"
import {
  REPRESENTACOES_ETICA_POLICY,
  dataEmBrasilia,
  idProcessoEticaSenado,
  parseRepresentacaoAprovada,
  urlProcessoSenado,
  validateRepresentacoesEticaDataset,
  type RepresentacaoEticaSenadoAprovada,
} from "@/lib/representacoes-etica"
import {
  aprovarPceSenado,
  temPapelDeAlvo,
  type ProcessoPceAtual,
  type RevisaoPceSenado,
} from "../scripts/lib/representacoes-etica-senado-aprovacao"
import {
  coletarFilaPceSenado,
  type ApiSenado,
  type CandidatoSeedSenado,
  type FilaPceSenado,
} from "../scripts/lib/representacoes-etica-senado"

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/representacoes-etica-senado-api.sanitizado.json"), "utf8"))
const seed: CandidatoSeedSenado[] = [
  { slug: "senador-ficticio-alfa", ids: { senado: 88001 } },
  { slug: "senador-ficticio-beta", ids: { senado: 88002 } },
]

function apiFixture(): ApiSenado {
  return {
    async get(path) {
      if (path.startsWith("/processo?sigla=PCE")) return fixture.processos
      if (path.startsWith("/senador/lista/legislatura/")) return fixture.roster
      const details = path.match(/^\/processo\/(\d+)\?v=1$/)
      if (details) return fixture.detalhes[details[1] as keyof typeof fixture.detalhes]
      const documents = path.match(/^\/processo\/documento\?idProcesso=(\d+)&v=1$/)
      if (documents) return fixture.documentos[documents[1] as keyof typeof fixture.documentos]
      throw new Error(`path inesperado no fixture: ${path}`)
    },
  }
}

async function filaFixture(): Promise<FilaPceSenado> {
  return coletarFilaPceSenado({ api: apiFixture(), seed, agora: new Date("2026-09-24T12:00:00Z"), concorrencia: 2 })
}

function filaComEmenta(fila: FilaPceSenado, ementa: string): FilaPceSenado {
  return { ...fila, itens: fila.itens.map((item, index) => index === 0 ? { ...item, ementa_oficial: ementa } : item) }
}

function processoComEmenta(ementa: string): ProcessoPceAtual {
  return { ...processoAtualAlfa, conteudo: { ementa } }
}

function revisaoAlfa(itemId: string): RevisaoPceSenado {
  return {
    item_id: itemId,
    senador_id: 88001,
    candidate_slug: "senador-ficticio-alfa",
    trecho_ementa: "em face do Senador Fictício Alfa",
    papel_confirmado: "representado",
    alvo_confirmado_por_humano: true,
    candidato_confirmado_por_humano: true,
    situacao_confirmada_por_humano: true,
    situacao_sigla: "AGIND",
    situacao_descricao: "Aguardando indicação",
    aprovado_em: "2026-09-24",
  }
}

const processoAtualAlfa = fixture.detalhes["901001"] as ProcessoPceAtual

describe("golden sanitizado do serviço PCE do Senado", () => {
  it("preserva PCE, situação e data, sem inferir alvo nem candidato a partir da ementa/autoria", async () => {
    const fila = await filaFixture()
    assert.equal(fila.total_processos, 2)
    assert.deepEqual(fila.contagem_por_ano, { "2026": 2 })
    assert.deepEqual(fila.itens.map((item) => item.processo.sigla), ["PCE", "PCE"])
    assert.equal(fila.itens[0]?.situacao_atual.sigla, "AGIND")
    assert.equal(fila.itens[0]?.ultimo_andamento_em, "2026-04-03")
    assert.equal(fila.itens[0]?.url_oficial, urlProcessoSenado(901001))
    assert.equal(fila.itens[0]?.alvo, null)
    assert.equal(fila.itens[0]?.candidato_slug, null)
    assert.equal("senador_id" in (fila.itens[0] ?? {}), false)
    assert.deepEqual(fila.candidatos_por_senador_id["88001"], ["senador-ficticio-alfa"])
    assert.deepEqual(fila.candidatos_por_senador_id["88002"], ["senador-ficticio-beta"])
    assert.match(fixture.detalhes["901001"].documento.autoria[0].autor, /Beta/)
    assert.match(fila.itens[0]?.ementa_oficial ?? "", /Alfa/)
    assert.equal(fila.itens[0]?.documentos_estado, "carregados")
    assert.equal(fila.itens[1]?.documentos_estado, "nenhum_confirmado")
    assert.equal(fila.itens.every((item) => !("cpf" in item)), true)
  })

  it("distinge falha ao consultar documentos de uma resposta oficial vazia", async () => {
    const api = apiFixture()
    const queue = await coletarFilaPceSenado({
      api: { get: (path) => path.startsWith("/processo/documento?") ? Promise.reject(new Error("offline")) : api.get(path) },
      seed,
      agora: new Date("2026-09-24T12:00:00Z"),
    })
    assert.equal(queue.itens[0]?.documentos_estado, "falha")
    assert.ok(queue.itens[0]?.ementa_oficial.length)
  })
})

describe("ponte PCE → senador → candidato", () => {
  it("bloqueia ficha não publicável e registra override apenas após ausência confirmada", async () => {
    const fila = await filaFixture()
    const item = fila.itens[0]!
    const options = {
      fila,
      itemId: item.id,
      revisao: revisaoAlfa(item.id),
      processoAtual: processoAtualAlfa,
      roster: fila.roster,
      seed,
      dataset: { policy: REPRESENTACOES_ETICA_POLICY, itens: [] },
      agora: new Date("2026-09-24T12:00:00Z"),
      fichaPublica: false,
    }
    assert.throws(() => aprovarPceSenado(options), /sem ficha pública.*--permitir-ficha-nao-publicavel/)
    const { item: aprovado, dataset } = aprovarPceSenado({ ...options, permitirFichaNaoPublicavel: true })
    assert.deepEqual(aprovado.revisao.ficha_nao_publicavel, {
      permitido: true,
      opcao: "--permitir-ficha-nao-publicavel",
      fonte: "candidatos_publico",
      conferida_em: "2026-09-24",
    })
    assert.deepEqual(validateRepresentacoesEticaDataset(dataset).issues, [])
    assert.deepEqual(validateRepresentacoesEticaDataset(dataset).itens[0]?.revisao.ficha_nao_publicavel, aprovado.revisao.ficha_nao_publicavel)
    assert.throws(() => aprovarPceSenado({ ...options, fichaPublica: undefined as unknown as boolean, permitirFichaNaoPublicavel: true }), /indisponível/)
    assert.throws(() => aprovarPceSenado({ ...options, fichaPublica: true, permitirFichaNaoPublicavel: true }), /desnecessário/)
  })

  it("só prepara um item depois das três confirmações humanas e do id oficial exato", async () => {
    const fila = await filaFixture()
    const item = fila.itens[0]!
    const dataAtual = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    const result = aprovarPceSenado({
      fila,
      itemId: item.id,
      revisao: revisaoAlfa(item.id),
      processoAtual: processoAtualAlfa,
      roster: fila.roster,
      seed,
      dataset: dataAtual,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    })
    assert.equal(result.item.casa, "senado")
    assert.equal(result.item.id, idProcessoEticaSenado(901001, 88001))
    assert.equal(result.item.candidate_slug, "senador-ficticio-alfa")
    assert.equal(result.item.identidade.metodo, "seed_ids_senado")
    assert.equal(result.item.revisao.alvo_confirmado, true)
    assert.equal(result.item.revisao.candidato_confirmado, true)
    assert.equal(result.item.revisao.situacao_confirmada, true)
    assert.equal(result.item.revisao.situacao_sigla, "AGIND")
    assert.equal(result.item.revisao.situacao_descricao, "Aguardando indicação")
    assert.equal(result.item.identidade.alvo.trecho_sha256.length, 64)
    assert.equal(result.item.ultimo_andamento_em, "2026-04-03")
    assert.equal(result.item.verificado_em, dataEmBrasilia(new Date("2026-09-24T12:00:00Z")))
    assert.equal(result.dataset.itens.length, validateRepresentacoesEticaDataset(dataAtual).itens.length + 1)
  })

  it("aceita o cargo formal entre 'em face do' e o nome oficial do senador", async () => {
    const fila = await filaFixture()
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    assert.match(item.ementa_oficial, /em face do Senador Fictício Alfa/)
    assert.equal(fila.roster[0]?.nome_completo, "Fictício Alfa")
    const result = aprovarPceSenado({
      fila,
      itemId: item.id,
      revisao: revisaoAlfa(item.id),
      processoAtual: processoAtualAlfa,
      roster: fila.roster,
      seed,
      dataset,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    })
    assert.equal(result.item.casa, "senado")
    assert.equal(result.item.id, idProcessoEticaSenado(901001, 88001))
  })

  it("processo encerrado sem situação no topo usa a última situação oficial da autuação", async () => {
    const fila = await filaFixture()
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    const encerrado: ProcessoPceAtual = {
      ...processoAtualAlfa,
      situacaoAtual: undefined,
      siglaSituacaoAtual: undefined,
      dataSituacaoAtual: undefined,
      tramitando: "Não",
      autuacoes: [{ situacoes: [
        { sigla: "EXAME", descricao: "EM EXAME TÉCNICO PRELIMINAR", inicio: "2021-03-12", fim: "2023-06-19" },
        { sigla: "INDEFD", descricao: "INDEFERIDA", inicio: "2023-06-19", fim: "2026-05-27" },
      ] }],
    }
    const base = { fila, itemId: item.id, roster: fila.roster, seed, dataset, fichaPublica: true, agora: new Date("2026-09-24T12:00:00Z") }
    const revisao = { ...revisaoAlfa(item.id), situacao_sigla: "INDEFD", situacao_descricao: "INDEFERIDA" }
    const { item: aprovado } = aprovarPceSenado({ ...base, revisao, processoAtual: encerrado })
    assert.deepEqual(aprovado.situacao_oficial, { sigla: "INDEFD", descricao: "INDEFERIDA" })
    assert.equal(aprovado.ultimo_andamento_em, "2026-05-27")
    assert.throws(() => aprovarPceSenado({ ...base, revisao, processoAtual: { ...encerrado, tramitando: "Sim" } }), /estado oficial atual incompleto/)
  })

  it("aceita alvo pelo documento do processo quando a ementa cita só o senador escolhido", async () => {
    const ementa = "Requer medidas para apurar a visita do Senador Fictício Alfa à terra indígena"
    const fila = filaComEmenta(await filaFixture(), ementa)
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    const documento = {
      documento_url: "https://legis.senado.gov.br/sdleg-getter/documento?dm=123456",
      trecho_documento: "solicitar medidas para afastar o Senador Fictício Alfa da presidência da comissão",
      confirmado_por_humano: true as const,
    }
    const base = {
      fila,
      itemId: item.id,
      processoAtual: processoComEmenta(ementa),
      roster: fila.roster,
      seed,
      dataset,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    }
    const revisao = { ...revisaoAlfa(item.id), trecho_ementa: "a visita do Senador Fictício Alfa" }
    assert.throws(() => aprovarPceSenado({ ...base, revisao }), /não identifica/)
    const { item: aprovado } = aprovarPceSenado({ ...base, revisao: { ...revisao, alvo_por_documento: documento } })
    assert.equal(aprovado.casa, "senado")
    assert.equal(aprovado.casa === "senado" ? aprovado.identidade.alvo.metodo : null, "documento")
    assert.throws(
      () => aprovarPceSenado({ ...base, revisao: { ...revisao, alvo_por_documento: { ...documento, trecho_documento: "solicitar medidas para afastar o Senador Fictício Gama da comissão" } } }),
      /não nomeia/,
    )
    assert.throws(
      () => aprovarPceSenado({ ...base, revisao: { ...revisao, alvo_por_documento: { ...documento, documento_url: "https://example.com/documento?dm=1" } } }),
      /repositório oficial/,
    )
    assert.throws(
      () => aprovarPceSenado({ ...base, revisao: { ...revisao, alvo_por_documento: { ...documento, confirmado_por_humano: false as unknown as true } } }),
      /não identifica/,
    )
    const ementaDupla = "Requer medidas para apurar a visita do Senador Fictício Alfa e do Senador Fictício Beta"
    const filaDupla = filaComEmenta(await filaFixture(), ementaDupla)
    assert.throws(
      () => aprovarPceSenado({
        ...base,
        fila: filaDupla,
        processoAtual: processoComEmenta(ementaDupla),
        revisao: { ...revisao, trecho_ementa: "a visita do Senador Fictício Alfa e do Senador Fictício Beta", alvo_por_documento: documento },
      }),
      /mais de um senador|não identifica/,
    )
  })

  it("limita o intervalo a três tokens de tratamentos formais da lista fechada", () => {
    assert.equal(temPapelDeAlvo("em face do Exmo Sr Senador Fictício Alfa", "Fictício Alfa"), true)
    assert.equal(temPapelDeAlvo("contra a Ex Senadora Fictícia Beta", "Fictícia Beta"), true)
    assert.equal(temPapelDeAlvo("em face do Exmo Sr Senhor Senador Fictício Alfa", "Fictício Alfa"), false)
    assert.equal(temPapelDeAlvo("em face do Ex Sr Fictício Alfa", "Fictício Alfa"), false)
    assert.equal(temPapelDeAlvo("em face do Ilustre Senador Fictício Alfa", "Fictício Alfa"), false)
  })

  it("aceita lista plural de representados só com o nome inteiro como item da lista", () => {
    // singular continua valendo
    assert.equal(temPapelDeAlvo("em face do Senador Fictício Alfa, com fundamento", "Fictício Alfa"), true)
    // plural com o nome na lista, inclusive no meio e depois de "e da Senadora"
    assert.equal(temPapelDeAlvo("em face dos Senadores Fictício Alfa e Fictício Gama, com fundamento", "Fictício Gama"), true)
    assert.equal(temPapelDeAlvo("em face dos Senadores Fictício Alfa, Fictício Gama e Fictício Delta, com fundamento", "Fictício Gama"), true)
    assert.equal(temPapelDeAlvo("em face dos Senadores Fictício Alfa e Fictício Gama e da Senadora Fictícia Beta com fundamento", "Fictícia Beta"), true)
    assert.equal(temPapelDeAlvo("contra as Senadoras Fictícia Beta e Fictícia Épsilon", "Fictícia Epsilon"), true)
    // ponto encerra a lista de representados
    assert.equal(temPapelDeAlvo("em face dos Senadores Fictício Alfa e Fictício Gama. Solicita-se apuração", "Fictício Gama"), true)
    assert.equal(temPapelDeAlvo("em face dos Senadores Fictício Alfa e Fictício Gama. Requer o Senador Fictício Delta", "Fictício Delta"), false)
    // plural sem o nome, ou com o nome só como pedaço de outro item
    assert.equal(temPapelDeAlvo("em face dos Senadores Fictício Gama e Fictício Delta, com fundamento", "Fictício Alfa"), false)
    assert.equal(temPapelDeAlvo("em face dos Senadores Fictício Alfa Neto e Fictício Gama", "Fictício Alfa"), false)
    // nome só como autor: fora da lista de representados
    assert.equal(temPapelDeAlvo("Requer o Senador Fictício Alfa a abertura de procedimento em face dos Senadores Fictício Gama e Fictício Delta", "Fictício Alfa"), false)
    assert.equal(temPapelDeAlvo("em face dos Senadores Fictício Gama e Fictício Delta, com fundamento em denúncia do Senador Fictício Alfa", "Fictício Alfa"), false)
  })

  it("recusa autoria confundida com alvo, nome incompatível e link de candidato por rótulo", async () => {
    const fila = await filaFixture()
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    const base = {
      fila,
      itemId: item.id,
      processoAtual: processoAtualAlfa,
      roster: fila.roster,
      seed,
      dataset,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    }
    assert.throws(() => aprovarPceSenado({ ...base, revisao: { ...revisaoAlfa(item.id), papel_confirmado: "autor" } as unknown as RevisaoPceSenado }), /recibo humano/)
    assert.throws(() => aprovarPceSenado({ ...base, revisao: { ...revisaoAlfa(item.id), senador_id: 88002, candidate_slug: "senador-ficticio-beta" } }), /não identifica/)
    assert.throws(() => aprovarPceSenado({ ...base, revisao: { ...revisaoAlfa(item.id), candidate_slug: "senador-ficticio-beta" } }), /ids\.senado/)
  })

  it("recusa mudança de fonte e falta de confirmação de uma das pontes", async () => {
    const fila = await filaFixture()
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    const base = {
      fila,
      itemId: item.id,
      revisao: revisaoAlfa(item.id),
      roster: fila.roster,
      seed,
      dataset,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    }
    assert.throws(() => aprovarPceSenado({ ...base, processoAtual: { ...processoAtualAlfa, conteudo: { ementa: "ementa alterada" } } }), /ementa mudou/)
    assert.throws(() => aprovarPceSenado({ ...base, revisao: { ...revisaoAlfa(item.id), situacao_confirmada_por_humano: false } as unknown as RevisaoPceSenado, processoAtual: processoAtualAlfa }), /recibo humano/)
  })

  it("recusa o autor como alvo mesmo quando o trecho contém seu nome oficial", async () => {
    const ementa = "Representação do Senador Fictício Beta em face do Senador Fictício Alfa"
    const fila = filaComEmenta(await filaFixture(), ementa)
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    const base = {
      fila,
      itemId: item.id,
      processoAtual: processoComEmenta(ementa),
      roster: fila.roster,
      seed,
      dataset,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    }
    const autor = { ...revisaoAlfa(item.id), senador_id: 88002, candidate_slug: "senador-ficticio-beta" }
    assert.throws(() => aprovarPceSenado({ ...base, revisao: { ...autor, trecho_ementa: ementa } }), /mais de um|múltipl/i)
    assert.throws(() => aprovarPceSenado({ ...base, revisao: { ...autor, trecho_ementa: "do Senador Fictício Beta" } }), /não identifica/)
  })

  it("recusa tratamento fora da lista entre o papel e o nome oficial", async () => {
    const ementa = "Representação em face do Ilustre Senador Fictício Alfa"
    const fila = filaComEmenta(await filaFixture(), ementa)
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    assert.throws(() => aprovarPceSenado({
      fila,
      itemId: item.id,
      revisao: { ...revisaoAlfa(item.id), trecho_ementa: "em face do Ilustre Senador Fictício Alfa" },
      processoAtual: processoComEmenta(ementa),
      roster: fila.roster,
      seed,
      dataset,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    }), /não identifica/)
  })

  it("aceita mais de um senador no trecho só quando cada um é alvo explícito", async () => {
    const aprovar = async (ementa: string, trecho: string) => {
      const fila = filaComEmenta(await filaFixture(), ementa)
      const item = fila.itens[0]!
      const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
      return aprovarPceSenado({
        fila,
        itemId: item.id,
        revisao: { ...revisaoAlfa(item.id), trecho_ementa: trecho },
        processoAtual: processoComEmenta(ementa),
        roster: fila.roster,
        seed,
        dataset,
        fichaPublica: true,
        agora: new Date("2026-09-24T12:00:00Z"),
      })
    }
    // papel singular e lista plural no mesmo trecho: os dois senadores são alvos
    const misto = "Representação em face do Senador Fictício Alfa; em face dos Senadores Fictício Beta e Fictício Gama"
    assert.equal((await aprovar(misto, misto)).item.candidate_slug, "senador-ficticio-alfa")
    const doisSingulares = "Representação em face do Senador Fictício Alfa contra o Senador Fictício Beta"
    assert.equal((await aprovar(doisSingulares, doisSingulares)).item.candidate_slug, "senador-ficticio-alfa")
    // o outro senador aparece só como autor: recusa
    const autor = "Representação do Senador Fictício Beta em face do Senador Fictício Alfa"
    await assert.rejects(aprovar(autor, autor), /mais de um|múltipl|nomes/i)
  })

  it("recusa nome do senador sem papel explícito de representado no trecho", async () => {
    const ementa = "Representação sobre o Senador Fictício Alfa"
    const fila = filaComEmenta(await filaFixture(), ementa)
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    assert.throws(() => aprovarPceSenado({
      fila,
      itemId: item.id,
      revisao: { ...revisaoAlfa(item.id), trecho_ementa: ementa },
      processoAtual: processoComEmenta(ementa),
      roster: fila.roster,
      seed,
      dataset,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    }), /papel|alvo|em face|contra/i)
  })

  it("recusa situação atual diferente da que o humano revisou", async () => {
    const fila = await filaFixture()
    const item = fila.itens[0]!
    const dataset = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    assert.throws(() => aprovarPceSenado({
      fila,
      itemId: item.id,
      revisao: revisaoAlfa(item.id),
      processoAtual: { ...processoAtualAlfa, siglaSituacaoAtual: "ARQ", situacaoAtual: "Arquivado" },
      roster: fila.roster,
      seed,
      dataset,
      fichaPublica: true,
      agora: new Date("2026-09-24T12:00:00Z"),
    }), /situação.*mudou|divergente|revisad/i)
  })
})

describe("schema e apresentação pública do Senado", () => {
  it("mantém a Câmara compatível e só aceita registro Senado com a ponte editorial", () => {
    const current = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/representacoes-conselho-etica.json"), "utf8"))
    assert.deepEqual(validateRepresentacoesEticaDataset(current).issues, [])
    const fila = {
      policy: REPRESENTACOES_ETICA_POLICY,
      itens: [{
        id: idProcessoEticaSenado(901001, 88001),
        candidate_slug: "senador-ficticio-alfa",
        casa: "senado",
        senador_id: 88001,
        processo: { id: 901001, sigla: "PCE", numero: 1, ano: 2026 },
        situacao_oficial: { sigla: "AGIND", descricao: "Aguardando indicação" },
        ultimo_andamento_em: "2026-04-03",
        verificado_em: "2026-09-24",
        url_oficial: urlProcessoSenado(901001),
        identidade: {
          metodo: "seed_ids_senado",
          conferida_em: "2026-09-24",
          alvo: { metodo: "ementa", fonte_url: urlProcessoSenado(901001), trecho_sha256: "a".repeat(64), conferida_em: "2026-09-24" },
        },
        revisao: { aprovado: true, revisor_tipo: "humano", aprovado_em: "2026-09-24", alvo_confirmado: true, candidato_confirmado: true, situacao_confirmada: true, situacao_sigla: "AGIND", situacao_descricao: "Aguardando indicação" },
      } satisfies RepresentacaoEticaSenadoAprovada],
    }
    const parsed = parseRepresentacaoAprovada(fila.itens[0])
    assert.equal(parsed.ok, true)
    assert.equal(validateRepresentacoesEticaDataset(fila).issues.length, 0)
    const semAlvo = { ...fila.itens[0], identidade: { ...fila.itens[0].identidade, alvo: undefined } }
    const parsedSemAlvo = parseRepresentacaoAprovada(semAlvo)
    assert.equal(parsedSemAlvo.ok, false)
    if (!parsedSemAlvo.ok) assert.match(parsedSemAlvo.motivo, /duas pontes/)
    const semConfirmacao = { ...fila.itens[0], revisao: { ...fila.itens[0].revisao, candidato_confirmado: false } }
    const parsedSemConfirmacao = parseRepresentacaoAprovada(semConfirmacao)
    assert.equal(parsedSemConfirmacao.ok, false)
    if (!parsedSemConfirmacao.ok) assert.match(parsedSemConfirmacao.motivo, /aprovação humana/)
  })

  it("renderiza Senado separado da Câmara e informa situação oficial, datas, fonte e ausência de condenação", () => {
    const item: RepresentacaoEticaSenadoAprovada = {
      id: idProcessoEticaSenado(901001, 88001),
      candidate_slug: "senador-ficticio-alfa",
      casa: "senado",
      senador_id: 88001,
      processo: { id: 901001, sigla: "PCE", numero: 1, ano: 2026 },
      situacao_oficial: { sigla: "AGIND", descricao: "Aguardando indicação" },
      ultimo_andamento_em: "2026-04-03",
      verificado_em: "2026-09-24",
      url_oficial: urlProcessoSenado(901001),
      identidade: { metodo: "seed_ids_senado", conferida_em: "2026-09-24", alvo: { metodo: "ementa", fonte_url: urlProcessoSenado(901001), trecho_sha256: "b".repeat(64), conferida_em: "2026-09-24" } },
      revisao: { aprovado: true, revisor_tipo: "humano", aprovado_em: "2026-09-24", alvo_confirmado: true, candidato_confirmado: true, situacao_confirmada: true, situacao_sigla: "AGIND", situacao_descricao: "Aguardando indicação" },
    }
    const html = renderToStaticMarkup(createElement(RepresentacoesEticaCategoria, { representacoes: [item] }))
    assert.match(html, /Processos disciplinares no Senado \(1\)/)
    assert.match(html, /PCE 1\/2026/)
    assert.match(html, /Situação oficial AGIND: Aguardando indicação/)
    assert.match(html, /href="https:\/\/legis\.senado\.leg\.br\/dadosabertos\/processo\/901001\?v=1"/)
    assert.match(html, /não significa condenação/)
    assert.doesNotMatch(html, /Processos disciplinares na Câmara/)
  })
})
