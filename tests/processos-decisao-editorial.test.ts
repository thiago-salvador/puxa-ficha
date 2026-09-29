import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { bloquearPlanosPorDecisao, type PlanoRegistro } from "../scripts/aplicar-evidencia-processos-curadoria"
import { chaveDecisao, decididoNaoPublicar, validarDecisoes } from "../scripts/lib/processos-decisao-editorial"
import { main as despublicar, shaPlano, shaPreimagem, stringifyPreimagem } from "../scripts/processos-despublicar-decididos"

const slug = ["teste", "um"].join("-")
const cnj = "1".repeat(20)
const outroCnj = "2".repeat(20)
const id = "00000000-0000-4000-8000-000000000001"

const linha = {
  tipo: "civil",
  status: null,
  descricao: "Ação cível pública",
  numero_processo: cnj,
  id,
  candidato_id: "00000000-0000-4000-8000-000000000002",
  created_at: "2026-09-29T12:00:00+00:00",
}

function decisoes(hashes: string[]) {
  return {
    schema_version: 1,
    kind: "processos-decisao-editorial",
    chave: "sha256(slug|cnj_digitos)",
    gerado_em: "2026-09-29",
    origem: "decisao editorial",
    nao_publicar: hashes,
  }
}

function plano(numero: string, candidato = slug): PlanoRegistro {
  return {
    lote: 1,
    slug: candidato,
    data: "2026-09-29",
    classificacao: "encontrado",
    resultado: "encontrado",
    homonimosDescartados: 0,
    args: [`--slug=${candidato}`, "--resultado=encontrado", `--evidencia-publicavel=https://comunicaapi.pje.jus.br/consulta?numeroProcesso=${numero}`],
  }
}

function fakeClient(initial = linha, alterarNaSegundaLeitura = false) {
  let atual: Record<string, unknown> | null = { ...initial }
  let leituras = 0
  let exclusoes = 0
  return {
    get leituras() { return leituras },
    get exclusoes() { return exclusoes },
    from(tabela: string) {
      if (tabela === "candidatos") return {
        select(colunas: string) {
          assert.equal(colunas, "slug")
          return { async eq(campo: string, valor: string) {
            assert.equal(campo, "id")
            assert.equal(valor, "00000000-0000-4000-8000-000000000002")
            return { data: [{ slug }], error: null }
          } }
        },
      }
      assert.equal(tabela, "processos")
      return {
        select(colunas: string) {
          assert.equal(colunas, "*")
          return { async eq(campo: string, valor: string) {
            assert.equal(campo, "id")
            assert.equal(valor, id)
            leituras++
            if (alterarNaSegundaLeitura && leituras === 2 && atual) atual = { ...atual, descricao: "mudou" }
            return { data: atual ? [{ ...atual }] : [], error: null }
          } }
        },
        delete() {
          const filtros: Array<[string, unknown]> = []
          const query = {
            eq(campo: string, valor: unknown) { filtros.push([campo, valor]); return query },
            is(campo: string, valor: null) { filtros.push([campo, valor]); return query },
            async select(colunas: string) {
              assert.equal(colunas, "id")
              exclusoes++
              if (!atual || !filtros.every(([campo, valor]) => atual?.[campo] === valor)) return { data: [], error: null }
              atual = null
              return { data: [{ id }], error: null }
            },
          }
          return query
        },
      }
    },
  }
}

describe("decisao editorial de processos", () => {
  it("valida formato estrito e rejeita chaves extras, hashes repetidos ou fora de ordem", () => {
    const hash = chaveDecisao(slug, cnj)
    assert.equal(hash, createHash("sha256").update(`${slug}|${cnj}`).digest("hex"))
    assert.equal(decididoNaoPublicar(validarDecisoes(decisoes([hash])), slug, cnj), true)
    assert.throws(() => validarDecisoes({ ...decisoes([hash]), extra: 1 }), /chave|campo/i)
    assert.throws(() => validarDecisoes(decisoes([hash, hash])), /ordem|duplic/i)
    assert.throws(() => validarDecisoes(decisoes(["f".repeat(64), "a".repeat(64)])), /ordem/i)
    assert.throws(() => validarDecisoes(decisoes(["ABC"])), /hash/i)
    assert.throws(() => validarDecisoes({ ...decisoes([]), origem: null }), /origem/i)
  })

  it("quarentena o plano bloqueado e preserva o candidato permitido, inclusive no caminho de vazio", () => {
    const bloqueado = new Set([chaveDecisao(slug, cnj)])
    const livre = ["teste", "dois"].join("-")
    const resultado = bloquearPlanosPorDecisao(
      [plano(cnj), plano(outroCnj, livre), { ...plano(cnj), resultado: "vazio_confirmado", classificacao: "vazio_confirmado", args: [`--slug=${slug}`, "--resultado=vazio_confirmado"] }],
      new Map([[slug, [cnj]], [livre, [outroCnj]]]),
      bloqueado,
    )
    assert.deepEqual(resultado.planos.map((item) => item.slug), [livre])
    assert.equal(resultado.bloqueados, 2)
    assert.equal(resultado.revisaoHumana.length, 2)
    assert.ok(resultado.revisaoHumana.every((item) => item.motivo === "decisao_editorial_nao_publicar"))
  })

  it("gera os mesmos bytes e hash do json.dumps Python com chaves ordenadas e ensure_ascii=False", () => {
    assert.equal(stringifyPreimagem(linha), '{"candidato_id": "00000000-0000-4000-8000-000000000002", "created_at": "2026-09-29T12:00:00+00:00", "descricao": "Ação cível pública", "id": "00000000-0000-4000-8000-000000000001", "numero_processo": "11111111111111111111", "status": null, "tipo": "civil"}')
    assert.equal(shaPreimagem(linha), "d5ddf24956c8d096c91a0e9ad71f1fe65d3cf72381ca0b5d676825faff8fb977")
  })

  it("dry-run faz backup completo, calcula o SHA do plano e recusa item fora da lista", async () => {
    const dir = mkdtempSync(join(tmpdir(), "processos-decisao-"))
    try {
      const planPath = join(dir, "plano.json")
      const out = join(dir, "backup")
      const item = { id, slug, numero_cnj: cnj, preimagem_sha256: shaPreimagem(linha) }
      writeFileSync(planPath, JSON.stringify({ itens: [item] }))
      const cliente = fakeClient()
      const saidas: unknown[] = []
      const resumo = await despublicar([`--plano=${planPath}`, `--out=${out}`], {
        client: cliente as never,
        decisoes: new Set([chaveDecisao(slug, cnj)]),
        emit: (saida) => saidas.push(saida),
      })
      // Contrato do plano: sha256 do JSON dos pares [id, preimagem] ordenados por id.
      const esperado = createHash("sha256").update(JSON.stringify([[item.id, item.preimagem_sha256]])).digest("hex")
      assert.equal(resumo.plano_sha256, esperado)
      assert.equal(shaPlano([item]), resumo.plano_sha256)
      const outro = { ...item, id: "00000000-0000-4000-8000-000000000003" }
      assert.equal(shaPlano([item, outro]), shaPlano([outro, item]))
      assert.equal(resumo.conferidos, 1)
      assert.equal(cliente.exclusoes, 0)
      assert.deepEqual(JSON.parse(readFileSync(resumo.backup, "utf8")).linhas, [linha])
      assert.equal(saidas.length, 1)
      await assert.rejects(() => despublicar([`--plano=${planPath}`, `--out=${out}`], {
        client: cliente as never, decisoes: new Set(), emit: () => {},
      }), /decisao editorial|nao_publicar/i)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("apply recusa SHA divergente sem ler nem excluir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "processos-decisao-"))
    try {
      const planPath = join(dir, "plano.json")
      writeFileSync(planPath, JSON.stringify({ itens: [{ id, slug, numero_cnj: cnj, preimagem_sha256: shaPreimagem(linha) }] }))
      const cliente = fakeClient()
      await assert.rejects(() => despublicar([`--plano=${planPath}`, `--out=${dir}`, "--apply", `--expected-plan-sha=${"0".repeat(64)}`], {
        client: cliente as never, decisoes: new Set([chaveDecisao(slug, cnj)]), emit: () => {},
      }), /plan SHA|plano SHA|expected-plan-sha/i)
      assert.equal(cliente.leituras, 0)
      assert.equal(cliente.exclusoes, 0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("apply pula preimagem alterada após o backup, sem excluir, e sinaliza saída 4", async () => {
    const dir = mkdtempSync(join(tmpdir(), "processos-decisao-"))
    try {
      const planPath = join(dir, "plano.json")
      const item = { id, slug, numero_cnj: cnj, preimagem_sha256: shaPreimagem(linha) }
      writeFileSync(planPath, JSON.stringify({ itens: [item] }))
      const cliente = fakeClient(linha, true)
      await assert.rejects(() => despublicar([`--plano=${planPath}`, `--out=${dir}`, "--apply", `--expected-plan-sha=${shaPlano([item])}`], {
        client: cliente as never, decisoes: new Set([chaveDecisao(slug, cnj)]), emit: () => {},
        escrever: async (_ctx, executar) => { const resposta = await executar(); return resposta.data ?? [] },
      }), (erro: unknown) => erro instanceof Error && "exitCode" in erro && erro.exitCode === 4)
      assert.equal(cliente.exclusoes, 0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("apply exclui somente o ID conferido e confirma a ausência no readback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "processos-decisao-"))
    try {
      const planPath = join(dir, "plano.json")
      const row = { ...linha, candidato_id: "00000000-0000-4000-8000-000000000002" }
      const item = { id, slug, numero_cnj: cnj, preimagem_sha256: shaPreimagem(row) }
      writeFileSync(planPath, JSON.stringify({ itens: [item] }))
      const cliente = fakeClient(row)
      const resumo = await despublicar([`--plano=${planPath}`, `--out=${dir}`, "--apply", `--expected-plan-sha=${shaPlano([item])}`], {
        client: cliente as never, decisoes: new Set([chaveDecisao(slug, cnj)]), emit: () => {},
        escrever: async (_ctx, executar) => { const resposta = await executar(); return resposta.data ?? [] },
      })
      assert.equal(resumo.excluidos, 1)
      assert.equal(cliente.exclusoes, 1)
      assert.deepEqual(resumo.pulados, [])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
