import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const root = process.cwd()
const apiSrc = readFileSync(join(root, "src/lib/api.ts"), "utf8") +
  readFileSync(join(root, "src/lib/candidate-section-freshness.ts"), "utf8")
const annotatorSrc = readFileSync(join(root, "scripts/lib/freshness-annotator.ts"), "utf8")

/**
 * Regressao de 2026-08-03 (master review).
 *
 * `PF_CURATION_PHASE` NUNCA foi definida em Production (conferido com
 * `vercel env ls production`), e o default do codigo era o inseguro: a expressao
 * `!IS_LAUNCH_PHASE || idade <= janela` curto-circuitava e TODA ficha carimbava
 * "Dado atual", inclusive uma parada desde 14/04 (111 dias). Nenhum dos 1595
 * testes exercitava os dois ramos.
 *
 * O contrato agora: so `hardening` EXPLICITO desliga a checagem de idade.
 */
describe("selo de frescor: default seguro e janela unica", () => {
  it("o default do app so desliga a checagem com 'hardening' explicito", () => {
    assert.match(
      apiSrc,
      /IS_LAUNCH_PHASE\s*=\s*process\.env\.PF_CURATION_PHASE\?\.trim\(\)\s*!==\s*"hardening"/,
      "o default voltou a ser o inseguro (ausencia da env fingindo frescor)",
    )
    assert.doesNotMatch(
      apiSrc,
      /IS_LAUNCH_PHASE\s*=\s*process\.env\.PF_CURATION_PHASE\s*===\s*"launched"/,
      "forma antiga: ausencia da variavel resultava em 'sempre atual'",
    )
  })

  it("o annotator dos scripts tem o mesmo default seguro", () => {
    assert.match(
      annotatorSrc,
      /PF_CURATION_PHASE\?\.trim\(\)\s*===\s*"hardening"\s*\?\s*"hardening"\s*:\s*"launched"/,
      "o gemeo em scripts/lib divergiu do app",
    )
  })

  it("a janela de frescor e a MESMA nos dois lugares", () => {
    const doApp = apiSrc.match(/const PROFILE_FRESHNESS_WINDOW_DAYS = (\d+)/)
    const doScript = annotatorSrc.match(/const CURATION_STALE_WINDOW_DAYS = (\d+)/)

    assert.ok(doApp, "PROFILE_FRESHNESS_WINDOW_DAYS nao encontrada em src/lib/api.ts")
    assert.ok(doScript, "CURATION_STALE_WINDOW_DAYS nao encontrada no annotator")
    assert.equal(
      doApp[1],
      doScript[1],
      `janelas divergentes: app usa ${doApp[1]} dias e o annotator usa ${doScript[1]}. ` +
        "A ficha publica e o relatorio de curadoria passariam a discordar sobre o que esta defasado.",
    )
  })

  it("o annotator nao tem mais a janela hardcoded no calculo", () => {
    assert.match(
      annotatorSrc,
      /ageMs > CURATION_STALE_WINDOW_DAYS \* 24 \* 60 \* 60 \* 1000/,
      "o calculo voltou a usar numero magico em vez da constante compartilhada",
    )
  })

  it("os dois ramos do selo continuam existindo (nao viraram constante)", () => {
    assert.match(apiSrc, /\? "current" : "stale"/, "o ramo 'stale' sumiu do selo")
    assert.match(
      apiSrc,
      /Pode nao refletir mudancas recentes|Pode não refletir mudanças recentes/,
      "a mensagem de bloco defasado sumiu",
    )
  })

  /**
   * Regressao de 09/08/2026: com "2026-08-09" gravado nas tres frentes TSE, as 12
   * fichas materializadas exibiam "Perfil verificado em 08/08/2026". O texto saia
   * de `formatDate(Date)`, e uma data pura ancorada em meia-noite UTC recua um dia
   * no formatador America/Sao_Paulo. O caso de comportamento vive em
   * `tests/verificacao-campos-frescor.test.ts`; aqui fica a guarda de forma, para
   * o `Date` nao voltar a alimentar a exibicao por descuido.
   */
  it("as datas exibidas saem do texto gravado, nunca de um Date", () => {
    assert.doesNotMatch(
      apiSrc,
      /formatDate\((?:profileVerification\.date|latestVoteDate)\)/,
      "a exibicao voltou a passar por Date: data pura recua um dia em America/Sao_Paulo",
    )
    assert.match(
      apiSrc,
      /formatDate\(profileVerification\.raw\)/,
      "o selo de perfil deixou de exibir o texto gravado",
    )
    assert.match(
      apiSrc,
      /formatDate\(latestVoteDateString\)/,
      "o selo de votacoes deixou de exibir o texto gravado",
    )
  })

  /**
   * `section_freshness` viaja DENTRO do payload de `getCachedCandidatoBySlugResource`,
   * cujo TTL e de 3600s. Corrigir o formatador sem bumpar a chave deixaria as fichas
   * ja aquecidas servindo o `message` antigo, com a data recuada um dia, por ate uma
   * hora depois do deploy. O suffix e a unica coisa que invalida esse payload.
   */
  const SUFFIX_FRESCOR = "frescor-data-calendario-20260809"
  const SUFFIX_ANTERIOR = "verificacao-campos-tse-min-20260809"

  it("a chave da ficha carrega o suffix que invalida o section_freshness antigo", () => {
    const bloco = apiSrc.match(/\[\s*"public-candidato-ficha-resource"[^\]]*\]/)
    assert.ok(bloco, "array de cache key de getCachedCandidatoBySlugResource nao encontrado")

    const suffixes = [...bloco[0].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    assert.ok(
      suffixes.includes(SUFFIX_FRESCOR),
      `o suffix ${SUFFIX_FRESCOR} sumiu: a ficha em cache voltaria a servir a data recuada por ate 1h`,
    )
    // Aditivo, nunca substitutivo: remover suffix antigo reaproveita uma chave ja
    // usada, e o payload que ela endereca pode estar quente com o formato errado.
    assert.ok(
      suffixes.includes(SUFFIX_ANTERIOR),
      `o suffix anterior ${SUFFIX_ANTERIOR} foi removido em vez de preservado`,
    )
    assert.ok(
      suffixes.indexOf(SUFFIX_FRESCOR) > suffixes.indexOf(SUFFIX_ANTERIOR),
      "o suffix novo deve ser acrescentado depois do anterior, nao intercalado",
    )
  })
})
