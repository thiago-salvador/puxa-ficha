import test, { describe, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  __restaurarPortasDeVotos,
  __usarPortasDeVotosParaTeste,
  carregarVotacoesChaveCamara,
  ingestVotos,
  parseVoto,
} from "../scripts/lib/ingest-camara"
import { __resetarDryRunParaTeste, ativarDryRun, relatorioDryRun } from "../scripts/lib/dry-run"

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
  casa: "Câmara",
  fonte: "camara",
  data_votacao: "2020-01-01",
  proposicao_id: "2123843",
}
const DESCRICAO_MERITO =
  "Aprovada, em segundo turno, a Proposta de Emenda à Constituição n° 304, de 2017. Sim: 373; não: 50; abstenção: 6; Total: 429."

const ID_DEPUTADO = 178938

function votosCom(idDeputado: number, tipoVoto: string) {
  return [{ deputado_: { id: idDeputado }, tipoVoto }]
}

afterEach(() => {
  __restaurarPortasDeVotos()
  __resetarDryRunParaTeste()
})

describe("matching de votos: caminho feliz (item 7)", () => {
  test("dry-run planeja o upsert do voto sem chamar a porta de escrita", async () => {
    let attemptedDatabaseWrite = false
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async (_id, onRevision) => {
        onRevision?.({ url: "https://example.test/detail", sha256: "b".repeat(64) })
        return { descricao: DESCRICAO_MERITO }
      },
      buscarVotosDaVotacao: async (_id, onRevision) => {
        onRevision?.({ url: "https://example.test/votes", sha256: "c".repeat(64) })
        return votosCom(ID_DEPUTADO, "Sim")
      },
      gravarVoto: async () => {
        attemptedDatabaseWrite = true
        return { error: null }
      },
    })
    ativarDryRun()

    const result = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    const report = relatorioDryRun()
    assert.equal(attemptedDatabaseWrite, false)
    assert.equal(result.persistidos, 0)
    assert.equal(result.planejados, 1)
    assert.equal(report.porTabela.votos_candidato.upsert, 1)
    assert.equal(report.bloqueios.length, 0)
  })

  test("sincroniza a data oficial somente quando o ID de evento coincide", async () => {
    const updates: unknown[] = []
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [{ ...VOTACAO_OK, data_votacao: "2019-12-31" }], error: null }),
      buscarDetalheDaVotacao: async () => ({ id: "2123843-93", data: "2020-01-01", descricao: DESCRICAO_MERITO }),
      atualizarDataOficial: async (input) => { updates.push(input); return { atualizada: true, error: null } },
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Sim"),
      gravarVoto: async () => ({ error: null }),
    })
    const result = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(result.erros.length, 0)
    assert.deepEqual(updates, [{ id: "vk-1", votacaoIdApi: "2123843-93", data: "2020-01-01", dataAnterior: "2019-12-31", casaAnterior: "Câmara", fonteAnterior: "camara", proposicaoIdOficial: null, proposicaoIdAnterior: "2123843" }])
    assert.equal((await carregarVotacoesChaveCamara()).votacoes[0]?.dataVotacao, "2020-01-01")
  })

  test("reconcilia data e proposição afetada pelo detalhe do evento 2357053-47", async () => {
    const updates: unknown[] = []
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [{ ...VOTACAO_OK, votacao_id_api: "2357053-47", proposicao_id: "2362699", data_votacao: "2023-05-23" }], error: null }),
      buscarDetalheDaVotacao: async () => ({
        id: "2357053-47", data: "2023-05-23", descricao: DESCRICAO_MERITO,
        proposicoesAfetadas: [{ id: 2357053 }],
      }),
      atualizarDataOficial: async (input) => { updates.push(input); return { atualizada: true, error: null } },
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Sim"),
      gravarVoto: async () => ({ error: null }),
    })
    const result = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(result.erros.length, 0)
    assert.deepEqual(updates, [{
      id: "vk-1", votacaoIdApi: "2357053-47", data: "2023-05-23", dataAnterior: "2023-05-23",
      casaAnterior: "Câmara", fonteAnterior: "camara", proposicaoIdOficial: "2357053", proposicaoIdAnterior: "2362699",
    }])
  })

  test("preserva proposição anterior em evento multi-proposição somente se ela estiver na lista oficial", async () => {
    let updateAttempted = false
    let votesAttempted = false
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [{ ...VOTACAO_OK, proposicao_id: "3" }], error: null }),
      buscarDetalheDaVotacao: async () => ({
        id: VOTACAO_OK.votacao_id_api, data: VOTACAO_OK.data_votacao, descricao: DESCRICAO_MERITO,
        proposicoesAfetadas: [{ id: 1 }, { id: 2 }],
      }),
      atualizarDataOficial: async () => { updateAttempted = true; return { atualizada: true, error: null } },
      buscarVotosDaVotacao: async () => { votesAttempted = true; return votosCom(ID_DEPUTADO, "Sim") },
      gravarVoto: async () => ({ error: null }),
    })
    const result = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(updateAttempted, false)
    assert.equal(votesAttempted, false)
    assert.match(result.erros[0]!, /múltiplas proposições/)
  })

  test("aceita evento multi-proposição quando o ID persistido está entre os IDs oficiais", async () => {
    let votesAttempted = false
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [{ ...VOTACAO_OK, proposicao_id: "2" }], error: null }),
      buscarDetalheDaVotacao: async () => ({
        id: VOTACAO_OK.votacao_id_api, data: VOTACAO_OK.data_votacao, descricao: DESCRICAO_MERITO,
        proposicoesAfetadas: [{ id: 1 }, { id: 2 }],
      }),
      buscarVotosDaVotacao: async () => { votesAttempted = true; return votosCom(ID_DEPUTADO, "Sim") },
      gravarVoto: async () => ({ error: null }),
    })
    const result = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(votesAttempted, true)
    assert.equal(result.erros.length, 0)
  })

  test("recusa a data quando o detalhe devolve outro evento", async () => {
    let attemptedUpdate = false
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => ({ id: "outro-evento", data: "2020-01-01", descricao: DESCRICAO_MERITO }),
      atualizarDataOficial: async () => { attemptedUpdate = true; return { atualizada: true, error: null } },
    })
    const result = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(attemptedUpdate, false)
    assert.match(result.erros[0]!, /devolveu id outro-evento/)
  })

  test("normaliza Artigo 17 sem confundir com ausência", () => {
    assert.equal(parseVoto("Artigo 17"), "artigo_17")
    assert.equal(parseVoto("valor futuro da Câmara"), null)
    assert.equal(parseVoto("Simbólico"), null, "substring conhecida não pode furar o fail-closed")
  })

  test("persiste Artigo 17 como categoria própria", async () => {
    const gravados: string[] = []
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => ({ descricao: DESCRICAO_MERITO }),
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Artigo 17"),
      gravarVoto: async (linha) => {
        gravados.push(linha.voto)
        return { error: null }
      },
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 1)
    assert.deepEqual(gravados, ["artigo_17"])
    assert.deepEqual(r.erros, [])
  })

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
  test("tipoVoto desconhecido põe o par em revisão e não grava", async () => {
    let tentouGravar = false
    __usarPortasDeVotosParaTeste({
      selecionarVotacoesChave: async () => ({ data: [VOTACAO_OK], error: null }),
      buscarDetalheDaVotacao: async () => ({ descricao: DESCRICAO_MERITO }),
      buscarVotosDaVotacao: async () => votosCom(ID_DEPUTADO, "Valor novo"),
      gravarVoto: async () => {
        tentouGravar = true
        return { error: null }
      },
    })

    const r = await ingestVotos(ID_DEPUTADO, "cand-1", "cabo-daciolo")
    assert.equal(r.persistidos, 0)
    assert.equal(tentouGravar, false)
    assert.match(r.erros[0], /tipoVoto desconhecido "Valor novo".*par enviado para revisao/)
  })

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
