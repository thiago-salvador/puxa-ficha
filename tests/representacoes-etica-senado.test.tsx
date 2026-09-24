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
      agora: new Date("2026-09-24T12:00:00Z"),
    })
    assert.equal(result.item.casa, "senado")
    assert.equal(result.item.id, idProcessoEticaSenado(901001, 88001))
  })

  it("limita o intervalo a três tokens de tratamentos formais da lista fechada", () => {
    assert.equal(temPapelDeAlvo("em face do Exmo Sr Senador Fictício Alfa", "Fictício Alfa"), true)
    assert.equal(temPapelDeAlvo("contra a Ex Senadora Fictícia Beta", "Fictícia Beta"), true)
    assert.equal(temPapelDeAlvo("em face do Exmo Sr Senhor Senador Fictício Alfa", "Fictício Alfa"), false)
    assert.equal(temPapelDeAlvo("em face do Ex Sr Fictício Alfa", "Fictício Alfa"), false)
    assert.equal(temPapelDeAlvo("em face do Ilustre Senador Fictício Alfa", "Fictício Alfa"), false)
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
      agora: new Date("2026-09-24T12:00:00Z"),
    }), /não identifica/)
  })

  it("recusa trecho de identidade que cita mais de um nome do roster", async () => {
    const ementa = "Representação em face do Senador Fictício Alfa contra o Senador Fictício Beta"
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
      agora: new Date("2026-09-24T12:00:00Z"),
    }), /mais de um|múltipl|nomes/i)
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
