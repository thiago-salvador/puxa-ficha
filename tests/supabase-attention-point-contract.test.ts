/**
 * Contrato TS ↔ SQL dos gates de `pontos_atencao`.
 *
 * - `public.is_public_attention_point/3` (migration 20260403234500)
 * - `public.is_public_attention_point/5`, `public.fonte_url_tem_caminho`,
 *   `public.ponto_atencao_fonte_conforme` (migration 20260725160000)
 * - `public.fonte_url_e_raiz_de_aplicacao`,
 *   `public.fonte_url_aponta_para_documento` (migration 20260725190000)
 *
 * Falhas aqui indicam divergência entre RLS/views no Postgres e filtros em
 * `api.ts` ou nos scripts de ingestão.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  GRAVIDADES_QUE_EXIGEM_FONTE,
  fonteConforme,
  fonteUrlApontaParaDocumento,
  fonteUrlEhRaizDeAplicacao,
  fonteUrlTemCaminho,
  isPublicAttentionPointFields,
  motivoRecusaDeFonte,
  temFonteComCaminho,
} from "../src/lib/public-attention-point"

const FONTE_BOA = [{ titulo: "STF", url: "https://portal.stf.jus.br/processos/detalhe.asp?incidente=1" }]
const FONTE_DOMINIO_NU = [{ titulo: "g1", url: "https://g1.globo.com/" }]
const FONTE_RAIZ_DE_PORTAL = [
  { titulo: "DivulgaCandContas", url: "https://divulgacandcontas.tse.jus.br/divulga/" },
]

describe("Supabase contract: is_public_attention_point (TS mirror of SQL)", () => {
  it("visivel false ou null: nunca público", () => {
    assert.equal(isPublicAttentionPointFields(false, "curadoria", true), false)
    assert.equal(isPublicAttentionPointFields(null, "curadoria", true), false)
    assert.equal(isPublicAttentionPointFields(undefined, "ia", true), false)
  })

  it("visivel true e não-IA: público mesmo sem verificado", () => {
    assert.equal(isPublicAttentionPointFields(true, "curadoria", false), true)
    assert.equal(isPublicAttentionPointFields(true, null, false), true)
    assert.equal(isPublicAttentionPointFields(true, "automatico", null), true)
  })

  it("visivel true e IA: só público se verificado === true", () => {
    assert.equal(isPublicAttentionPointFields(true, "ia", true), true)
    assert.equal(isPublicAttentionPointFields(true, "ia", false), false)
    assert.equal(isPublicAttentionPointFields(true, "ia", null), false)
    assert.equal(isPublicAttentionPointFields(true, "ia", undefined), false)
  })

  it("gravidade omitida reproduz o gate antigo de 3 argumentos", () => {
    assert.equal(isPublicAttentionPointFields(true, "curadoria", false), true)
  })

  it("a lista de gravidades que exigem fonte é a mesma do SQL", () => {
    // Espelha o IN ('critica','alta') de public.ponto_atencao_fonte_conforme e
    // de public.is_public_attention_point/5 (migration 20260725160000).
    assert.deepEqual([...GRAVIDADES_QUE_EXIGEM_FONTE], ["critica", "alta"])
  })

  it("gravidade media e baixa não passam a exigir fonte", () => {
    assert.equal(isPublicAttentionPointFields(true, "curadoria", false, "media", null), true)
    assert.equal(isPublicAttentionPointFields(true, "curadoria", false, "baixa", []), true)
  })
})

describe("Gate por gravidade (achados V1 e V2 da auditoria de 2026-07-24)", () => {
  it("crítica e alta exigem verificado true, independente de gerado_por", () => {
    // O caso renan-santos: curadoria, fonte com caminho, verificado false.
    assert.equal(isPublicAttentionPointFields(true, "curadoria", false, "critica", FONTE_BOA), false)
    assert.equal(isPublicAttentionPointFields(true, "curadoria", true, "critica", FONTE_BOA), true)
    assert.equal(isPublicAttentionPointFields(true, "automatico", false, "alta", FONTE_BOA), false)
  })

  it("crítica e alta exigem pelo menos uma fonte com caminho", () => {
    assert.equal(isPublicAttentionPointFields(true, "curadoria", true, "critica", null), false)
    assert.equal(isPublicAttentionPointFields(true, "curadoria", true, "critica", []), false)
    assert.equal(isPublicAttentionPointFields(true, "curadoria", true, "alta", FONTE_DOMINIO_NU), false)
    assert.equal(
      isPublicAttentionPointFields(true, "curadoria", true, "alta", [...FONTE_DOMINIO_NU, ...FONTE_BOA]),
      true,
    )
  })
})

describe("fonteUrlTemCaminho (espelha public.fonte_url_tem_caminho)", () => {
  it("recusa domínio nu, vazio e esquema não-http", () => {
    assert.equal(fonteUrlTemCaminho("https://g1.globo.com/"), false)
    assert.equal(fonteUrlTemCaminho("https://g1.globo.com"), false)
    assert.equal(fonteUrlTemCaminho("http://www1.folha.uol.com.br/"), false)
    assert.equal(fonteUrlTemCaminho(""), false)
    assert.equal(fonteUrlTemCaminho("   "), false)
    assert.equal(fonteUrlTemCaminho(null), false)
    assert.equal(fonteUrlTemCaminho(undefined), false)
    assert.equal(fonteUrlTemCaminho(42), false)
    assert.equal(fonteUrlTemCaminho("ftp://arquivo.gov.br/doc.pdf"), false)
    assert.equal(fonteUrlTemCaminho("https://g1.globo.com/?p=1"), false)
    assert.equal(fonteUrlTemCaminho("https://g1.globo.com/#ancora"), false)
  })

  it("aceita URL com caminho", () => {
    assert.equal(fonteUrlTemCaminho("https://g1.globo.com/politica/noticia/2024/01/02/x.ghtml"), true)
    assert.equal(fonteUrlTemCaminho("http://www.tse.jus.br/eleicoes/candidaturas"), true)
    assert.equal(fonteUrlTemCaminho("  https://portal.stf.jus.br/a  "), true)
  })
})

describe("Gate de escrita (espelha public.ponto_atencao_fonte_conforme)", () => {
  it("gravidade menor que alta é sempre conforme", () => {
    assert.equal(fonteConforme("media", null), true)
    assert.equal(fonteConforme("baixa", []), true)
    assert.equal(fonteConforme(null, null), true)
    assert.equal(fonteConforme(undefined, undefined), true)
  })

  it("crítica e alta exigem pelo menos uma fonte", () => {
    assert.equal(fonteConforme("critica", null), false)
    assert.equal(fonteConforme("critica", []), false)
    assert.equal(fonteConforme("alta", undefined), false)
  })

  it("crítica e alta recusam QUALQUER fonte sem caminho, não só todas", () => {
    assert.equal(fonteConforme("alta", [...FONTE_BOA, ...FONTE_DOMINIO_NU]), false)
    assert.equal(fonteConforme("alta", FONTE_BOA), true)
  })

  it("gate de leitura é mais frouxo que o de escrita: basta uma fonte boa", () => {
    const mista = [...FONTE_BOA, ...FONTE_DOMINIO_NU]
    assert.equal(temFonteComCaminho(mista), true)
    assert.equal(fonteConforme("alta", mista), false)
  })

  it("motivo de recusa distingue sem fonte de domínio nu", () => {
    assert.equal(motivoRecusaDeFonte("critica", []), "nenhuma fonte preenchida")
    assert.equal(
      motivoRecusaDeFonte("critica", FONTE_DOMINIO_NU),
      "fonte com URL sem caminho (dominio nu): https://g1.globo.com/",
    )
    assert.equal(motivoRecusaDeFonte("media", []), null)
    assert.equal(motivoRecusaDeFonte("alta", FONTE_BOA), null)
  })
})

describe("fonteUrlEhRaizDeAplicacao (espelha public.fonte_url_e_raiz_de_aplicacao)", () => {
  it("recusa a raiz do SPA do TSE, com e sem barra final", () => {
    // Responde HTTP 200 com 46 caracteres. Sustentava sozinha uma claim de
    // gravidade alta sobre o patrimônio de uma pessoa nomeada.
    assert.equal(fonteUrlEhRaizDeAplicacao("https://divulgacandcontas.tse.jus.br/divulga/"), true)
    assert.equal(fonteUrlEhRaizDeAplicacao("https://divulgacandcontas.tse.jus.br/divulga"), true)
    assert.equal(fonteUrlEhRaizDeAplicacao("https://app.stc.ma.gov.br/legisla/"), true)
  })

  it("rota de SPA em hash é a mesma casca vazia, então tem o mesmo veredito", () => {
    assert.equal(
      fonteUrlEhRaizDeAplicacao("https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/2040602022/BR/280001637067"),
      true,
    )
  })

  it("não confunde slug de matéria hospedada na raiz do domínio com raiz de portal", () => {
    // Os dois casos reais no acervo. Se a regra os pegasse, o gate derrubaria
    // fonte boa do MP do Ceará e de um portal de notícias.
    assert.equal(
      fonteUrlEhRaizDeAplicacao(
        "https://mpce.mp.br/denuncia-do-mp-contra-ciro-gomes-por-crime-de-violencia-politica-de-genero-e-aceita-pela-justica-eleitoral/",
      ),
      false,
    )
    assert.equal(
      fonteUrlEhRaizDeAplicacao(
        "https://www.riosdenoticias.com.br/urgente-genro-de-david-almeida-envolvido-em-suposta-compra-de-votos-nas-eleicoes-aponta-pf/",
      ),
      false,
    )
  })

  it("não pega URL com mais de um segmento nem consulta específica", () => {
    assert.equal(fonteUrlEhRaizDeAplicacao("https://www.gov.br/infraestrutura/pt-br"), false)
    assert.equal(
      fonteUrlEhRaizDeAplicacao(
        "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/GO/2040602022/candidato/90001646326",
      ),
      false,
    )
  })

  it("entrada inválida nunca vira true", () => {
    assert.equal(fonteUrlEhRaizDeAplicacao(null), false)
    assert.equal(fonteUrlEhRaizDeAplicacao(42), false)
    assert.equal(fonteUrlEhRaizDeAplicacao(""), false)
  })
})

describe("fonteUrlApontaParaDocumento (espelha public.fonte_url_aponta_para_documento)", () => {
  it("exige caminho E não ser raiz de portal", () => {
    assert.equal(fonteUrlApontaParaDocumento("https://g1.globo.com/"), false)
    assert.equal(fonteUrlApontaParaDocumento("https://divulgacandcontas.tse.jus.br/divulga/"), false)
    assert.equal(
      fonteUrlApontaParaDocumento(
        "https://www12.senado.leg.br/noticias/materias/2018/10/07/flavio-bolsonaro-e-arolde-de-oliveira-sao-eleitos-pelo-rio-de-janeiro",
      ),
      true,
    )
  })
})

describe("Raiz de portal nos dois gates (etapa 5B)", () => {
  it("gate de leitura deixa de aceitar claim grave sustentada só por raiz de portal", () => {
    assert.equal(temFonteComCaminho(FONTE_RAIZ_DE_PORTAL), false)
    assert.equal(isPublicAttentionPointFields(true, "ia", true, "alta", FONTE_RAIZ_DE_PORTAL), false)
    assert.equal(isPublicAttentionPointFields(true, "ia", true, "alta", [...FONTE_RAIZ_DE_PORTAL, ...FONTE_BOA]), true)
  })

  it("gate de escrita recusa qualquer raiz de portal na lista", () => {
    assert.equal(fonteConforme("critica", FONTE_RAIZ_DE_PORTAL), false)
    assert.equal(fonteConforme("alta", [...FONTE_BOA, ...FONTE_RAIZ_DE_PORTAL]), false)
  })

  it("gravidade media e baixa seguem passando, como no SQL", () => {
    assert.equal(fonteConforme("media", FONTE_RAIZ_DE_PORTAL), true)
    assert.equal(isPublicAttentionPointFields(true, "curadoria", true, "baixa", FONTE_RAIZ_DE_PORTAL), true)
  })

  it("motivo de recusa nomeia o defeito certo", () => {
    assert.equal(
      motivoRecusaDeFonte("critica", FONTE_RAIZ_DE_PORTAL),
      "fonte que aponta para a raiz de um portal, nao para um documento: https://divulgacandcontas.tse.jus.br/divulga/",
    )
    assert.equal(
      motivoRecusaDeFonte("critica", [...FONTE_DOMINIO_NU, ...FONTE_RAIZ_DE_PORTAL]),
      "fonte com URL sem caminho (dominio nu): https://g1.globo.com/; " +
        "fonte que aponta para a raiz de um portal, nao para um documento: https://divulgacandcontas.tse.jus.br/divulga/",
    )
  })
})
