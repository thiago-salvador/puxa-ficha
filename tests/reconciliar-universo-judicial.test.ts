import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { reconciliarUniversoJudicial } from "../scripts/audit/reconciliar-universo-judicial"

const fonte = {
  url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=1",
  titulo: "Comunica PJe",
  consultado_em: "2026-08-05T00:00:00Z",
}

describe("reconciliarUniversoJudicial", () => {
  it("classifica o universo inteiro com precedencia para processo positivo", () => {
    const resultado = reconciliarUniversoJudicial({
      slugsPublicos: ["positivo-atual", "positivo-curado", "vazio", "bloqueado"],
      processosAtuais: [{ slug: "positivo-atual", numero_processo: null }],
      candidatosCuradoria: [
        { slug: "positivo-curado", classificacao: "encontrado" },
        { slug: "vazio", classificacao: "vazio_confirmado" },
        { slug: "bloqueado", classificacao: "bloqueado" },
      ],
      itensRevisao: [
        {
          slug: "positivo-curado",
          numero_cnj: "7000047-10.2021.8.22.0007",
          decisao: "publicar",
          identidade_confirmada: true,
          fontes_oficiais: [fonte],
        },
      ],
      retries: [],
      esperadoProcessos: 1,
      esperadoFichas: 1,
    })

    assert.deepEqual(resultado.desfechos_depois_revisao, {
      positivo: 2,
      ausencia_confirmada: 1,
      erro: 0,
      bloqueio_editorial: 1,
    })
    assert.equal(resultado.cobertura.fichas_sem_desfecho, 0)
  })

  it("nao converte erro de transporte em ausencia", () => {
    const resultado = reconciliarUniversoJudicial({
      slugsPublicos: ["falha"],
      processosAtuais: [],
      candidatosCuradoria: [{ slug: "falha", classificacao: "bloqueado" }],
      itensRevisao: [],
      retries: [{ slug: "falha", resultado: "erro", url_busca: "https://dje.cnj.jus.br/api/v1/comunicacao" }],
      esperadoProcessos: 0,
      esperadoFichas: 0,
    })

    assert.deepEqual(resultado.desfechos_depois_revisao, {
      positivo: 0,
      ausencia_confirmada: 0,
      erro: 1,
      bloqueio_editorial: 0,
    })
  })

  it("recusa identidade, fonte, CNJ ou dedupe incompletos", () => {
    assert.throws(
      () =>
        reconciliarUniversoJudicial({
          slugsPublicos: ["candidato"],
          processosAtuais: [],
          candidatosCuradoria: [{ slug: "candidato", classificacao: "encontrado" }],
          itensRevisao: [
            {
              slug: "candidato",
              numero_cnj: "7000047-10.2021.8.22.0007",
              decisao: "publicar",
              identidade_confirmada: false,
              fontes_oficiais: [fonte],
            },
          ],
          retries: [],
          esperadoProcessos: 1,
          esperadoFichas: 1,
        }),
      /identidade nao confirmada/,
    )

    assert.throws(
      () =>
        reconciliarUniversoJudicial({
          slugsPublicos: ["candidato"],
          processosAtuais: [],
          candidatosCuradoria: [{ slug: "candidato", classificacao: "encontrado" }],
          itensRevisao: [
            {
              slug: "candidato",
              numero_cnj: "7000047-10.2021.8.22.0007",
              decisao: "publicar",
              identidade_confirmada: true,
              fontes_oficiais: [],
            },
          ],
          retries: [],
          esperadoProcessos: 1,
          esperadoFichas: 1,
        }),
      /fonte oficial ausente/,
    )
  })

  it("explicita divergencias de contagem e bloqueia a migration", () => {
    const resultado = reconciliarUniversoJudicial({
      slugsPublicos: ["um", "dois"],
      processosAtuais: [],
      candidatosCuradoria: [
        { slug: "um", classificacao: "encontrado" },
        { slug: "dois", classificacao: "encontrado" },
      ],
      itensRevisao: [
        {
          slug: "um",
          numero_cnj: "7000047-10.2021.8.22.0007",
          decisao: "publicar",
          identidade_confirmada: true,
          fontes_oficiais: [fonte],
        },
        {
          slug: "dois",
          numero_cnj: "7000071-67.2023.8.22.0007",
          decisao: "ponto_atencao",
          identidade_confirmada: true,
          fontes_oficiais: [fonte],
        },
      ],
      retries: [],
      esperadoProcessos: 1,
      esperadoFichas: 1,
    })

    assert.equal(resultado.migration.pronta, false)
    assert.deepEqual(resultado.migration.divergencias, [
      "processos: evidencia aprovada=2, matriz=1",
      "fichas: evidencia aprovada=2, matriz=1",
    ])
  })
})
