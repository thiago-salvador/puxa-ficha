import test, { afterEach, describe } from "node:test"
import assert from "node:assert/strict"
import {
  __restaurarPortasDeVotosSenado,
  __usarPortasDeVotosSenadoParaTeste,
  ingestVotos,
} from "../scripts/lib/ingest-senado"

const CHAVE = {
  id: "vk-senado-1",
  titulo: "Reforma da Previdência",
  fonte: "senado",
  votacao_id_api: "6046",
}

afterEach(() => {
  __restaurarPortasDeVotosSenado()
})

describe("Senado: matching por votação exata", () => {
  test("casa somente o CodigoSessaoVotacao selecionado, nunca outra rodada da matéria", async () => {
    const gravadas: Array<Record<string, unknown>> = []
    __usarPortasDeVotosSenadoParaTeste({
      selecionarVotacoesChave: async () => ({ data: [CHAVE], error: null }),
      buscarVotacoesDoParlamentar: async () => [
        {
          CodigoSessaoVotacao: "6045",
          Materia: { Codigo: "137999" },
          SiglaDescricaoVoto: "Não",
        },
        {
          CodigoSessaoVotacao: "6046",
          Materia: { Codigo: "137999" },
          SiglaDescricaoVoto: "Sim",
        },
        {
          CodigoSessaoVotacao: "6047",
          Materia: { Codigo: "137999" },
          SiglaDescricaoVoto: "Não",
        },
      ],
      gravarVoto: async (linha) => {
        gravadas.push(linha)
        return { error: null }
      },
    })

    const resultado = await ingestVotos(5894, "cand-1", "flavio-bolsonaro")
    assert.equal(resultado.persistidos, 1)
    assert.deepEqual(resultado.erros, [])
    assert.deepEqual(gravadas, [
      { candidato_id: "cand-1", votacao_id: "vk-senado-1", voto: "sim" },
    ])
  })

  test("linha sem chave exata vira erro explícito e não recua para proposição", async () => {
    let buscouFonte = false
    __usarPortasDeVotosSenadoParaTeste({
      selecionarVotacoesChave: async () => ({
        data: [
          {
            id: "legada",
            titulo: "Linha legada",
            fonte: null,
            votacao_id_api: null,
            proposicao_id: "137999",
          },
        ],
        error: null,
      }),
      buscarVotacoesDoParlamentar: async () => {
        buscouFonte = true
        return []
      },
    })

    const resultado = await ingestVotos(5894, "cand-1", "flavio-bolsonaro")
    assert.equal(resultado.persistidos, 0)
    assert.equal(buscouFonte, false)
    assert.match(resultado.erros[0], /matching por proposicao foi recusado/)
  })

  test("Votou em escrutínio secreto nunca é promovido a sim", async () => {
    let gravou = false
    __usarPortasDeVotosSenadoParaTeste({
      selecionarVotacoesChave: async () => ({
        data: [{ ...CHAVE, titulo: "Indicação ao CNJ", votacao_id_api: "6809" }],
        error: null,
      }),
      buscarVotacoesDoParlamentar: async () => [
        { CodigoSessaoVotacao: "6809", SiglaDescricaoVoto: "Votou" },
      ],
      gravarVoto: async () => {
        gravou = true
        return { error: null }
      },
    })

    const resultado = await ingestVotos(5207, "cand-renan", "renan-filho")
    assert.equal(resultado.persistidos, 0)
    assert.equal(gravou, false)
    assert.match(resultado.erros[0], /não publica polaridade individual|nao publica polaridade individual/)
  })

  test("presença sem voto e ausência não fabricam voto ausente", async () => {
    const gravadas: Array<Record<string, unknown>> = []
    __usarPortasDeVotosSenadoParaTeste({
      selecionarVotacoesChave: async () => ({ data: [CHAVE], error: null }),
      buscarVotacoesDoParlamentar: async () => [
        { CodigoSessaoVotacao: "6046", SiglaDescricaoVoto: "P-NRV" },
      ],
      gravarVoto: async (linha) => {
        gravadas.push(linha)
        return { error: null }
      },
    })

    const resultado = await ingestVotos(5894, "cand-1", "flavio-bolsonaro")
    assert.deepEqual(resultado, { persistidos: 0, erros: [] })
    assert.deepEqual(gravadas, [])
  })
})

describe("Senado: falhas são fail-closed", () => {
  test("erro de select não vira conjunto vazio", async () => {
    __usarPortasDeVotosSenadoParaTeste({
      selecionarVotacoesChave: async () => ({
        data: null,
        error: { message: "connection reset" },
      }),
    })

    const resultado = await ingestVotos(5894, "cand-1", "flavio-bolsonaro")
    assert.equal(resultado.persistidos, 0)
    assert.match(resultado.erros[0], /select de votacoes_chave do Senado falhou.*connection reset/)
  })

  test("falha da fonte oficial sobe como erro", async () => {
    __usarPortasDeVotosSenadoParaTeste({
      selecionarVotacoesChave: async () => ({ data: [CHAVE], error: null }),
      buscarVotacoesDoParlamentar: async () => {
        throw new Error("HTTP 503")
      },
    })

    const resultado = await ingestVotos(5894, "cand-1", "flavio-bolsonaro")
    assert.equal(resultado.persistidos, 0)
    assert.match(resultado.erros[0], /lista oficial.*HTTP 503/)
  })

  test("evento duplicado no payload é ambíguo e só a primeira linha pode persistir", async () => {
    let gravadas = 0
    __usarPortasDeVotosSenadoParaTeste({
      selecionarVotacoesChave: async () => ({ data: [CHAVE], error: null }),
      buscarVotacoesDoParlamentar: async () => [
        { CodigoSessaoVotacao: "6046", SiglaDescricaoVoto: "Sim" },
        { CodigoSessaoVotacao: "6046", SiglaDescricaoVoto: "Não" },
      ],
      gravarVoto: async () => {
        gravadas++
        return { error: null }
      },
    })

    const resultado = await ingestVotos(5894, "cand-1", "flavio-bolsonaro")
    assert.equal(gravadas, 1)
    assert.equal(resultado.persistidos, 1)
    assert.match(resultado.erros[0], /apareceu mais de uma vez.*ambiguo recusado/)
  })

  test("upsert recusado não conta como persistido", async () => {
    __usarPortasDeVotosSenadoParaTeste({
      selecionarVotacoesChave: async () => ({ data: [CHAVE], error: null }),
      buscarVotacoesDoParlamentar: async () => [
        { CodigoSessaoVotacao: "6046", SiglaDescricaoVoto: "Sim" },
      ],
      gravarVoto: async () => ({ error: { message: "violates foreign key" } }),
    })

    const resultado = await ingestVotos(5894, "cand-1", "flavio-bolsonaro")
    assert.equal(resultado.persistidos, 0)
    assert.match(resultado.erros[0], /upsert.*recusado.*foreign key/)
  })
})
