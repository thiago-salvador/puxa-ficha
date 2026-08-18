/**
 * Matriz nominal 194 x 5 das fontes factuais da aba Destaques.
 *
 * O artefato não coleta nem escreve. Ele reconcilia o readback público com as
 * identidades versionadas e com recibos externos já executados, e materializa
 * cada bloqueio residual como `indeterminado`. Resultado sem consulta nunca
 * vira ausência.
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { cpfEhValido } from "../lib/cpf"
import { supabase } from "../lib/supabase"

type Fonte = "sancoes" | "processos" | "trajetoria" | "patrimonio" | "votacoes"
type ResultadoLog = "encontrado" | "vazio_confirmado" | "sem_achado_no_escopo" | "indeterminado" | "erro" | "nao_aplicavel"

const EXECUTADO_EM = "2026-08-11T15:00:00.000Z"
const TSE8 = new Set(["andre-marinho", "dr-luisinho", "henrique-areas", "izadora-dias", "jose-estevao", "luan-monteiro", "preta-lu", "samara-mineiro"])
const PATRIMONIO_2026_POSITIVO = new Set(["andre-marinho", "cleber-rabelo", "efraim-filho", "geraldo-carvalho", "ivan-moraes", "jose-estevao", "joao-campos", "joel-rodrigues", "raquel-lyra", "samara-mineiro"])
const PROCESSOS_LEGADOS_SEM_FONTE = new Set<string>()
const PROCESSOS_FONTE_OFICIAL_PROJETADA: Record<string, Array<{ identificador: string; endpoint: string }>> = {
  "flavio-bolsonaro": [{
    identificador: "HC 201965",
    endpoint: "https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=477496&ori=1",
  }],
  "tarcisio-gov-sp": [{
    identificador: "TC 008.761/2020-5",
    endpoint: "https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/1089/2025/Plen%C3%A1rio",
  }],
  "haddad-gov-sp": [
    {
      identificador: "0000017-45.2016.6.26.0001",
      endpoint: "https://www.tre-sp.jus.br/comunicacao/noticias/2021/Julho/tre-absolve-fernando-haddad-por-ausencia-de-provas-de-falsidade-ideologica-eleitoral",
    },
    {
      identificador: "0607928-52.2022.6.26.0000",
      endpoint: "https://www.tse.jus.br/comunicacao/radio/2024/Fevereiro/direto-do-plenario-tse-mantem-multa-a-fernando-haddad-por-propaganda-irregular-em-2022",
    },
  ],
  "felicio-ramuth": [{
    identificador: "43.0719.0000337/2020-0",
    endpoint: "https://www.mpsp.mp.br/w/di%C3%A1rio-oficial-mpsp-12/09/2020",
  }],
}
const PROCESSOS_DESPUBLICADOS_PROJETADOS: Record<string, Array<{ id: string; motivo: string }>> = {
  "felicio-ramuth": [{
    id: "75292421-804d-435c-8982-34054dd49bcf",
    motivo: "alegação Andorra sem ato oficial nominal; migration 20260811101200 despublica e registra indeterminado, nunca ausência",
  }],
}
const SENADO_EXATO_SQL = resolve("supabase/migrations/20260811100000_votacoes_senado_chave_exata.sql")
const TRAJETORIA_ENDPOINT_OFICIAL: Record<string, string[]> = {
  "cadu-xavier": ["https://webdisk.diariooficial.rn.gov.br/Jornal/12026-03-31E.pdf"],
  "ricardo-cappelli": [
    "https://www.abdi.com.br/institucional/ex-presidentes/",
    "https://www.abdi.com.br/cerimonia-formaliza-posse-de-ricardo-cappelli-na-presidencia-da-abdi/",
    "https://www.gov.br/mj/pt-br/assuntos/noticias/intervencao-federal-na-seguranca-do-df-e-concluida-apos-23-dias-de-vigencia/",
    "https://www.gov.br/gsi/pt-br/centrais-de-conteudo/noticias/2023-1/nota-a-imprensa",
  ],
}

function slugsSenadoProjetados(): Set<string> {
  const pares = [...readFileSync(SENADO_EXATO_SQL, "utf8").matchAll(/\('([0-9a-f-]{36})'::uuid, '([^']+)', '(sim|não)'\)/g)]
  if (pares.length !== 75) throw new Error(`projeção Senado divergente: ${pares.length}/75 pares`)
  return new Set(pares.map((match) => match[2]))
}

function arg(nome: string, padrao: string): string {
  return process.argv.find((item) => item.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? padrao
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function contar(valores: readonly string[]): Record<string, number> {
  return valores.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1
    return acc
  }, {})
}

function fonteLog(fonte: Fonte): string {
  return fonte === "sancoes"
    ? "transparencia-sanctions"
    : fonte === "processos"
      ? "processos-curadoria"
      : `destaques-${fonte}`
}

function endpoints(fonte: Fonte, slug: string, ids: { sq: Record<string, string>; camara: number | null; senado: number | null }): string[] {
  if (fonte === "sancoes") return ["https://api.portaldatransparencia.gov.br/api-de-dados/ceis", "https://api.portaldatransparencia.gov.br/api-de-dados/cnep", "https://api.portaldatransparencia.gov.br/api-de-dados/ceaf"]
  if (fonte === "processos") return ["https://comunicaapi.pje.jus.br/api/v1/comunicacao"]
  if (fonte === "trajetoria") return [
    ...Object.keys(ids.sq).sort().map((ano) => `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`),
    ...(TRAJETORIA_ENDPOINT_OFICIAL[slug] ?? []),
  ]
  if (fonte === "patrimonio") return Object.keys(ids.sq).sort().map((ano) => `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ano}.zip`)
  return [
    ...(ids.camara ? [`https://dadosabertos.camara.leg.br/api/v2/deputados/${ids.camara}`] : []),
    ...(ids.senado ? [`https://legis.senado.leg.br/dadosabertos/senador/${ids.senado}/votacoes.json`] : []),
  ]
}

async function main(): Promise<void> {
  if (process.env.PF_DRY_RUN !== "1") throw new Error("PF_DRY_RUN=1 é obrigatório")
  const readbackPath = resolve(arg("readback", "/private/tmp/destaques-eval-before.json"))
  const outPath = resolve(arg("out", "QA/evidencias/2026-08-11-itens-4-14-destaques/matriz-fontes-194.json"))
  const audit32Path = resolve("QA/evidencias/2026-08-10-item4-14-destaques/auditoria-fontes-32.json")
  const financiamentoPath = resolve("QA/evidencias/2026-08-10-financiamento-universo/manifesto-235.json")
  const camaraPath = resolve("QA/evidencias/2026-08-10-item7-votacoes/proposta-57-legislatura.json")
  const senadoPath = resolve("QA/evidencias/2026-08-11-item7-senado/auditoria-oficial-13-linhas.json")
  const historicoFontesOficiaisPath = resolve("supabase/migrations/20260811101100_historico_fontes_oficiais_cadu_cappelli.sql")
  const processosLegadosPath = resolve("supabase/migrations/20260811101200_processos_legados_fontes_oficiais.sql")
  const processosLegadosSha = sha256(processosLegadosPath)

  const readback = JSON.parse(readFileSync(readbackPath, "utf8")) as { resumo: { fichas: number; fichasDetalhe: Array<{ slug: string; fontes: Array<{ chave: Fonte; estado: string }> }> } }
  if (readback.resumo.fichas !== 194 || readback.resumo.fichasDetalhe.length !== 194) {
    throw new Error(`universo divergente: ${readback.resumo.fichas}/${readback.resumo.fichasDetalhe.length}`)
  }
  const estadoPorSlug = new Map(readback.resumo.fichasDetalhe.map((ficha) => [ficha.slug, new Map(ficha.fontes.map((fonte) => [fonte.chave, fonte.estado]))]))
  const audit32 = JSON.parse(readFileSync(audit32Path, "utf8")) as { fichas: Array<{ slug: string; fontes: Record<string, { consulta_externa?: boolean; resultado?: string; motivo?: string; candidaturas?: unknown[] }> }> }
  const audit32PorSlug = new Map(audit32.fichas.map((ficha) => [ficha.slug, ficha]))
  const votosProjetados = slugsSenadoProjetados()

  const seed = JSON.parse(readFileSync("data/candidatos.json", "utf8")) as Array<{ slug: string; ids?: { camara?: number | null; senado?: number | null; tse_sq_candidato?: Record<string, string> } }>
  const seedPorSlug = new Map(seed.map((item) => [item.slug, item]))
  const { data: candidatosPublicos, error: erroPublicos } = await supabase.from("candidatos_publico").select("id,slug").limit(1000)
  if (erroPublicos) throw erroPublicos
  const { data: candidatos, error: erroCandidatos } = await supabase.from("candidatos").select("id,slug,cpf").in("id", (candidatosPublicos ?? []).map((item) => item.id)).limit(1000)
  if (erroCandidatos) throw erroCandidatos
  if (candidatosPublicos?.length !== 194 || candidatos?.length !== 194) throw new Error(`universo retornou ${candidatosPublicos?.length ?? 0}/${candidatos?.length ?? 0}`)
  const idsPublicos = candidatos.map((item) => item.id)
  const { data: historico, error: erroHistorico } = await supabase
    .from("historico_politico")
    .select("candidato_id,tipo_evento,periodo_inicio,eleito_por,observacoes,proveniencia")
    .in("candidato_id", idsPublicos)
    .limit(5000)
  if (erroHistorico) throw erroHistorico
  const historicoPorId = new Map<string, typeof historico>()
  for (const linha of historico ?? []) historicoPorId.set(linha.candidato_id, [...(historicoPorId.get(linha.candidato_id) ?? []), linha])
  const { data: processos, error: erroProcessos } = await supabase
    .from("processos")
    .select("id,candidato_id,numero_processo,url_fonte")
    .in("candidato_id", idsPublicos)
    .limit(5000)
  if (erroProcessos) throw erroProcessos
  const processosPorId = new Map<string, typeof processos>()
  for (const linha of processos ?? []) processosPorId.set(linha.candidato_id, [...(processosPorId.get(linha.candidato_id) ?? []), linha])

  const fontes: Fonte[] = ["sancoes", "processos", "trajetoria", "patrimonio", "votacoes"]
  const celulas: Array<Record<string, unknown>> = []
  const persistencia: Array<{ slug: string; fonte_log: string; resultado: ResultadoLog; executado_em: string; detalhe: string; url: string | null }> = []

  for (const candidato of [...candidatos].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const itemSeed = seedPorSlug.get(candidato.slug)
    if (!itemSeed) throw new Error(`seed ausente: ${candidato.slug}`)
    const ids = { sq: itemSeed.ids?.tse_sq_candidato ?? {}, camara: itemSeed.ids?.camara ?? null, senado: itemSeed.ids?.senado ?? null }
    const estados = estadoPorSlug.get(candidato.slug)
    if (!estados) throw new Error(`readback ausente: ${candidato.slug}`)

    for (const fonte of fontes) {
      const atual = estados.get(fonte)
      if (!atual) throw new Error(`célula ausente: ${candidato.slug}/${fonte}`)
      let projetado = atual
      let resultadoPersistido: ResultadoLog | null = null
      let tentativaExecutada = atual !== "nunca_verificado"
      let motivo = atual === "nunca_verificado" ? "sem tentativa nominal comprovada para esta célula" : "estado sustentado pelo banco e pelo readback público"
      let evidencia = "readback-destaques-ficha + tabelas públicas"

      if (fonte === "processos" && atual === "tem_conteudo") {
        const linhas = processosPorId.get(candidato.id) ?? []
        const fonteProjetada = PROCESSOS_FONTE_OFICIAL_PROJETADA[candidato.slug] ?? []
        if (fonteProjetada.length > 0) {
          tentativaExecutada = true
          motivo = "fonte oficial nominal verificada e preparada na projeção fail-closed 20260811101200"
          evidencia = `migration:20260811101200 sha256:${processosLegadosSha}: ${fonteProjetada.map((item) => item.identificador).join(",")}`
        } else if (!linhas.some((linha) => linha.url_fonte)) {
          tentativaExecutada = false
          motivo = "conteúdo judicial legado publicado sem CNJ e sem url_fonte; fonte externa nominal não pode ser reconstruída nesta frente"
          evidencia = `processos.id=${linhas.map((linha) => linha.id).join(",") || "ausente"}; bloqueio factual de proveniência`
        }
      }

      if (fonte === "trajetoria" && atual === "nunca_verificado") {
        if (TSE8.has(candidato.slug)) {
          projetado = "curadoria_limitada"
          tentativaExecutada = true
          motivo = "SQ e resultado eleitoral reconsultados no TSE-8; recorte não prova carreira fora dos pleitos nomeados"
          evidencia = "migration:20260810124000 + auditoria-fontes-32"
        } else {
          const linhas = (historicoPorId.get(candidato.id) ?? []).filter((linha) => linha.tipo_evento === "candidatura" && linha.periodo_inicio && ids.sq[String(linha.periodo_inicio)])
          const naoEleitoExplicito = linhas.length > 0 && linhas.every((linha) => /n[aã]o eleito/i.test(`${linha.eleito_por ?? ""} ${linha.observacoes ?? ""}`))
          resultadoPersistido = naoEleitoExplicito ? "sem_achado_no_escopo" : "indeterminado"
          projetado = naoEleitoExplicito ? "curadoria_limitada" : "nao_foi_possivel_verificar"
          tentativaExecutada = Object.keys(ids.sq).length > 0
          motivo = Object.keys(ids.sq).length === 0
            ? "SQ_CANDIDATO ausente; consulta nominal recusada por identidade insuficiente"
            : naoEleitoExplicito
              ? "candidaturas com SQ e resultado não eleito já registrados de fonte TSE; recorte não cobre cargos fora desses pleitos"
              : "SQ validado em coleta oficial já executada, mas o payload preservado não traz resultado eleitoral suficiente; ausência de mandato não foi inferida"
          evidencia = naoEleitoExplicito ? "historico_politico nominal com proveniência TSE" : Object.keys(ids.sq).length ? "seed nominal + lacuna de payload eleitoral" : "seed nominal sem SQ"
        }
      }

      if (fonte === "patrimonio") {
        if (PATRIMONIO_2026_POSITIVO.has(candidato.slug)) {
          projetado = "tem_conteudo"
          tentativaExecutada = true
          motivo = "bens de 2026 confirmados no pacote oficial e preparados na migration 20260810093000"
          evidencia = "manifesto-delta-patrimonio-2026"
        } else {
          const auditada = audit32PorSlug.get(candidato.slug)?.fontes.patrimonio
          if (auditada && ["bloqueio_identidade_sem_sq", "indeterminado"].includes(String(auditada.resultado))) {
            resultadoPersistido = "indeterminado"
            projetado = "nao_foi_possivel_verificar"
            tentativaExecutada = auditada.consulta_externa === true
            motivo = auditada.resultado === "bloqueio_identidade_sem_sq"
              ? "SQ_CANDIDATO ausente; nenhum pacote foi atribuído a esta pessoa"
              : "pacote oficial consultado, mas zero linhas sem ST_DECLARAR_BENS=N não confirma ausência"
            evidencia = "auditoria-fontes-32 nominal"
          } else if (atual === "nunca_verificado") {
            resultadoPersistido = "indeterminado"
            projetado = "nao_foi_possivel_verificar"
            tentativaExecutada = false
            motivo = "SQ_CANDIDATO ausente; nenhum pacote foi atribuído a esta pessoa"
            evidencia = "seed nominal sem SQ; célula fora do antigo recorte das 32 fichas vazias"
          }
        }
      }

      if (fonte === "votacoes") {
        if (votosProjetados.has(candidato.slug)) {
          projetado = "tem_conteudo"
          resultadoPersistido = null
          tentativaExecutada = true
          motivo = "par nominal presente nos 75 votos oficiais do Senado reconciliados pela migration 20260811100000"
          evidencia = "migration:20260811100000 + auditoria oficial Senado"
        } else {
        const temId = Boolean(ids.camara || ids.senado)
        resultadoPersistido = temId ? "sem_achado_no_escopo" : "indeterminado"
        projetado = temId ? "curadoria_limitada" : "nao_foi_possivel_verificar"
        tentativaExecutada = temId
        motivo = temId
          ? "ID legislativo consultado nos recortes oficiais de votações-chave; nenhum par publicável no conjunto aprovado"
          : "identificador Câmara/Senado ausente; nenhuma consulta nominal foi executada e nenhum vazio foi inferido"
        evidencia = temId ? (ids.senado ? "auditoria oficial Senado 28/28 + dry-run Câmara quando aplicável" : "dry-run Câmara por ID exato") : "seed nominal sem ID legislativo"
        }
      }

      if (resultadoPersistido) {
        const urls = fonte === "processos"
          ? (processosPorId.get(candidato.id) ?? []).map((linha) => linha.url_fonte).filter((url): url is string => Boolean(url))
          : endpoints(fonte, candidato.slug, ids)
        const detalhe = motivo
        persistencia.push({ slug: candidato.slug, fonte_log: fonteLog(fonte), resultado: resultadoPersistido, executado_em: EXECUTADO_EM, detalhe, url: urls.length === 1 ? urls[0] : null })
      }

      const urls = fonte === "processos" && atual === "tem_conteudo"
        ? [
            ...(processosPorId.get(candidato.id) ?? []).map((linha) => linha.url_fonte).filter((url): url is string => Boolean(url)),
            ...(PROCESSOS_FONTE_OFICIAL_PROJETADA[candidato.slug] ?? []).map((item) => item.endpoint),
          ]
        : endpoints(fonte, candidato.slug, ids)
      const identidade = fonte === "sancoes"
        ? { tipo: "cpf", estado: cpfEhValido(candidato.cpf) ? "confirmada" : "ausente", valor_persistido: false }
        : fonte === "processos"
          ? { tipo: "nome+curadoria", estado: "nominal", valor_persistido: false }
          : fonte === "votacoes"
            ? { tipo: "id_legislativo", estado: ids.camara || ids.senado ? "confirmada" : "ausente", camara: ids.camara, senado: ids.senado }
            : { tipo: "sq_candidato", estado: Object.keys(ids.sq).length ? "confirmada" : "ausente", anos: Object.keys(ids.sq).map(Number).sort() }
      celulas.push({
        slug: candidato.slug,
        fonte,
        estado_atual: atual,
        estado_projetado: projetado,
        fonte_externa: { endpoints: urls },
        identidade,
        tentativa: { executada: tentativaExecutada, motivo },
        evidencia_nominal: evidencia,
        payload: {
          schema_version: 1,
          chave: `${candidato.slug}:${fonte}`,
          fonte,
          estado: { atual, projetado, resultado_persistido: resultadoPersistido },
          identidade,
          consulta: {
            executada: tentativaExecutada,
            endpoints_nominais: urls,
            bloqueio: tentativaExecutada && urls.length > 0 ? null : motivo,
          },
          itens_nominais: fonte === "processos"
            ? [
                ...(processosPorId.get(candidato.id) ?? []).map((linha) => ({ identificador: linha.numero_processo, endpoint: linha.url_fonte })),
                ...(PROCESSOS_FONTE_OFICIAL_PROJETADA[candidato.slug] ?? []),
              ]
            : [],
          itens_despublicados: fonte === "processos" ? (PROCESSOS_DESPUBLICADOS_PROJETADOS[candidato.slug] ?? []) : [],
          evidencia: { referencia: evidencia, detalhe: motivo },
        },
      })
    }
  }

  const chaves = new Set(celulas.map((item) => `${item.slug}:${item.fonte}`))
  if (celulas.length !== 970 || chaves.size !== 970) throw new Error(`matriz inválida: ${celulas.length}/${chaves.size}`)
  const silenciosas = celulas.filter((item) => item.estado_projetado === "nunca_verificado")
  if (silenciosas.length) throw new Error(`${silenciosas.length} células continuam nunca_verificado`)
  const semEndpointComConteudo = celulas.filter((item) => item.estado_projetado === "tem_conteudo" && !(item.fonte_externa as { endpoints: string[] }).endpoints.length)
  const slugsSemEndpoint = new Set(semEndpointComConteudo.map((item) => String(item.slug)))
  if (semEndpointComConteudo.length !== PROCESSOS_LEGADOS_SEM_FONTE.size || [...slugsSemEndpoint].some((slug) => !PROCESSOS_LEGADOS_SEM_FONTE.has(slug))) {
    throw new Error(`${semEndpointComConteudo.length} células inesperadas com conteúdo sem endpoint nominal`)
  }
  const porFonteAtual = Object.fromEntries(fontes.map((fonte) => [fonte, contar(celulas.filter((item) => item.fonte === fonte).map((item) => String(item.estado_atual)))]))
  const porFonteProjetado = Object.fromEntries(fontes.map((fonte) => [fonte, contar(celulas.filter((item) => item.fonte === fonte).map((item) => String(item.estado_projetado)))]))
  const relatorio = {
    schema_version: 3,
    modo: "read_only_reconciliacao_nominal",
    universo: { fichas: 194, fontes_por_ficha: 5, celulas: celulas.length },
    fontes_reutilizadas: {
      readback: { path: readbackPath, sha256: sha256(readbackPath) },
      auditoria_32: { path: audit32Path, sha256: sha256(audit32Path) },
      financiamento_identidade: { path: financiamentoPath, sha256: sha256(financiamentoPath) },
      votacoes_camara: { path: camaraPath, sha256: sha256(camaraPath) },
      votacoes_senado: { path: senadoPath, sha256: sha256(senadoPath) },
      trajetorias_cadu_cappelli: { path: historicoFontesOficiaisPath, sha256: sha256(historicoFontesOficiaisPath) },
      processos_legados: { path: processosLegadosPath, sha256: processosLegadosSha },
    },
    resumo: { antes: porFonteAtual, projetado: porFonteProjetado, persistencia: contar(persistencia.map((item) => `${item.fonte_log}:${item.resultado}`)), nunca_verificado_projetado: silenciosas.length, conteudo_sem_endpoint_nominal: semEndpointComConteudo.length },
    persistencia,
    celulas,
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(relatorio, null, 2)}\n`)
  console.log(JSON.stringify({ universo: relatorio.universo, resumo: relatorio.resumo }, null, 2))
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
