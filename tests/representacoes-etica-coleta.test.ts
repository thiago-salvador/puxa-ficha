import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { cachePodeGuardar, dentroDeCheckoutGit } from "../scripts/coletar-representacoes-etica"
import {
  coletarRepresentacoesEtica,
  indiceDeNomes,
  indicesDeCandidatos,
  resolverAlvos,
  trechoDoAlvo,
  vincularCandidato,
  type ApiCamara,
  type CandidatoSeed,
  type DeputadoLegislatura,
} from "../scripts/lib/representacoes-etica-coleta"

const FIXTURE = "tests/fixtures/representacoes-etica"
const respostas = JSON.parse(readFileSync(`${FIXTURE}/api-camara-golden.json`, "utf8")) as Record<
  string,
  { dados: unknown; links?: Array<{ rel: string; href: string }> }
>
// A variável existe para o controle negativo: um golden adulterado precisa falhar.
const golden = JSON.parse(readFileSync(process.env.PF_REP_ETICA_GOLDEN ?? `${FIXTURE}/golden.json`, "utf8"))

const apiGravada: ApiCamara = {
  async get(path) {
    const resposta = respostas[path]
    if (!resposta) throw new Error(`fixture sem resposta para ${path}`)
    return resposta
  },
}

function seedDoGolden(): CandidatoSeed[] {
  const seed = JSON.parse(readFileSync("data/candidatos.json", "utf8")) as CandidatoSeed[]
  const slugs = new Set<string>(golden.seed_slugs)
  const escolhidos = seed.filter((c) => slugs.has(c.slug))
  assert.equal(escolhidos.length, slugs.size, "todo slug do golden existe no seed")
  return escolhidos
}

function cpfPorSqDoGolden(): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const { sq, deputado_id } of golden.cpf_tse_igual_ao_da_camara) {
    const cpf = (respostas[`/deputados/${deputado_id}`].dados as { cpf: string }).cpf
    mapa.set(sq, cpf)
  }
  return mapa
}

async function coletarGolden() {
  return coletarRepresentacoesEtica({
    api: apiGravada,
    legislatura: golden.legislatura,
    seed: seedDoGolden(),
    cpfPorSq: cpfPorSqDoGolden(),
    agora: new Date(golden.agora),
    concorrencia: 2,
  })
}

describe("golden do coletor de representações", () => {
  it("bate 100% das expectativas lidas da tramitação crua", async () => {
    const fila = await coletarGolden()
    const falhas: string[] = []
    const conferir = (caso: string, campo: string, obtido: unknown, esperado: unknown) => {
      if (obtido !== esperado) falhas.push(`${caso} :: ${campo}: obtido ${String(obtido)}, esperado ${String(esperado)}`)
    }

    conferir("contagem", "total_representacoes", fila.total_representacoes, golden.total_representacoes)
    conferir("contagem", "itens", fila.itens.length, golden.itens.length)
    conferir("contagem", "alvos_nao_resolvidos", fila.alvos_nao_resolvidos.length, golden.alvos_nao_resolvidos)

    let acertos = 0
    let verificacoes = 0
    for (const esperado of golden.itens) {
      const item = fila.itens.find((i) => i.id === esperado.id)
      if (!item) {
        falhas.push(`${esperado.caso} :: item ${esperado.id} ausente`)
        verificacoes += 8
        continue
      }
      const pares: Array<[string, unknown, unknown]> = [
        ["slug", item.candidato.slug, esperado.slug],
        ["metodo_identidade", item.candidato.metodo_identidade, esperado.metodo_identidade],
        ["via_alvo", item.deputado.via_alvo, esperado.via_alvo],
        ["fase", item.fase_sugerida?.fase, esperado.fase],
        ["data_fase", item.fase_sugerida?.data, esperado.data_fase],
        ["ultimo_andamento", item.ultimo_andamento?.data, esperado.ultimo_andamento],
        ["url_oficial", item.representacao.url_oficial, esperado.url_oficial],
        ["status_revisao", item.status_revisao, "pendente"],
      ]
      for (const [campo, obtido, alvo] of pares) {
        verificacoes += 1
        if (obtido === alvo) acertos += 1
        conferir(esperado.caso, campo, obtido, alvo)
      }
    }
    for (const { caso, slug } of golden.sem_item) {
      verificacoes += 1
      if (!fila.itens.some((i) => i.candidato.slug === slug)) acertos += 1
      else falhas.push(`${caso} :: ${slug} recebeu item`)
    }
    for (const { caso, proposicao_id, deputado_id } of golden.alvos_sem_candidato_inclui) {
      verificacoes += 1
      const achou = fila.alvos_sem_candidato.some((a) => a.proposicao_id === proposicao_id && a.deputado_id === deputado_id)
      if (achou) acertos += 1
      else falhas.push(`${caso} :: alvo ${deputado_id} da REP ${proposicao_id} não listado`)
    }

    assert.deepEqual(falhas, [])
    assert.equal(acertos, verificacoes)
    console.log(`golden representacoes-etica: ${acertos}/${verificacoes} (100%)`)
  })

  it("não grava CPF em nenhum campo da fila", async () => {
    const fila = await coletarGolden()
    const texto = JSON.stringify(fila)
    for (const cpf of cpfPorSqDoGolden().values()) assert.ok(!texto.includes(cpf), "CPF vazou para a fila")
  })

  it("leva ao revisor o registro da votação que o Conselho fez na REP principal", async () => {
    const fila = await coletarGolden()
    const marcel = fila.itens.find((i) => i.id === "camara-rep-2563294-dep-156190")!
    const voto = marcel.despachos_para_revisao.find((d) => d.proposicao_id === 2563290 && d.data === "2026-05-05" && /Marcel van Hattem/.test(d.despacho))
    assert.ok(voto, "registro de 05/05/2026 da REP 24/2025 ausente")
    assert.match(voto.despacho, /suspensão temporária do exercício do mandato por 2 meses; 13 votos favoráveis e 4 contrários/)
  })

  it("todo item da fila nasce pendente de revisão", async () => {
    const fila = await coletarGolden()
    assert.ok(fila.itens.length > 0)
    assert.ok(fila.itens.every((i) => i.status_revisao === "pendente"))
  })
})

describe("alvo da representação", () => {
  it("recorta o trecho entre 'em desfavor' e o motivo", () => {
    assert.equal(
      trechoDoAlvo("Representação em desfavor do Senhor Deputado MARCEL VAN HATTEM por suposto procedimento incompatível."),
      "Senhor Deputado MARCEL VAN HATTEM",
    )
    assert.equal(
      trechoDoAlvo("Representação em desfavor do Senhor Deputado GILVAN DA FEDERAL, protocolizada em 7 de maio."),
      "Senhor Deputado GILVAN DA FEDERAL",
    )
  })

  const deputados: DeputadoLegislatura[] = [
    { id: 1, nome: "João Silva", nomeCivil: "JOÃO PEREIRA DA SILVA", cpf: null },
    { id: 2, nome: "João Silva", nomeCivil: "JOÃO SILVA SANTOS", cpf: null },
    { id: 3, nome: "Maria Souza", nomeCivil: "MARIA APARECIDA SOUZA", cpf: null },
  ]

  it("nome que aponta para dois ids vira ambiguidade, nunca palpite", () => {
    const r = resolverAlvos("Representação em desfavor do Senhor Deputado JOÃO SILVA por quebra de decoro.", indiceDeNomes(deputados))
    assert.deepEqual(r.resolvidos, [])
    assert.deepEqual(r.ambiguos, [{ nome: "JOAO SILVA", deputado_ids: [1, 2] }])
  })

  it("nome civil único resolve mesmo com nome parlamentar ambíguo", () => {
    const r = resolverAlvos("Representação em desfavor do Senhor Deputado JOÃO PEREIRA DA SILVA, protocolizada.", indiceDeNomes(deputados))
    assert.deepEqual(r.resolvidos.map((a) => [a.deputado_id, a.via]), [[1, "nome_civil"]])
    assert.deepEqual(r.ambiguos, [], "o casamento curto contido no longo é descartado")
  })

  it("nome de uma palavra que é pedaço do nome de outro deputado vira ambiguidade", () => {
    const comCurto: DeputadoLegislatura[] = [
      { id: 74283, nome: "Vicentinho", nomeCivil: "VICENTE PAULO DA SILVA", cpf: null },
      { id: 137070, nome: "Vicentinho Júnior", nomeCivil: "VICENTE ALVES DE OLIVEIRA JÚNIOR", cpf: null },
    ]
    const r = resolverAlvos("Representação em desfavor do Senhor Deputado VICENTINHO JR., protocolizada.", indiceDeNomes(comCurto))
    assert.deepEqual(r.resolvidos, [])
    assert.deepEqual(r.ambiguos, [{ nome: "VICENTINHO", deputado_ids: [74283, 137070] }])
    const inteiro = resolverAlvos("Representação em desfavor do Senhor Deputado VICENTINHO JÚNIOR, protocolizada.", indiceDeNomes(comCurto))
    assert.deepEqual(inteiro.resolvidos.map((a) => a.deputado_id), [137070])
  })

  it("não casa nome fora do conjunto fechado da legislatura", () => {
    const r = resolverAlvos("Representação em desfavor do Senhor Deputado FULANO DE TAL por quebra de decoro.", indiceDeNomes(deputados))
    assert.equal(r.resolvidos.length, 0)
  })
})

describe("vínculo deputado → candidato", () => {
  const seed: CandidatoSeed[] = [
    { slug: "a", nome_urna: "A", cargo_disputado: "Senador", estado: "RS", ids: { camara: 10, tse_sq_candidato: { "2026": "1" } } },
    { slug: "b", nome_urna: "B", cargo_disputado: "Senador", estado: "SP", ids: { camara: null, tse_sq_candidato: { "2026": "2" } } },
    { slug: "c", nome_urna: "C", cargo_disputado: "Senador", estado: "MG", ids: { camara: null, tse_sq_candidato: { "2026": "3" } } },
  ]
  // CPFs sintéticos válidos.
  const cpfA = "11144477735"
  const cpfB = "52998224725"

  it("usa o id do seed antes do CPF", () => {
    const indices = indicesDeCandidatos(seed, new Map([["1", cpfA]]))
    assert.deepEqual(vincularCandidato({ id: 10, nome: "A", nomeCivil: null, cpf: cpfA }, indices), { slug: "a", metodo: "seed_ids_camara" })
  })

  it("casa pelo CPF quando o seed não tem id da Câmara", () => {
    const indices = indicesDeCandidatos(seed, new Map([["2", cpfB]]))
    assert.deepEqual(vincularCandidato({ id: 20, nome: "B", nomeCivil: null, cpf: cpfB }, indices), { slug: "b", metodo: "cpf_tse_camara" })
  })

  it("recusa quando seed e CPF apontam candidatos diferentes", () => {
    const indices = indicesDeCandidatos(seed, new Map([["2", cpfA]]))
    assert.deepEqual(vincularCandidato({ id: 10, nome: "A", nomeCivil: null, cpf: cpfA }, indices), {
      slug: null,
      motivo: "conflito_seed_cpf",
    })
  })

  it("recusa quando o CPF do candidato no TSE difere do CPF do deputado do seed", () => {
    const indices = indicesDeCandidatos(seed, new Map([["1", cpfB]]))
    assert.deepEqual(vincularCandidato({ id: 10, nome: "A", nomeCivil: null, cpf: cpfA }, indices), {
      slug: null,
      motivo: "conflito_seed_cpf",
    })
  })

  it("usa o SQ do ano mais recente do seed para achar o CPF", () => {
    const comDoisAnos: CandidatoSeed[] = [
      { slug: "b", nome_urna: "B", cargo_disputado: "Senador", estado: "SP", ids: { camara: null, tse_sq_candidato: { "2022": "antigo", "2026": "novo" } } },
    ]
    const indices = indicesDeCandidatos(comDoisAnos, new Map([["antigo", cpfA], ["novo", cpfB]]))
    assert.deepEqual(vincularCandidato({ id: 20, nome: "B", nomeCivil: null, cpf: cpfB }, indices), { slug: "b", metodo: "cpf_tse_camara" })
    assert.deepEqual(vincularCandidato({ id: 21, nome: "B", nomeCivil: null, cpf: cpfA }, indices), { slug: null, motivo: "sem_candidato" })
  })

  it("recusa CPF presente em mais de um candidato", () => {
    const indices = indicesDeCandidatos(seed, new Map([["2", cpfB], ["3", cpfB]]))
    assert.deepEqual(vincularCandidato({ id: 20, nome: "B", nomeCivil: null, cpf: cpfB }, indices), {
      slug: null,
      motivo: "cpf_em_mais_de_um_candidato",
    })
  })

  it("nome igual sem id nem CPF não vincula", () => {
    const indices = indicesDeCandidatos(seed, new Map())
    assert.deepEqual(vincularCandidato({ id: 99, nome: "B", nomeCivil: "B", cpf: null }, indices), { slug: null, motivo: "sem_candidato" })
  })
})

describe("fronteira de disco do coletor", () => {
  it("o detalhe do deputado, que traz CPF, nunca vai para o cache", () => {
    assert.equal(cachePodeGuardar("/deputados/156190"), false)
    assert.equal(cachePodeGuardar("/deputados/156190?formato=json"), false)
    assert.equal(cachePodeGuardar("/deputados?idLegislatura=57&itens=100"), true)
    assert.equal(cachePodeGuardar("/proposicoes/2563294/tramitacoes"), true)
  })

  it("fila e cache não podem cair dentro de nenhum checkout git", () => {
    assert.equal(dentroDeCheckoutGit("tests/fixtures/nao-existe/fila.json"), true)
    assert.equal(dentroDeCheckoutGit(join(tmpdir(), "puxa-ficha-rep-teste", "fila.json")), false)
  })
})
