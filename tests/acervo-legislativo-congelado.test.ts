import assert from "node:assert/strict"
import test from "node:test"
import {
  ACERVO_LEGISLATIVO_CONGELADO_KEY,
  deveProcessarAcervoLegislativo,
  reciboAcervoCongelado,
} from "../scripts/lib/acervo-legislativo-congelado"
import { parseIngestCliOptions } from "../scripts/lib/pipeline-cli-options"

const frozen = {
  [ACERVO_LEGISLATIVO_CONGELADO_KEY]: {
    camara: {
      estado: "congelado",
      verificado_em: "2026-08-15",
      contagens: { projetos_lei: 42, votos_candidato: 17 },
      run_url: "https://github.com/thiago-salvador/puxa-ficha/actions/runs/1",
    },
  },
}

test("acervo congelado com recibo válido é pulado por padrão", () => {
  assert.equal(deveProcessarAcervoLegislativo(frozen, "camara"), false)
  assert.equal(reciboAcervoCongelado(frozen, "camara")?.verificado_em, "2026-08-15")
})

test("candidato sem recibo da Casa continua sendo processado", () => {
  assert.equal(deveProcessarAcervoLegislativo({}, "camara"), true)
  assert.equal(deveProcessarAcervoLegislativo(frozen, "senado"), true)
})

test("flag local libera explicitamente a recoleta de congelado", () => {
  assert.equal(deveProcessarAcervoLegislativo(frozen, "camara", true), true)
})

test("marca incompleta ou genérica não congela acervo", () => {
  assert.equal(
    deveProcessarAcervoLegislativo({ [ACERVO_LEGISLATIVO_CONGELADO_KEY]: true }, "camara"),
    true
  )
  assert.equal(
    deveProcessarAcervoLegislativo(
      { [ACERVO_LEGISLATIVO_CONGELADO_KEY]: { camara: { estado: "congelado" } } },
      "camara"
    ),
    true
  )
})

test("CLI aceita run scoped com force e timeout local", () => {
  const parsed = parseIngestCliOptions(
    ["camara", "senado", "--slugs=patrus-ananias,wellington-fagundes", "--force-frozen"],
    {
      PF_CAMARA_CANDIDATE_TIMEOUT_MS: "1200000",
      PF_SENADO_CANDIDATE_TIMEOUT_MS: "600000",
    }
  )
  assert.deepEqual(parsed.sourceArgs, ["camara", "senado"])
  assert.deepEqual(parsed.targetSlugs, ["patrus-ananias", "wellington-fagundes"])
  assert.equal(parsed.forceFrozen, true)
  assert.equal(parsed.camaraCandidateTimeoutMs, 1_200_000)
  assert.equal(parsed.senadoCandidateTimeoutMs, 600_000)
})

test("CLI recusa force ou timeout sem slugs explícitos", () => {
  assert.throws(() => parseIngestCliOptions(["camara", "--force-frozen"], {}), /exigem --slugs/)
  assert.throws(
    () => parseIngestCliOptions(["senado"], { PF_SENADO_CANDIDATE_TIMEOUT_MS: "600000" }),
    /exigem --slugs/
  )
})

test("workflow revalida cache após falha parcial sem esconder o job vermelho", async () => {
  const workflow = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../.github/workflows/ingest.yml", import.meta.url), "utf8")
  )
  assert.match(workflow, /if: \$\{\{ !cancelled\(\) \}\}/)
  assert.doesNotMatch(workflow, /!contains\(needs\.\*\.result, 'failure'\)/)
})
