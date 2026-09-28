import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  gerarSql,
  prepararLinhas,
  resumoComunicacoes,
  validarAprovados,
  type Aprovado,
  type ProcessoEvidencia,
} from "../scripts/gerar-migration-processos-aprovados"

const aprovado: Aprovado = {
  slug: "candidata",
  candidato_id: "11111111-1111-4111-8111-111111111111",
  numero_cnj: "7000047-10.2021.8.22.0007",
  tribunal: "TJXX",
  classe: "PROCEDIMENTO COMUM CÍVEL",
  orgao: "1ª Vara Cível",
  polo: "A",
  papel: "parte_ativa",
  tipo: "civil",
  decisao_mesa: "aprovado",
}
const evidencia: ProcessoEvidencia = {
  slug: aprovado.slug,
  numero_cnj: aprovado.numero_cnj,
  tribunal: aprovado.tribunal,
  classe: aprovado.classe,
  orgao: aprovado.orgao,
  polo: aprovado.polo,
}
const comunicacoes = new Map([["70000471020218220007", [
  { numero_processo: "70000471020218220007", tipoComunicacao: "Intimação", data_disponibilizacao: "2026-06-01" },
  { numero_processo: "70000471020218220007", tipoComunicacao: "Lista de distribuição", data_disponibilizacao: "2025-02-03" },
]]])

describe("gerador de lote aprovado com DJEN por número", () => {
  it("recusa contagem divergente, CNJ inválido, duplicidade e identidade não provada", () => {
    assert.throws(() => validarAprovados([aprovado], [evidencia], 83, 28), /processos aprovados/)
    assert.throws(() => validarAprovados([aprovado], [evidencia], 1, 28), /candidatos aprovados/)
    assert.throws(() => validarAprovados([{ ...aprovado, numero_cnj: "7000047-11.2021.8.22.0007" }], [evidencia], 1, 1), /CNJ invalido/)
    assert.throws(() => validarAprovados([aprovado, aprovado], [evidencia], 2, 1), /duplicado/)
    assert.throws(() => validarAprovados([aprovado], [], 1, 1), /evidencia de reexame/)
  })

  it("bloqueia família ou sigilo também quando o órgão consta só no DJEN", () => {
    const familia = { ...aprovado, classe: "AÇÃO DE ALIMENTOS" }
    assert.throws(() => validarAprovados([familia], [{ ...evidencia, classe: familia.classe }], 1, 1), /familia ou segredo/)
    assert.throws(() => resumoComunicacoes(aprovado.numero_cnj, [{
      numero_processo: "70000471020218220007",
      data_disponibilizacao: "2026-06-01",
      tipoComunicacao: "Intimação",
      nomeOrgao: "Vara de Família",
    }]), /familia ou segredo/)
  })

  it("descreve os polos ativo e passivo, inclusive pelo papel editorial quando o polo é nulo", () => {
    const ativo = prepararLinhas(validarAprovados([aprovado], [evidencia], 1, 1), comunicacoes, "curadoria-djen-20260928")[0]
    assert.match(ativo.descricao, /polo ativo/)
    assert.match(ativo.descricao, /Intimação e Lista de distribuição/)
    assert.match(ativo.descricao, /entre 2025-02-03 e 2026-06-01/)
    const passivo = { ...aprovado, polo: null, papel: "parte_passiva" }
    const linha = prepararLinhas(validarAprovados([passivo], [{ ...evidencia, polo: null }], 1, 1), comunicacoes, "curadoria-djen-20260928")[0]
    assert.match(linha.descricao, /polo passivo/)
    assert.throws(() => validarAprovados([{ ...passivo, papel: "testemunha" }], [{ ...evidencia, polo: null }], 1, 1), /polo ausente/)
  })

  it("usa URL humana do próprio CNJ e SQL idempotente com recibos separados", () => {
    const linha = prepararLinhas([aprovado], comunicacoes, "curadoria-djen-20260928")[0]
    assert.equal(linha.url, "https://comunica.pje.jus.br/consulta?numeroProcesso=70000471020218220007")
    const { migration, rollback, readback, counts } = gerarSql([linha], "curadoria-djen-20260928")
    assert.deepEqual(counts, { processos: 1, candidatos: 1 })
    assert.match(migration, /NOT EXISTS \(\s*SELECT 1 FROM public\.processos/)
    assert.match(migration, /c\.id = l\.candidato_id AND c\.slug = l\.slug/)
    assert.match(migration, /INSERT INTO public\.coleta_log/)
    assert.match(migration, /'encontrado'/)
    assert.doesNotMatch(migration, /\b(?:BEGIN|COMMIT);/)
    assert.match(rollback, /p\.fonte = l\.fonte/)
    assert.match(rollback, /DELETE FROM public\.coleta_log/)
    assert.match(readback, /public\.coleta_log_ultima/)
    assert.match(readback, /CNJs ausentes ou duplicados/)
  })
})
