/**
 * Resgate dos 3 pares duplicados (T1), arquivamento dos registros mortos (T2)
 * e correção do cargo de adriana-accorsi (T3). Decisão de 2026-08-04.
 *
 * Só migra linhas auditadas uma a uma na inspeção de 2026-08-04
 * (scripts/audit-resgate-pares-duplicados.ts). Nada é deletado: arquivar é mudar flag.
 *
 * Regra de segurança: todo ponto de atenção migrado entra com
 * verificado=false e visivel=false (fila de revisão humana), mesmo quando a
 * origem estava verificada — a verificação original valeu para outra corrida.
 *
 * Não migra (decisão documentada no relatório):
 *  - noticias_candidato: inundaria o digest de alertas (trigger
 *    log_candidate_change grava INSERT de notícia em candidate_changes);
 *  - patrimonio/financiamento 2022 do tarcisio: conflito de valores com a
 *    linha 2022 já existente no registro ativo;
 *  - processo criminal do ciro morto: tabela sem flag de revisão (iria direto
 *    ao ar); o fato já vai coberto pelo ponto de atenção migrado;
 *  - historico/mudancas/projetos: tudo duplicado com o registro ativo.
 *
 * Uso:
 *   npx tsx scripts/apply-resgate-pares-duplicados.ts            # dry-run (padrão)
 *   npx tsx scripts/apply-resgate-pares-duplicados.ts --apply    # escreve no banco
 */
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { archiveFonteReferences } from "./lib/archive-url"

/** Identidade deste programa na trilha de `coleta_log`. */
const SCRIPT = "apply-resgate-pares-duplicados"

const APLICAR = process.argv.includes("--apply")

type Linha = Record<string, unknown>

const MARCADOR = "resgate_2026_08_04"

const IDS = {
  tarcisio: "0f552442-26cf-406f-a82a-447c9c16ff4f",
  tarcisioGovSp: "1919a599-1f61-41cc-ab6a-cd4baa77e639",
  ciroGomes: "b1c3d3e1-36d0-4026-82d2-ece83072967c",
  ciroGomesGovCe: "2df15aa1-0bd3-4bab-89bf-13d780645e54",
  ciroHistoricoGovMorto: "309e3a6e-a5bd-4669-969f-c285768a0e11",
  ciroHistoricoGovAtivo: "bece5803-28e7-4a0e-90c4-8ccafefead1f",
  fernandoHaddad: "4a346e68-f0c6-42f1-a9d3-f29a4f0212b6",
  haddadGovSp: "0d0d87d3-46af-4e07-ae2e-e7255c30f3c2",
  adrianaAccorsi: "a41f93a6-2fc4-4c7c-907f-bebdcd0c132b",
  pontoEscudoMorto: "f2fa7b99-035c-4f49-a142-58031226057b",
  pontoEscudoAtivo: "a5a31164-ef40-42e5-a2f2-4f68fce227bd",
  patrimonioCiro2018: "caef683d-6d79-416b-84cd-fe0eac28e9bc",
  financiamentoCiro2018: "d49c267f-fc34-4915-9796-efadf44540df",
} as const

// Pontos auditados na inspeção de 2026-08-04, por destino.
const PONTOS_PARA_MIGRAR: Array<{ destino: string; origem: string; ids: string[] }> = [
  {
    destino: IDS.tarcisioGovSp,
    origem: "tarcisio",
    ids: [
      "e62c9cb6-5ed4-4275-b6f0-0148a8203eb2", // concessões como ministro
      "a35ef613-e165-40d8-98b2-2d55c10b88f3", // aprovação >50% como governador
      "09f569a7-9dd8-41ad-80ea-31bda9bd047b", // domicílio eleitoral
      "b0f094ce-981c-4e9b-81bf-33bd057b076a", // privatizações
      "d470ed69-3778-4a78-95c8-ddedbbc69333", // tiro em Paraisópolis (2022)
    ],
  },
  {
    destino: IDS.ciroGomesGovCe,
    origem: "ciro-gomes",
    ids: [
      "f25ad23f-1d7a-43dc-ba6a-c764ba8d0a2a", // educação no governo CE
      "291cf694-8e8b-453e-a53a-69134f62e400", // não apoiou Lula no 2º turno
      "5a9d9a65-b498-49bf-bd33-6e2c62ba8455", // 7 partidos em 30 anos
      "647c916d-69b0-4152-ac90-b661852c8e04", // agressão a jornalista
    ],
  },
  {
    destino: IDS.haddadGovSp,
    origem: "fernando-haddad",
    ids: [
      "c52ef3ae-c90b-4c83-b286-8d55e8cc8793", // caixa 2 (anulada pelo TSE)
      "542e3db8-2235-4873-a7eb-c39ba85fa1bf", // déficit fiscal como ministro
    ],
  },
]

const POSICOES_PARA_MIGRAR = {
  destino: IDS.tarcisioGovSp,
  origem: "tarcisio",
  ids: [
    "d34e2926-7c3e-49af-aa56-7b6d03451181", // reforma_trabalhista
    "bfb19169-97e8-4e5a-97a6-bb63715fcb10", // teto_gastos
    "60122e72-6ae8-4a07-92bb-30b05f402f73", // transferencia_renda
  ],
} as const

type Consulta<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>

async function pegar<T>(promessa: Consulta<T>, contexto: string): Promise<T> {
  const { data, error } = await promessa
  if (error) throw new Error(`${contexto}: ${error.message}`)
  if (data === null) throw new Error(`${contexto}: sem dados`)
  return data
}

function afirmar(condicao: boolean, mensagem: string): void {
  if (!condicao) throw new Error(`AFIRMATIVA FALHOU: ${mensagem}`)
}

function proveniencia(slugOrigem: string, origemId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { [MARCADOR]: { migrado_de_slug: slugOrigem, origem_id: origemId, ...extra } }
}

async function contarFila(): Promise<number> {
  const publicos = await pegar(
    supabase.from("candidatos_publico").select("id"),
    "candidatos_publico"
  )
  const ids = (publicos as Linha[]).map((c) => c.id as string)
  const pontos = await pegar(
    supabase.from("pontos_atencao").select("visivel, verificado, gerado_por, despublicacao_motivo").in("candidato_id", ids),
    "fila pontos"
  )
  const posicoes = await pegar(
    supabase.from("posicoes_declaradas").select("verificado").in("candidato_id", ids),
    "fila posições"
  )
  const filaPontos = (pontos as Linha[]).filter((p) => p.visivel === false && p.despublicacao_motivo === null).length
  const filaIa = (pontos as Linha[]).filter((p) => p.visivel === true && p.gerado_por === "ia" && p.verificado === false).length
  const filaPos = (posicoes as Linha[]).filter((p) => p.verificado === false).length
  return filaPontos + filaIa + filaPos
}

async function main(): Promise<void> {
  const filaAntes = await contarFila()
  console.log(`fila de revisão antes: ${filaAntes}`)

  // ── Guarda de idempotência: marcador de resgate já presente? ──
  const jahMigrados = await pegar(
    supabase
      .from("pontos_atencao")
      .select("id")
      .in("candidato_id", [IDS.tarcisioGovSp, IDS.ciroGomesGovCe, IDS.haddadGovSp])
      .not("dados_relacionados", "is", null),
    "guarda idempotência"
  )
  const comMarcador = (jahMigrados as Linha[]).filter((l) => {
    const dr = l.dados_relacionados
    return typeof dr === "object" && dr !== null && MARCADOR in (dr as Record<string, unknown>)
  })
  afirmar(comMarcador.length === 0, `resgate já executado (${comMarcador.length} pontos com marcador)`)

  // ── T1a: pontos de atenção (sempre verificado=false, visivel=false) ──
  let totalPontos = 0
  for (const lote of PONTOS_PARA_MIGRAR) {
    const linhas = await pegar(
      supabase.from("pontos_atencao").select("*").in("id", lote.ids),
      `pontos de ${lote.origem}`
    )
    const pontos = linhas as Linha[]
    afirmar(pontos.length === lote.ids.length, `${lote.origem}: esperava ${lote.ids.length} pontos, veio ${pontos.length}`)

    const payloads = await Promise.all(
      pontos.map(async (p) => ({
        candidato_id: lote.destino,
        categoria: p.categoria,
        titulo: p.titulo,
        descricao: p.descricao,
        fontes: APLICAR
          ? await archiveFonteReferences(
              Array.isArray(p.fontes) ? (p.fontes as Array<{ url?: unknown }>) : [],
            )
          : (p.fontes ?? []),
        dados_relacionados: {
          ...(typeof p.dados_relacionados === "object" && p.dados_relacionados !== null
            ? (p.dados_relacionados as Record<string, unknown>)
            : {}),
          ...proveniencia(lote.origem, p.id as string),
        },
        gravidade: p.gravidade,
        data_referencia: p.data_referencia,
        gerado_por: p.gerado_por,
        verificado: false,
        visivel: false,
      })),
    )

    for (const payload of payloads) console.log(`[ponto] ${lote.origem} -> "${String(payload.titulo)}" (gravidade=${String(payload.gravidade)})`)
    totalPontos += payloads.length

    if (APLICAR) {
      const inseridos = await escreverAuditado(
        {
          script: SCRIPT,
          tabela: "pontos_atencao",
          motivo: "migra ponto de atencao auditado do registro duplicado morto para o registro ativo (decisao de 2026-08-04)",
          recorte: `${payloads.length} ponto(s) de ${lote.origem} para o candidato ${lote.destino}, todos com verificado=false e visivel=false`,
        },
        () => supabase.from("pontos_atencao").insert(payloads).select("id, titulo")
      )
      console.log(`  inseridos: ${(inseridos as Linha[]).length}`)
    }
  }

  // ── T1b: consolidação Operação Escudo (mesmo fato nos dois registros) ──
  const escudoMorto = (await pegar(
    supabase.from("pontos_atencao").select("*").eq("id", IDS.pontoEscudoMorto).single(),
    "ponto Escudo morto"
  )) as Linha
  const escudoAtivo = (await pegar(
    supabase.from("pontos_atencao").select("*").eq("id", IDS.pontoEscudoAtivo).single(),
    "ponto Escudo ativo"
  )) as Linha
  afirmar(escudoMorto.candidato_id === IDS.tarcisio, "Escudo morto pertence ao tarcisio")
  afirmar(escudoAtivo.candidato_id === IDS.tarcisioGovSp, "Escudo ativo pertence ao tarcisio-gov-sp")
  afirmar(escudoAtivo.visivel === false && escudoAtivo.verificado === false, "Escudo ativo está fora do ar")

  const descricaoConsolidada = `${escudoAtivo.descricao} ${escudoMorto.descricao}`
  const drAtivo =
    typeof escudoAtivo.dados_relacionados === "object" && escudoAtivo.dados_relacionados !== null
      ? (escudoAtivo.dados_relacionados as Record<string, unknown>)
      : {}
  const payloadConsolidacao = {
    descricao: descricaoConsolidada,
    fontes: APLICAR
      ? await archiveFonteReferences(
          Array.isArray(escudoMorto.fontes)
            ? (escudoMorto.fontes as Array<{ url?: unknown }>)
            : [],
        )
      : (escudoMorto.fontes ?? []),
    dados_relacionados: {
      ...drAtivo,
      ...proveniencia("tarcisio", IDS.pontoEscudoMorto, { consolidado: "mesmo evento Operação Escudo" }),
    },
  }
  console.log(`[consolidação] Escudo: ativo ${IDS.pontoEscudoAtivo} recebe texto+fonte do morto ${IDS.pontoEscudoMorto}`)
  if (APLICAR) {
    await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "pontos_atencao",
        motivo: "consolida no ponto ativo o texto e as fontes do ponto duplicado (mesmo evento Operacao Escudo)",
        recorte: `ponto ${IDS.pontoEscudoAtivo}, texto e fontes vindos de ${IDS.pontoEscudoMorto}`,
      },
      () =>
        supabase
          .from("pontos_atencao")
          .update(payloadConsolidacao)
          .eq("id", IDS.pontoEscudoAtivo)
          .select("id")
    )
    console.log("  consolidado")
  }

  // ── T1c: posições declaradas (verificado=false, caem na fila do quiz) ──
  const posicoes = (await pegar(
    supabase.from("posicoes_declaradas").select("*").in("id", [...POSICOES_PARA_MIGRAR.ids]),
    "posições tarcisio"
  )) as Linha[]
  afirmar(posicoes.length === POSICOES_PARA_MIGRAR.ids.length, "posições: contagem diverge")
  const payloadsPosicoes = posicoes.map((p) => ({
    candidato_id: POSICOES_PARA_MIGRAR.destino,
    tema: p.tema,
    posicao: p.posicao,
    descricao: `${p.descricao ?? ""} [Migrado em 2026-08-04 do registro presidencial "${POSICOES_PARA_MIGRAR.origem}"]`.trim(),
    fonte: p.fonte,
    url_fonte: p.url_fonte,
    gerado_por: p.gerado_por,
    verificado: false,
  }))
  for (const payload of payloadsPosicoes) console.log(`[posição] tema=${String(payload.tema)} posicao=${String(payload.posicao)}`)
  if (APLICAR) {
    const inseridos = await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "posicoes_declaradas",
        motivo: "migra posicao declarada do registro duplicado morto para o registro ativo (decisao de 2026-08-04)",
        recorte: `${payloadsPosicoes.length} posicao(oes) de ${POSICOES_PARA_MIGRAR.origem}, todas com verificado=false (fila do quiz)`,
      },
      () => supabase.from("posicoes_declaradas").insert(payloadsPosicoes).select("id")
    )
    console.log(`  inseridas: ${(inseridos as Linha[]).length}`)
  }

  // ── T1d: legislação do mandato executivo ──
  // Tarcísio: o registro ativo já recebeu as 885 leis ALESP do registro morto
  // (conferido por identificador_fonte em 2026-08-04: zero atos só no morto).
  // Nada a migrar; mantida apenas a conferência de segurança abaixo.
  const legTarcisioMorto = await pegar(
    supabase
      .from("legislacao_mandato_executivo")
      .select("identificador_fonte")
      .eq("candidato_id", IDS.tarcisio),
    "legislação tarcisio morto"
  )
  const legTarcisioAtivo = await pegar(
    supabase
      .from("legislacao_mandato_executivo")
      .select("identificador_fonte")
      .eq("candidato_id", IDS.tarcisioGovSp),
    "legislação tarcisio ativo"
  )
  const idsAtivoTarcisio = new Set((legTarcisioAtivo as Linha[]).map((l) => l.identificador_fonte))
  const soMortoTarcisio = (legTarcisioMorto as Linha[]).filter((l) => !idsAtivoTarcisio.has(l.identificador_fonte))
  afirmar(soMortoTarcisio.length === 0, `tarcisio: ${soMortoTarcisio.length} atos ainda só no morto`)
  console.log(`[legislação] tarcisio: ativo já tem tudo (${(legTarcisioAtivo as Linha[]).length} atos), nada a migrar`)

  // Ciro: 5 leis estaduais do governo CE (1991-1994) existem só no registro
  // morto. Dados oficiais (fonte CE-BELT) sobre o mandato que ele disputa de
  // novo; migra com o histórico reapontado para a linha de governador do ativo.
  const historicoGovAtivoCiro = (await pegar(
    supabase
      .from("historico_politico")
      .select("id, candidato_id, cargo_canonico, estado, periodo_inicio, periodo_fim")
      .eq("id", IDS.ciroHistoricoGovAtivo)
      .single(),
    "histórico governador ciro ativo"
  )) as Linha
  afirmar(historicoGovAtivoCiro.candidato_id === IDS.ciroGomesGovCe, "histórico alvo pertence ao ciro-gomes-gov-ce")
  afirmar(historicoGovAtivoCiro.cargo_canonico === "Governador" && historicoGovAtivoCiro.estado === "CE", "histórico alvo é Governador CE")

  const legCiroMorto = (await pegar(
    supabase.from("legislacao_mandato_executivo").select("*").eq("candidato_id", IDS.ciroGomes),
    "legislação ciro morto"
  )) as Linha[]
  const legCiroAtivo = (await pegar(
    supabase.from("legislacao_mandato_executivo").select("identificador_fonte").eq("candidato_id", IDS.ciroGomesGovCe),
    "legislação ciro ativo"
  )) as Linha[]
  const idsAtivoCiro = new Set(legCiroAtivo.map((l) => l.identificador_fonte))
  const legCiroParaMigrar = legCiroMorto.filter((l) => !idsAtivoCiro.has(l.identificador_fonte))
  afirmar(legCiroParaMigrar.length === 5, `ciro: esperava 5 atos únicos, veio ${legCiroParaMigrar.length}`)
  for (const lei of legCiroParaMigrar) {
    afirmar(lei.historico_politico_id === IDS.ciroHistoricoGovMorto, `ato ${String(lei.id)} aponta para histórico inesperado`)
    afirmar(lei.esfera === "estadual" && lei.uf_norma === "CE", `ato ${String(lei.id)} fora do escopo estadual CE`)
  }
  const payloadsLegCiro = legCiroParaMigrar.map((lei) => ({
    candidato_id: IDS.ciroGomesGovCe,
    historico_politico_id: IDS.ciroHistoricoGovAtivo,
    tipo_relacao: lei.tipo_relacao,
    esfera: lei.esfera,
    uf_norma: lei.uf_norma,
    municipio_norma: lei.municipio_norma,
    tipo_norma: lei.tipo_norma,
    numero: lei.numero,
    ano: lei.ano,
    data_norma: lei.data_norma,
    ementa: lei.ementa,
    signatario: lei.signatario,
    autoridade_papel: lei.autoridade_papel,
    fonte_primaria_url: lei.fonte_primaria_url,
    fonte_primaria_titulo: lei.fonte_primaria_titulo,
    fonte_tramitacao_url: lei.fonte_tramitacao_url,
    identificador_fonte: lei.identificador_fonte,
    metadata: {
      ...(typeof lei.metadata === "object" && lei.metadata !== null ? (lei.metadata as Record<string, unknown>) : {}),
      ...proveniencia("ciro-gomes", lei.id as string),
    },
  }))
  for (const lei of payloadsLegCiro) console.log(`[legislação] ciro: ${String(lei.tipo_norma)} ${String(lei.numero)}/${String(lei.ano)} -> ciro-gomes-gov-ce`)
  if (APLICAR) {
    const inseridos = await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "legislacao_mandato_executivo",
        motivo: "migra ato do mandato executivo que so existia no registro duplicado morto do Ciro Gomes",
        recorte: `${payloadsLegCiro.length} ato(s) para ${IDS.ciroGomesGovCe}`,
      },
      () => supabase.from("legislacao_mandato_executivo").insert(payloadsLegCiro).select("id")
    )
    console.log(`  inseridos: ${(inseridos as Linha[]).length}`)
  }

  // ── T1e: patrimônio e financiamento 2018 do Ciro (anos ausentes no ativo) ──
  const patrimonio2018 = (await pegar(
    supabase.from("patrimonio").select("*").eq("id", IDS.patrimonioCiro2018).single(),
    "patrimônio ciro 2018"
  )) as Linha
  const financiamento2018 = (await pegar(
    supabase.from("financiamento").select("*").eq("id", IDS.financiamentoCiro2018).single(),
    "financiamento ciro 2018"
  )) as Linha
  const existentes2018 = await pegar(
    supabase.from("patrimonio").select("id").eq("candidato_id", IDS.ciroGomesGovCe).eq("ano_eleicao", 2018),
    "patrimônio 2018 no ativo"
  )
  const existentesFin2018 = await pegar(
    supabase.from("financiamento").select("id").eq("candidato_id", IDS.ciroGomesGovCe).eq("ano_eleicao", 2018),
    "financiamento 2018 no ativo"
  )
  afirmar((existentes2018 as Linha[]).length === 0, "ativo já tem patrimônio 2018")
  afirmar((existentesFin2018 as Linha[]).length === 0, "ativo já tem financiamento 2018")
  console.log(`[patrimônio] ciro 2018 (R$ ${String(patrimonio2018.valor_total)}) -> ciro-gomes-gov-ce`)
  console.log(`[financiamento] ciro 2018 (R$ ${String(financiamento2018.total_arrecadado)}) -> ciro-gomes-gov-ce`)
  if (APLICAR) {
    await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "patrimonio",
        motivo: "migra o patrimonio de 2018 do registro morto, ano ausente no registro ativo do Ciro Gomes",
        recorte: `1 linha de 2018 para ${IDS.ciroGomesGovCe}`,
      },
      () =>
        supabase.from("patrimonio").insert({
        candidato_id: IDS.ciroGomesGovCe,
        ano_eleicao: patrimonio2018.ano_eleicao,
        valor_total: patrimonio2018.valor_total,
        bens: patrimonio2018.bens,
        fonte: patrimonio2018.fonte,
      }).select("id")
    )
    await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "financiamento",
        motivo: "migra o financiamento de 2018 do registro morto, ano ausente no registro ativo do Ciro Gomes",
        recorte: `1 linha de 2018 para ${IDS.ciroGomesGovCe}`,
      },
      () =>
        supabase.from("financiamento").insert({
        candidato_id: IDS.ciroGomesGovCe,
        ano_eleicao: financiamento2018.ano_eleicao,
        total_arrecadado: financiamento2018.total_arrecadado,
        total_fundo_partidario: financiamento2018.total_fundo_partidario,
        total_fundo_eleitoral: financiamento2018.total_fundo_eleitoral,
        total_pessoa_fisica: financiamento2018.total_pessoa_fisica,
        total_recursos_proprios: financiamento2018.total_recursos_proprios,
        maiores_doadores: financiamento2018.maiores_doadores,
        fonte: financiamento2018.fonte,
      }).select("id")
    )
    console.log("  inseridos")
  }

  // ── T2: arquivamento dos registros mortos ──
  const mortos = (await pegar(
    supabase
      .from("candidatos")
      .select("id, slug, status, publicavel")
      .in("id", [IDS.tarcisio, IDS.ciroGomes, IDS.fernandoHaddad]),
    "registros mortos"
  )) as Linha[]
  for (const morto of mortos) {
    afirmar(morto.publicavel === false, `${String(morto.slug)} já é publicavel=false`)
  }
  const ciro = mortos.find((m) => m.id === IDS.ciroGomes)
  afirmar(ciro !== undefined && ciro.status === "pre-candidato", "ciro-gomes deve estar como pre-candidato antes do ajuste")
  console.log("[T2] ciro-gomes: status pre-candidato -> removido (tarcisio e fernando-haddad já são removido)")
  if (APLICAR) {
    await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "candidatos",
        motivo: "arquiva o registro duplicado morto do Ciro Gomes: status pre-candidato passa a removido",
        recorte: `candidato ${IDS.ciroGomes}`,
      },
      () =>
        supabase
          .from("candidatos")
          .update({ status: "removido" })
          .eq("id", IDS.ciroGomes)
          .select("slug, status")
    )
  }

  // ── T3: cargo real de adriana-accorsi (reeleição a deputada federal) ──
  const accorsi = (await pegar(
    supabase
      .from("candidatos")
      .select("id, slug, cargo_disputado, estado, publicavel")
      .eq("id", IDS.adrianaAccorsi)
      .single(),
    "adriana-accorsi"
  )) as Linha
  afirmar(accorsi.cargo_disputado === "Governador" && accorsi.estado === "GO", "accorsi deve estar como Governador GO antes do ajuste")
  afirmar(accorsi.publicavel === false, "accorsi segue fora do ar")
  console.log("[T3] adriana-accorsi: cargo_disputado Governador -> Deputado Federal (convenção 01/08, docs/varredura-governadores-2026-08-03.md)")
  if (APLICAR) {
    await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "candidatos",
        motivo: "corrige o cargo disputado por adriana-accorsi de Governador para Deputado Federal (convencao de 01/08)",
        recorte: `candidato ${IDS.adrianaAccorsi}`,
      },
      () =>
        supabase
          .from("candidatos")
          .update({ cargo_disputado: "Deputado Federal" })
          .eq("id", IDS.adrianaAccorsi)
          .select("slug, cargo_disputado")
    )
  }

  if (APLICAR) {
    const filaDepois = await contarFila()
    console.log(`fila de revisão depois: ${filaDepois} (antes ${filaAntes}, novos ${filaDepois - filaAntes})`)
  } else {
    console.log(`\nDRY-RUN completo. Pontos=${totalPontos}, consolidação=1, posições=${payloadsPosicoes.length}, legislação ciro=${payloadsLegCiro.length}, patrimônio/financiamento=2.`)
    console.log("Rode com --apply para escrever.")
  }
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
