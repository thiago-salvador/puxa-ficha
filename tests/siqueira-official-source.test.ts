import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"
import { assertSiqueiraSourceCurrent, verifySiqueiraOfficialSource } from "../scripts/audit/verify-siqueira-official-source"

const source = JSON.parse(readFileSync(resolve(import.meta.dirname, "../data/siqueira-to-20260907.json"), "utf8"))
function fixture() {
  const raw = (expected: typeof source.candidate, code: number) => ({
    id: expected.sq_candidato_2026 ?? expected.sq_candidato,
    nomeCompleto: expected.nome_completo, nomeUrna: expected.nome_urna,
    partido: { sigla: expected.partido_sigla }, cargo: { codigo: code },
    eleicao: { id: 20322002026 }, ufCandidatura: "TO",
    descricaoSituacao: expected.api_descricao_situacao,
    descricaoTotalizacao: expected.api_descricao_totalizacao,
    isCandidatoInapto: false, st_SUBSTITUIDO: false,
  })
  return {
    candidate: {
      ...raw(source.candidate, 3),
      dataDeNascimento: source.candidate.data_nascimento,
      grauInstrucao: source.candidate.formacao, ocupacao: source.candidate.profissao_declarada,
      descricaoEstadoCivil: source.candidate.estado_civil, descricaoCorRaca: source.candidate.cor_raca,
      descricaoSexo: "MASC.", nomeMunicipioNascimento: "CAMPINAS", sgUfNascimento: "SP",
      fotoUrl: source.candidate.foto_url, fotoUrlPublicavel: true,
      st_DIVULGA_BENS: true, totalDeBens: 0, bens: [] as unknown[],
      vices: [{ sq_CANDIDATO: source.vice.sq_candidato, nm_URNA: source.vice.nome_urna, situacaoVice: 1 }],
      arquivos: [{ idArquivo: "270017140501", nome: "Plano de Governo Final.pdf", codTipo: "5" }],
    },
    vice: raw(source.vice, 4),
  }
}

test("admissão confere os campos usados pela migration e pelo programa", () => {
  const { candidate, vice } = fixture()
  assert.doesNotThrow(() => assertSiqueiraSourceCurrent(candidate, vice, source))
})

const mutations: Array<[string, (value: ReturnType<typeof fixture>) => void]> = [
  ["identidade", ({ candidate }) => { candidate.id = "270002546368" }],
  ["complemento", ({ candidate }) => { candidate.dataDeNascimento = "1957-12-19" }],
  ["situação", ({ candidate }) => { candidate.descricaoSituacao = "Indeferido" }],
  ["inapto", ({ candidate }) => { candidate.isCandidatoInapto = true }],
  ["vice substituída", ({ vice }) => { vice.st_SUBSTITUIDO = true }],
  ["bens novos", ({ candidate }) => { candidate.bens.push({ valor: 100 }) }],
  ["bens não divulgados", ({ candidate }) => { candidate.st_DIVULGA_BENS = false }],
  ["foto privada", ({ candidate }) => { candidate.fotoUrlPublicavel = false }],
  ["vice divergente", ({ candidate }) => { candidate.vices[0].sq_CANDIDATO = "270002546369" }],
  ["vice duplicada", ({ candidate }) => { candidate.vices.push({ ...candidate.vices[0] }) }],
  ["programa substituído", ({ candidate }) => { candidate.arquivos[0].idArquivo = "270017140502" }],
]
for (const [name, mutate] of mutations) {
  test(`gate recusa mudança material: ${name}`, () => {
    const value = fixture()
    mutate(value)
    assert.throws(() => assertSiqueiraSourceCurrent(value.candidate, value.vice, source), /TSE:/)
  })
}

test("transporte impede redirects e não expõe corpo inválido", async () => {
  const received: string[] = []
  const fake: typeof fetch = async (input, options) => {
    received.push(String(input))
    assert.equal(options?.redirect, "error")
    assert.equal(options?.cache, "no-store")
    return new Response("PRIVATE_PAYLOAD_SENTINEL", { status: 200 })
  }
  await assert.rejects(verifySiqueiraOfficialSource(fake), (error: Error) =>
    error.message.includes("JSON válido") && !error.message.includes("PRIVATE_PAYLOAD_SENTINEL"))
  assert.equal(received.length, 1)
})
