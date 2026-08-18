import assert from "node:assert/strict"
import Module from "node:module"
import { describe, it } from "node:test"

type Loader = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

const moduleLoader = Module as Loader

async function importApiInMockMode() {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
  const originalLoad = moduleLoader._load

  process.env.SUPABASE_URL = "placeholder"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "placeholder"
  process.env.SUPABASE_ANON_KEY = "placeholder"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "placeholder"

  moduleLoader._load = function loadWithNextServerMocks(request, parent, isMain) {
    if (request === "server-only") return {}
    if (request === "next/cache") {
      return {
        unstable_cache: (fn: unknown) => fn,
        unstable_noStore: () => {},
      }
    }
    if (request === "next/headers") {
      return {
        headers: async () => new Headers(),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const imported = await import("../src/lib/api")
    return (imported.default ?? imported) as typeof imported
  } finally {
    moduleLoader._load = originalLoad
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

describe("api resource runtime sem Supabase configurado", () => {
  it("retorna recursos degradados sem servir dados mock sinteticos", async () => {
    const api = await importApiInMockMode()

    assert.equal(api.mergeSourceStatuses("live", "degraded"), "degraded")
    assert.equal(api.mergeSourceMessages(null, "fonte indisponivel"), "fonte indisponivel")
    assert.deepEqual(await api.getCandidatoSlugStaticParams(), [])

    const resources = await Promise.all([
      api.getCandidatosResource(),
      api.getGlobalSearchIndexResource(),
      api.getCandidatoMetadataResource("slug-inexistente"),
      api.getCandidatoBySlugResource("slug-inexistente"),
      api.getCandidatoBySlugPreviewResource("slug-inexistente"),
      api.getCandidatosComResumoResource(),
      api.getCandidatosComparaveisResource(),
      api.getQuizAlignmentDatasetResource(),
      api.getIndicadoresEstadoResource("SP"),
      api.getIndicadoresAllEstadosResource(),
    ])

    for (const resource of resources) {
      assert.equal(resource.sourceStatus, "degraded")
      assert.match(resource.sourceMessage ?? "", /Configure SUPABASE_URL/)
    }

    assert.deepEqual(resources[0].data, [])
    assert.deepEqual(resources[3].data, null)
    assert.deepEqual(resources[7].data, {
      candidatos: [],
      votacoes_mapeadas: [],
      votacao_titulo_to_id: {},
      votacao_fonte_por_titulo: {},
    })
  })
})
