import test, { describe, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  __restaurarPortasDeVotos,
  __usarPortasDeVotosParaTeste,
  ingestVotos,
} from "../scripts/lib/ingest-camara"

/**
 * Modos de FALHA do matching de votos.
 *
 * Estes casos existem porque nenhum deles é exercitado por acaso: numa execução
 * feliz a rede responde, o banco aceita e a lista de votos vem cheia. Foi
 * justamente na borda que o caminho antigo errava, engolindo exceção com
 * `catch {}` e seguindo como se tivesse dado certo, e foi assim que 100 pares
 * errados ficaram publicados enquanto a execução dizia sucesso.
 *
 * A régua de todos: falha tem que virar linha em `erros`, e nunca contar como
 * voto persistido.
 */

const VOTACAO_OK = {
  id: "vk-1",
  titulo: "Vaquejada e práticas desportivas com animais (2º turno)",
  votacao_id_api: "2123843-93",
}
const DESCRICAO_MERITO =
  "Aprovada, em segundo turno, a Proposta de Emenda à Constituição n° 304, de 2017. Sim: 373; não: 50; abstenção: 6; Total: 429."

const ID_DEPUTADO = 178938

function votosCom(idDeputado: number, tipoVoto: string) {
  return [{ deputado_: { id: idDeputado }, tipoVoto }]
}

afterEach(() => {
  __restaurarPortasDeVotos()
})

describe("matching de votos: caminho feliz (item 7)", () => {
  test("conta só o que o banco confirmou", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => ({ descricao: DESCRICAO_MERITO }),
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Sim"),
      gravarVoto: async () => ({ error: null }),
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 1)
    assert.deepEqual(r.erros, [])
  })

  test("deputado ausente da votação não é erro nem voto", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => ({ descricao: DESCRICAO_MERITO }),
      buscarVotosDaVotacao: async () => votosCom(999999, "Sim"),
      gravarVoto: async () => ({ error: null }),
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 0)
    assert.deepEqual(r.erros, [], "não votar é fato, não falha")
  })
})

describe("matching de votos: falhas viram erro, nunca sucesso silencioso", () => {
  test("erro no select de votacoes_chave sobe como erro", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: null, error: { message: "connection reset" } }),
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 0)
    assert.equal(r.erros.length, 1)
    assert.match(r.erros[0], /select de votacoes_chave falhou.*connection reset/)
  })

  /**
   * O erro de banco não pode ser cacheado: congelar "zero votações" faria todo
   * candidato seguinte da mesma execução sair sem voto, em silêncio.
   */
  test("erro no select não é cacheado como lista vazia", async () => {
    let chamadas = 0
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => {
        chamadas++
        return chamadas === 1
          ? { data: null, error: { message: "timeout" } }
          : { data: [VOTACAO_OK], error: null }
      },
      buscarDetalheDaVotacao: async () => ({ descricao: DESCRICAO_MERITO }),
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Sim"),
      gravarVoto: async () => ({ error: null }),
    })

    const primeiro = await ingestVotos(ID_DEPUTADO, "cand-1", "a")
    assert.equal(primeiro.persistidos, 0)

    const segundo = await ingestVotos(ID_DEPUTADO, "cand-2", "b")
    assert.equal(segundo.persistidos, 1, "a segunda chamada tem de tentar de novo")
    assert.equal(chamadas, 2)
  })

  test("falha no detalhe da votação sobe como erro e não engole a votação", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => {
        throw new Error("HTTP 503")
      },
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 0)
    assert.match(r.erros[0], /detalhe da votacao 2123843-93.*HTTP 503/)
  })

  test("descrição ausente com 200 é indeterminado, não aceitação", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => ({}),
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 0)
    assert.match(r.erros[0], /sem descricao oficial/)
  })

  /**
   * O caso da denúncia contra Temer, `2143164-138`: HTTP 200 com `dados: []`.
   * A votação existe e o placar está na descrição, mas a fonte não publicou o
   * voto individual. Tratar como sucesso gravaria "ninguém votou".
   */
  test("lista de votos vazia com 200 é erro, nunca sucesso", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({
        data: [{ id: "vk-temer", titulo: "Denúncia contra Temer", votacao_id_api: "2143164-138" }],
        error: null,
      }),
      buscarDetalheDaVotacao: async () => ({
        descricao:
          "Aprovado o Parecer da Comissão de Constituição e Justiça e de Cidadania que conclui pelo indeferimento da solicitação de autorização",
      }),
      buscarVotosDaVotacao: async () => [],
      gravarVoto: async () => {
        throw new Error("não pode gravar quando a lista veio vazia")
      },
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 0)
    assert.equal(r.erros.length, 1)
    assert.match(r.erros[0], /lista de votos VAZIA.*indeterminado/)
  })

  /**
   * Falha transitória no detalhe. O caminho anterior cacheava o carregamento
   * mesmo degradado, então um 503 na primeira ficha congelava a lista PARCIAL
   * para todos os candidatos seguintes: a votação que caiu virava "não existe"
   * nas outras 58, em silêncio.
   */
  test("503 no detalhe não congela a lista parcial: a chamada seguinte tenta de novo", async () => {
    let tentativasDeDetalhe = 0
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => {
        tentativasDeDetalhe++
        if (tentativasDeDetalhe === 1) throw new Error("HTTP 503")
        return { descricao: DESCRICAO_MERITO }
      },
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Sim"),
      gravarVoto: async () => ({ error: null }),
    })

    const primeiro = await ingestVotos(ID_DEPUTADO, "cand-1", "primeira-ficha")
    assert.equal(primeiro.persistidos, 0)
    assert.equal(primeiro.erros.length, 1)
    assert.match(primeiro.erros[0], /detalhe da votacao 2123843-93.*HTTP 503/)

    const segundo = await ingestVotos(ID_DEPUTADO, "cand-2", "segunda-ficha")
    assert.equal(tentativasDeDetalhe, 2, "a segunda ficha tem de refazer o detalhe, não ler cache")
    assert.equal(segundo.persistidos, 1, "com o detalhe válido, o voto persiste")
    assert.deepEqual(segundo.erros, [])
  })

  test("carregamento parcial nunca entra no cache", async () => {
    let selects = 0
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => {
        selects++
        return {
          data: [{ id: "vk-ruim", titulo: "Ruim", votacao_id_api: "111-1" }, VOTACAO_OK],
          error: null,
        }
      },
      buscarDetalheDaVotacao: async (id) =>
        id === "111-1" ? Promise.reject(new Error("HTTP 503")) : { descricao: DESCRICAO_MERITO },
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Sim"),
      gravarVoto: async () => ({ error: null }),
    })

    const primeiro = await ingestVotos(ID_DEPUTADO, "cand-1", "a")
    // Continuidade dentro da chamada: a votação boa casou apesar da ruim.
    assert.equal(primeiro.persistidos, 1)
    assert.equal(primeiro.erros.length, 1)

    await ingestVotos(ID_DEPUTADO, "cand-2", "b")
    assert.equal(selects, 2, "carregamento degradado não pode ter sido cacheado")
  })

  test("carregamento íntegro entra no cache uma vez só", async () => {
    let selects = 0
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => {
        selects++
        return { data: [VOTACAO_OK], error: null }
      },
      buscarDetalheDaVotacao: async () => ({ descricao: DESCRICAO_MERITO }),
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Sim"),
      gravarVoto: async () => ({ error: null }),
    })

    await ingestVotos(ID_DEPUTADO, "cand-1", "a")
    await ingestVotos(ID_DEPUTADO, "cand-2", "b")
    assert.equal(selects, 1, "sem erro, o cache tem de evitar o segundo select")
  })

  test("falha de rede em /votos não vira mapa vazio nem cache vazio", async () => {
    let chamadas = 0
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => ({ descricao: DESCRICAO_MERITO }),
      buscarVotosDaVotacao: async () => {
        chamadas++
        if (chamadas === 1) throw new Error("ECONNRESET")
        return votosCom(ID_DEPUTADO, "Sim")
      },
      gravarVoto: async () => ({ error: null }),
    })

    const primeiro = await ingestVotos(ID_DEPUTADO, "cand-1", "a")
    assert.equal(primeiro.persistidos, 0)
    assert.match(primeiro.erros[0], /lista de votos da votacao 2123843-93.*ECONNRESET/)

    const segundo = await ingestVotos(ID_DEPUTADO, "cand-2", "b")
    assert.equal(segundo.persistidos, 1, "falha não pode ter virado cache de lista vazia")
  })

  test("upsert recusado não conta como voto e sobe como erro", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => ({ descricao: DESCRICAO_MERITO }),
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Sim"),
      gravarVoto: async () => ({ error: { message: "violates foreign key" } }),
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 0, "contar tentativa faria o relatório dizer que gravou o recusado")
    assert.match(r.erros[0], /upsert do voto na votacao 2123843-93 recusado.*foreign key/)
  })

  test("votação procedimental é recusa de curadoria, não falha operacional", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({
        data: [{ id: "vk-fake", titulo: "PL das Fake News", votacao_id_api: "2310837-8" }],
        error: null,
      }),
      buscarDetalheDaVotacao: async () => ({
        descricao: "Aprovado o Requerimento de Urgência (Art. 154 do RICD). Sim: 238; não: 192;",
      }),
      buscarVotosDaVotacao: async () => {
        throw new Error("não pode chegar aqui: procedimental é recusada antes")
      },
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 0)
    assert.deepEqual(r.erros, [])
    assert.match(r.avisos[0], /PROCEDIMENTAL na fonte e foi recusada/)
  })

  test("uma votação quebrada não impede as outras de casar", async () => {
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({
        data: [
          { id: "vk-quebrada", titulo: "Quebrada", votacao_id_api: "999-1" },
          VOTACAO_OK,
        ],
        error: null,
      }),
      buscarDetalheDaVotacao: async (id) =>
        id === "999-1" ? Promise.reject(new Error("HTTP 500")) : { descricao: DESCRICAO_MERITO },
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Não"),
      gravarVoto: async () => ({ error: null }),
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 1)
    assert.equal(r.erros.length, 1)
    assert.match(r.erros[0], /999-1/)
  })
})
