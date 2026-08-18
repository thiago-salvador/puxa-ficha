import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  executarIngestFotosOficiais,
  type AlvoFotoOficial,
  type AncoraFotoOficial,
  type DependenciasFotosOficiais,
} from "../scripts/ingest-fotos-oficiais"

const ALVO: AlvoFotoOficial = {
  slug: "candidato-teste",
  estado: "SP",
  cargo_disputado: "Governador",
  cpf: "12345678901",
  foto_url: null,
}

const ANCORA: AncoraFotoOficial = {
  slug: ALVO.slug,
  sq_candidato: "250000000001",
  uf: "SP",
  cargo: "Governador",
  fonte: "fixture",
}

/** Bytes com a estrutura de JPEG íntegro: SOI (ff d8 ff) e EOI (ff d9), como todo arquivo real do DivulgaCand. */
function bytesJpeg(tamanho: number): Buffer {
  const bytes = Buffer.alloc(tamanho, 1)
  bytes[0] = 0xff
  bytes[1] = 0xd8
  bytes[2] = 0xff
  bytes[tamanho - 2] = 0xff
  bytes[tamanho - 1] = 0xd9
  return bytes
}

/** Bytes com a assinatura de PNG (89 50 4e 47): imagem de verdade, formato errado. */
function bytesPng(tamanho: number): Buffer {
  const bytes = Buffer.alloc(tamanho, 1)
  bytes[0] = 0x89
  bytes[1] = 0x50
  bytes[2] = 0x4e
  bytes[3] = 0x47
  return bytes
}

function dependencias(over: Partial<DependenciasFotosOficiais> = {}) {
  const salvas: string[] = []
  const patches: Array<Record<string, unknown>> = []
  const deps: DependenciasFotosOficiais = {
    buscarCandidatura: async () => ({
      id: Number(ANCORA.sq_candidato),
      cpf: ALVO.cpf,
      ufCandidatura: ALVO.estado,
      cargo: { nome: ALVO.cargo_disputado },
    }),
    baixarFoto: async () => ({
      status: 200,
      contentType: "image/jpeg",
      bytes: bytesJpeg(5_001),
      sourceUrl: "https://divulgacandcontas.tse.jus.br/foto.jpg",
    }),
    salvarFoto: async (slug, bytes) => {
      salvas.push(slug)
      return { path: `/candidates/${slug}.jpg`, sha256: "abc123", size: bytes.length }
    },
    aplicarPatch: async (_alvo, patch) => {
      patches.push(patch)
      return 1
    },
    ...over,
  }
  return { deps, salvas, patches }
}

describe("ingest de fotos oficiais", () => {
  it("dry-run baixa a foto local e relata o plano sem escrever no banco", async () => {
    const { deps, salvas, patches } = dependencias()
    const relatorio = await executarIngestFotosOficiais({
      apply: false,
      alvos: [ALVO],
      ancoras: [ANCORA],
      deps,
    })

    assert.deepEqual(salvas, [ALVO.slug])
    assert.deepEqual(patches, [])
    assert.deepEqual(relatorio.aplicaveis.map((item) => item.slug), [ALVO.slug])
    assert.equal(relatorio.aplicaveis[0].size, 5_001)
  })

  it("apply persiste caminho local e crédito oficial estruturado", async () => {
    const { deps, patches } = dependencias()
    await executarIngestFotosOficiais({
      apply: true,
      alvos: [ALVO],
      ancoras: [ANCORA],
      deps,
    })

    assert.deepEqual(patches, [{
      foto_url: `/candidates/${ALVO.slug}.jpg`,
      foto_credito: {
        origem: "tse",
        fonte_url: "https://divulgacandcontas.tse.jus.br/foto.jpg",
        descricao: "Foto oficial de candidatura (TSE/DivulgaCand 2026)",
      },
    }])
  })

  it("CPF divergente torna a identidade fraca e impede foto e escrita", async () => {
    const { deps, salvas, patches } = dependencias({
      buscarCandidatura: async () => ({
        id: Number(ANCORA.sq_candidato),
        cpf: "99999999999",
        ufCandidatura: "SP",
        cargo: { nome: "Governador" },
      }),
    })
    const relatorio = await executarIngestFotosOficiais({
      apply: true,
      alvos: [ALVO],
      ancoras: [ANCORA],
      deps,
    })

    assert.deepEqual(relatorio.identidade_fraca.map((item) => item.slug), [ALVO.slug])
    assert.deepEqual(salvas, [])
    assert.deepEqual(patches, [])
  })

  it("foto real existente fica fora do universo e nunca é sobrescrita", async () => {
    let chamadas = 0
    const { deps, salvas, patches } = dependencias({
      buscarCandidatura: async () => {
        chamadas += 1
        throw new Error("não deveria buscar")
      },
    })
    const relatorio = await executarIngestFotosOficiais({
      apply: true,
      alvos: [{ ...ALVO, foto_url: "https://example.org/foto-real.jpg" }],
      ancoras: [ANCORA],
      deps,
    })

    assert.equal(chamadas, 0)
    assert.deepEqual(salvas, [])
    assert.deepEqual(patches, [])
    assert.deepEqual(relatorio.ignorados_foto_real, [ALVO.slug])
  })

  it("placeholder sem foto aplicável vira null somente no modo apply", async () => {
    const placeholder = { ...ALVO, foto_url: "https://ui-avatars.com/api/?name=CT" }
    const { deps, patches } = dependencias({
      baixarFoto: async () => ({
        status: 200,
        contentType: "image/jpeg",
        bytes: Buffer.alloc(5_000, 1),
        sourceUrl: "https://divulgacandcontas.tse.jus.br/foto.jpg",
      }),
    })
    const relatorio = await executarIngestFotosOficiais({
      apply: true,
      alvos: [placeholder],
      ancoras: [ANCORA],
      deps,
    })

    assert.deepEqual(relatorio.sem_oficial.map((item) => item.slug), [ALVO.slug])
    assert.deepEqual(patches, [{ foto_url: null, foto_credito: null }])
    assert.deepEqual(relatorio.placeholders_removidos, [ALVO.slug])
  })

  it("placeholder com foto aplicável recebe a foto em um único patch, sem remoção nem conflito", async () => {
    // Regressão do apply de 16/08: os alvos de SP tinham placeholder E foto
    // oficial boa, e o DivulgaCand serviu os bytes JPEG com content-type
    // image/png. O header errado não pode derrubar a foto em sem_oficial,
    // porque o ramo "placeholder sem oficial" zeraria o foto_url no lugar dela.
    const placeholder = { ...ALVO, foto_url: "https://ui-avatars.com/api/?name=CT" }
    const { deps, patches } = dependencias({
      baixarFoto: async () => ({
        status: 200,
        contentType: "image/png",
        bytes: bytesJpeg(5_139),
        sourceUrl: "https://divulgacandcontas.tse.jus.br/foto.jpg",
      }),
    })
    const relatorio = await executarIngestFotosOficiais({
      apply: true,
      alvos: [placeholder],
      ancoras: [ANCORA],
      deps,
    })

    assert.deepEqual(relatorio.aplicaveis.map((item) => item.slug), [ALVO.slug])
    assert.equal(patches.length, 1)
    assert.equal(patches[0].foto_url, `/candidates/${ALVO.slug}.jpg`)
    assert.deepEqual(relatorio.placeholders_removidos, [])
    assert.deepEqual(relatorio.conflitos_guarda, [])
    assert.deepEqual(relatorio.sem_oficial, [])
  })

  it("bytes que não são JPEG caem em sem_oficial mesmo com content-type image/jpeg", async () => {
    const placeholder = { ...ALVO, foto_url: "https://ui-avatars.com/api/?name=CT" }
    const { deps, patches } = dependencias({
      baixarFoto: async () => ({
        status: 200,
        contentType: "image/jpeg",
        bytes: bytesPng(7_000),
        sourceUrl: "https://divulgacandcontas.tse.jus.br/foto.jpg",
      }),
    })
    const relatorio = await executarIngestFotosOficiais({
      apply: true,
      alvos: [placeholder],
      ancoras: [ANCORA],
      deps,
    })

    assert.deepEqual(relatorio.sem_oficial.map((item) => item.slug), [ALVO.slug])
    assert.match(relatorio.sem_oficial[0].motivo, /assinatura 89 50 4e 47/)
    assert.deepEqual(relatorio.aplicaveis, [])
    assert.deepEqual(patches, [{ foto_url: null, foto_credito: null }])
    assert.deepEqual(relatorio.placeholders_removidos, [ALVO.slug])
  })

  it("prefixo SOI sem trailer EOI (truncado ou blob arbitrário) cai em sem_oficial", async () => {
    const truncado = Buffer.alloc(6_000, 1)
    truncado[0] = 0xff
    truncado[1] = 0xd8
    truncado[2] = 0xff
    const { deps, salvas } = dependencias({
      baixarFoto: async () => ({
        status: 200,
        contentType: "image/jpeg",
        bytes: truncado,
        sourceUrl: "https://divulgacandcontas.tse.jus.br/foto.jpg",
      }),
    })
    const relatorio = await executarIngestFotosOficiais({
      apply: false,
      alvos: [ALVO],
      ancoras: [ANCORA],
      deps,
    })

    assert.deepEqual(relatorio.sem_oficial.map((item) => item.slug), [ALVO.slug])
    assert.match(relatorio.sem_oficial[0].motivo, /image\/jpeg/)
    assert.match(relatorio.sem_oficial[0].motivo, /assinatura ff d8 ff 01/)
    assert.deepEqual(relatorio.aplicaveis, [])
    assert.deepEqual(salvas, [])
  })

  it("patch da foto que toca 0 linhas vira conflito de guarda nominal", async () => {
    const placeholder = { ...ALVO, foto_url: "https://ui-avatars.com/api/?name=CT" }
    const { deps } = dependencias({
      aplicarPatch: async () => 0,
    })
    const relatorio = await executarIngestFotosOficiais({
      apply: true,
      alvos: [placeholder],
      ancoras: [ANCORA],
      deps,
    })

    assert.deepEqual(relatorio.conflitos_guarda, [ALVO.slug])
    assert.deepEqual(relatorio.placeholders_removidos, [])
  })
})
