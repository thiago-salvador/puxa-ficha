import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  entradaDaRevisao,
  validarRevisaoManual
} from "../scripts/registrar-revisao-curadoria"

const base = [
  "--slug=fulano",
  "--frente=contradicoes",
  "--data=2026-08-05",
  "--resultado=sem_achado_no_escopo",
  "--detalhe=órgãos: Câmara; jurisdição: nacional; período: até 2026-08-05; termos: nome completo + cargo + UF",
  "--identidade=cargo-e-uf",
  "--identidade-url=https://example.org/perfil-oficial",
  "--url=https://example.org/perfil-oficial",
  "--url=https://example.org/busca"
]

const bloqueioSemUrl = [
  "--slug=fulano",
  "--frente=processos",
  "--data=2026-08-05",
  "--resultado=indeterminado",
  "--detalhe=motivo: nenhuma identidade oficial compatível foi localizada; fontes consultadas: TSE; anos consultados: 2016, 2018, 2020, 2022, 2024, 2026",
  "--identidade=nao-confirmada",
  "--dry-run",
]

describe("registrar revisão manual valida procedência antes de escrever", () => {
  it("recusa revisão sem fonte", () => {
    assert.throws(
      () => validarRevisaoManual(base.filter((arg) => !arg.startsWith("--url="))),
      /--url exige ao menos uma fonte não vazia/
    )
  })

  it("recusa slug com sintaxe inválida", () => {
    const args = base.map((arg) => arg === "--slug=fulano" ? "--slug=Nome Completo" : arg)
    assert.throws(() => validarRevisaoManual(args), /--slug inválido/)
  })

  it("recusa encontrado sem evidência publicável", () => {
    const args = base
      .map((arg) => arg === "--resultado=sem_achado_no_escopo" ? "--resultado=encontrado" : arg)
    assert.throws(() => validarRevisaoManual(args), /--evidencia-publicavel/)
  })

  it("recusa nome sozinho como prova de identidade", () => {
    const args = base.map((arg) => arg === "--identidade=cargo-e-uf" ? "--identidade=nome" : arg)
    assert.throws(() => validarRevisaoManual(args), /nome sozinho não prova identidade/)
  })

  it("aceita identidade nao-confirmada somente como indeterminado auditável", () => {
    const revisao = validarRevisaoManual(bloqueioSemUrl)
    assert.equal(revisao.resultado, "indeterminado")
    assert.equal(revisao.identidade, "nao-confirmada")
    assert.deepEqual(revisao.urls, [])
    assert.deepEqual(revisao.identidadeUrls, [])
    assert.equal(entradaDaRevisao(revisao).url, undefined)
  })

  it("recusa identidade nao-confirmada para resultado encontrado", () => {
    const args = bloqueioSemUrl.map((arg) =>
      arg === "--resultado=indeterminado" ? "--resultado=encontrado" : arg
    )
    assert.throws(() => validarRevisaoManual(args), /só é permitida para --resultado=indeterminado/)
  })

  it("recusa identidade nao-confirmada sem motivo concreto", () => {
    const args = bloqueioSemUrl.map((arg) =>
      arg.startsWith("--detalhe=")
        ? "--detalhe=motivo: falhou; fontes consultadas: TSE; anos consultados: 2026"
        : arg
    )
    assert.throws(() => validarRevisaoManual(args), /exige motivo concreto/)
  })

  it("sem URL exige fontes e anos consultados no detalhe", () => {
    const args = bloqueioSemUrl.map((arg) =>
      arg.startsWith("--detalhe=")
        ? "--detalhe=motivo: nenhuma identidade oficial compatível foi localizada"
        : arg
    )
    assert.throws(() => validarRevisaoManual(args), /sem URL de identidade exige fontes consultadas e anos consultados/)
  })

  it("URL de busca não substitui fontes e anos da tentativa de identidade", () => {
    const args = [
      ...bloqueioSemUrl.map((arg) =>
        arg.startsWith("--detalhe=")
          ? "--detalhe=motivo: nenhuma identidade oficial compatível foi localizada"
          : arg
      ),
      "--url=https://comunicaapi.pje.jus.br/api/v1/comunicacao?nomeParte=Fulano",
    ]
    assert.throws(() => validarRevisaoManual(args), /sem URL de identidade exige fontes consultadas e anos consultados/)
  })

  it("preserva URLs de tentativas oficiais sem tratá-las como prova confirmada", () => {
    const args = [
      ...bloqueioSemUrl.map((arg) =>
        arg.startsWith("--detalhe=")
          ? "--detalhe=motivo: perfil oficial consultado pertence a homônimo de outra UF"
          : arg
      ),
      "--url=https://www.tse.jus.br/eleicoes/candidatos",
      "--identidade-url=https://www.tse.jus.br/eleicoes/candidatos",
    ]
    const revisao = validarRevisaoManual(args)
    assert.equal(revisao.identidade, "nao-confirmada")
    assert.deepEqual(revisao.identidadeUrls, ["https://www.tse.jus.br/eleicoes/candidatos"])
  })

  it("recusa CPF no detalhe antes de qualquer saída", () => {
    const args = base.map((arg) =>
      arg.startsWith("--detalhe=") ? "--detalhe=CPF consultado" : arg
    )
    assert.throws(() => validarRevisaoManual(args), /não pode conter CPF/)
  })

  it("recusa ausência comprovada para contradições", () => {
    const args = base.map((arg) =>
      arg === "--resultado=sem_achado_no_escopo" ? "--resultado=vazio_confirmado" : arg
    )
    assert.throws(() => validarRevisaoManual(args), /não aceita ausência comprovada/)
  })

  it("processo vazio exige escopo estruturado no detalhe", () => {
    const args = base.map((arg) => {
      if (arg === "--frente=contradicoes") return "--frente=processos"
      if (arg === "--resultado=sem_achado_no_escopo") return "--resultado=vazio_confirmado"
      if (arg.startsWith("--detalhe=")) return "--detalhe=busca completa"
      return arg
    })
    assert.throws(() => validarRevisaoManual(args), /escopo real no detalhe/)
  })

  it("dry-run é padrão e a entrada usa a fonte de curadoria", () => {
    const revisao = validarRevisaoManual(base)
    assert.equal(revisao.apply, false)
    assert.deepEqual(entradaDaRevisao(revisao), {
      fonte: "contradicoes-curadoria",
      alvo: "fulano",
      resultado: "sem_achado_no_escopo",
      volume: 0,
      detalhe:
        "revisao_em=2026-08-05; identidade=cargo-e-uf; identidade_urls=https://example.org/perfil-oficial; urls_consultadas=https://example.org/perfil-oficial,https://example.org/busca; detalhe=órgãos: Câmara; jurisdição: nacional; período: até 2026-08-05; termos: nome completo + cargo + UF",
      url: "https://example.org/perfil-oficial"
    })
  })

  it("encontrado exige e preserva evidência publicável consultada", () => {
    const args = [
      ...base.map((arg) =>
        arg === "--resultado=sem_achado_no_escopo" ? "--resultado=encontrado" : arg
      ),
      "--evidencia-publicavel=https://example.org/busca"
    ]
    const entrada = entradaDaRevisao(validarRevisaoManual(args))
    assert.equal(entrada.resultado, "encontrado")
    assert.equal(entrada.volume, 1)
  })
})
