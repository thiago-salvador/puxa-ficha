import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import {
  contarEstadosProgramaGovernoRevisao,
  renderizarProgramaGovernoRevisaoRegional,
  type ProgramaGovernoRevisaoRegistro,
} from "../scripts/lib/programas-governo-revisao-html"
import { gerarRevisaoConsolidada } from "../scripts/programas-governo-revisao-consolidada"

function registro(estado: string, override: Partial<ProgramaGovernoRevisaoRegistro> = {}): ProgramaGovernoRevisaoRegistro {
  return {
    version: 1,
    estado,
    fonte: {
      ano: 2026,
      cargo: "GOVERNADOR",
      uf: "AM",
      sqCandidato: "40002532272",
      slug: "candidato-teste",
      nomeUrna: "CANDIDATO TESTE",
      partido: "TESTE",
      pacoteUrl: "https://cdn.tse.jus.br/pacote.zip",
      datasetUrl: "https://dadosabertos.tse.jus.br/dataset",
      pdfOriginalUrl: null,
      coletadoEm: "2026-08-26T00:00:00Z",
    },
    ...override,
  }
}

const COMPLETO = registro("em_revisao", {
  documentos: [{
    documentoId: "AM:40002532272:01",
    fonte: { arquivoNome: "2026AM40002532272_01.pdf", arquivoNoPacote: "AM/2026AM40002532272_01.pdf", pacoteUrl: "https://cdn.tse.jus.br/pacote.zip", pdfOriginalUrl: null },
    extracao: { sourceSha256: "a".repeat(64), extractedTextSha256: "b".repeat(64), paginas: 243, secoes: [] },
  }],
  resumo: {
    texto: "resumo",
    frases: [{ texto: "frase um.", evidencias: [{ documentoId: "AM:40002532272:01", pagina: 1, trecho: "trecho literal" }] }],
    temas: [{ id: "saude", titulo: "Saude", descricao: "desc", evidencias: [{ documentoId: "AM:40002532272:01", pagina: 2, trecho: "outro trecho" }] }],
  },
  geracao: { promptVersion: "programa-governo-governadores-generator-v1", model: "Anthropic Claude Sonnet@x", generatedAt: "2026-08-26T00:00:00Z" },
  julgamento: {
    model: "OpenAI GPT@gpt-x",
    promptVersion: "programa-governo-governadores-judge-v2",
    judgedAt: "2026-08-26T00:00:00Z",
    verdicts: [
      { id: "k1:suporte", verdict: "yes", reason: "ok" },
      { id: "k2:neutralidade", verdict: "unknown", reason: "parcial" },
    ],
  },
  ingestao: {
    identityKey: "2026:GOVERNADOR:AM:40002532272",
    etapa: "concluida",
    erro: null,
    eval: { completo: true, blockers: 0, dimensoes: [] },
  },
})

test("contagem por estado e rejeicao explicita de aprovados", () => {
  const contagem = contarEstadosProgramaGovernoRevisao([COMPLETO, registro("perfil_local_ausente"), registro("sem_documento_oficial"), registro("falha_de_extracao")])
  assert.deepEqual(contagem, {
    em_revisao: 1,
    perfil_local_ausente: 1,
    sem_documento_oficial: 1,
    falha_de_extracao: 1,
  })
  assert.throws(
    () => renderizarProgramaGovernoRevisaoRegional([registro("aprovado")], { titulo: "t", mensagemNadaAprovado: true }),
    /aprovado/,
  )
})

test("html regional traz identidade, eval, bloqueios e garantia sem aprovado", () => {
  const html = renderizarProgramaGovernoRevisaoRegional([COMPLETO, registro("perfil_local_ausente")], {
    titulo: "Onda teste",
    mensagemNadaAprovado: true,
  })
  assert.match(html, /NADA NESTE ARTEFATO ESTÁ APROVADO/)
  assert.match(html, /CANDIDATO TESTE/)
  assert.match(html, /<strong>SQ<\/strong> 40002532272/)
  assert.match(html, /Resultado do Eval \(2 itens\)/)
  assert.match(html, /unknown/)
  assert.match(html, /Este registro NÃO está aprovado/)
  assert.ok(!html.includes('data-estado="aprovado"'))
  assert.match(html, /Perfil local ausente/)
  assert.match(html, /Em revisão \(Eval completo\)/)
  assert.doesNotMatch(html, /^[\t ]+$/mu)
})

test("eval incompleto permanece rotulado como bloqueado", () => {
  const incompleto = registro("em_revisao", {
    ...COMPLETO,
    ingestao: {
      ...COMPLETO.ingestao!,
      eval: { completo: false, blockers: 2, dimensoes: ["suporte"] },
    },
  })
  const html = renderizarProgramaGovernoRevisaoRegional([incompleto], { titulo: "t", mensagemNadaAprovado: true })
  assert.match(html, /Em revisão \(Eval incompleto, bloqueado\)/)
  assert.match(html, /Eval incompleto: 2 veredito/)
})

test("cobertura exata compara identidades e recusa duplicata com omissão na mesma UF", async () => {
  const raiz = await mkdtemp(path.join(process.cwd(), ".tmp-pf-revisao-identidades-"))
  try {
    const ondas = path.join(raiz, "ondas")
    const destino = path.join(raiz, "review")
    const inventario = path.join(raiz, "inventario.json")
    const ufDir = path.join(ondas, "nordeste", "BA")
    await mkdir(ufDir, { recursive: true })
    const duplicado = registro("perfil_local_ausente", {
      fonte: { ...COMPLETO.fonte, uf: "BA", sqCandidato: "10000000001", slug: "duplicado" },
      ingestao: { identityKey: "2026:GOVERNADOR:BA:10000000001", etapa: "ausencia", erro: null, eval: null },
    })
    await writeFile(path.join(ufDir, "a.json"), JSON.stringify(duplicado))
    await writeFile(path.join(ufDir, "b.json"), JSON.stringify(duplicado))
    await writeFile(inventario, JSON.stringify({
      escopo: { ano: 2026, cargo: "GOVERNADOR" },
      candidaturas: [
        { uf: "BA", chave: "2026:GOVERNADOR:BA:10000000001" },
        { uf: "BA", chave: "2026:GOVERNADOR:BA:10000000002" },
      ],
    }))
    const resultado = await gerarRevisaoConsolidada(ondas, destino, { inventarioPath: inventario })
    assert.equal(resultado.coberturaExata, false)
    assert.match(resultado.pendenciasCobertura.join("\n"), /faltantes=1, extras=0, duplicadas=1/)
    for (const regiao of ["norte", "nordeste", "centro-oeste", "sudeste", "sul"]) {
      assert.equal(existsSync(path.join(destino, regiao, "review.html")), true, `link regional ${regiao} deve existir mesmo vazio`)
    }
  } finally {
    await rm(raiz, { recursive: true, force: true })
  }
})
