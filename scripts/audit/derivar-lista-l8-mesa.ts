/**
 * L8 (Mesa editorial de 29/09/2026): deriva a lista fechada versionada que o
 * gerador da migration lê. Fail-closed: nota de aplicação não tratada aqui,
 * CNJ em outra ficha, linha "não publicar" ainda pública sem tratamento ou
 * preimagem ausente abortam sem escrever nada.
 *
 * Entradas privadas (fora do repo, passadas por argumento): decisões finais,
 * decisões por CNJ e o export F5 das promessas. Estado de produção: leitura
 * REST com a service role (somente SELECT) e preimagens md5 medidas por SQL
 * somente leitura que este script emite (--emitir-sql) e depois consome
 * (--preimagens).
 *
 * Uso:
 *   node --env-file=<.env.local> --import tsx scripts/audit/derivar-lista-l8-mesa.ts \
 *     --decisoes=<decisoes-finais.json> --cnj=<cnj-decisoes.json> --f5=<F5.jsonl> \
 *     --emitir-sql=<preimagens.sql>
 *   (rodar o SQL somente leitura em produção e salvar {id: md5} em JSON)
 *   node ... --preimagens=<preimagens.json> --saida=scripts/audit/allowlist-l8-mesa-20260929.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { cnjValido, formatarCnj, tipoProcessual } from "../gerar-migration-processos-curadoria"

export const VERSAO_L8 = "20260929020000"
export const NOME_L8 = "l8_mesa_processos_promessas"
export const MARCADOR_L8 = "curadoria-mesa-l8-20260929"
export const RECORTE_L8 = "l8-mesa-20260929"
export const REVISAO_L8 = "2026-09-29"

export type Decisao =
  | "publicar"
  | "publicar_com_selo"
  | "nao_publicar"
  | "manter_oculto"
  | "sem_mudanca"
  | "resolvido_antes"

export interface DecisaoFinal {
  item_id: string
  familia: string
  candidato_slug: string | null
  decisao: Decisao
  nota_aplicacao: string | null
  cnjs_publicar: string[] | null
}

export interface CnjDecisao {
  item_id: string
  cnj: string
  tribunal: string
  classe: string
  orgao: string
  sinais?: { polos_destinatario?: string[] }
  jev?: { papel?: string }
  /** Status do próprio CNJ na recomendação (a decisão final do item pode tê-lo revertido). */
  status?: string
}

export interface RegistroF5 {
  id: string
  candidato_slug: string
  programa_chave: string
  tema_id: string
  evidencia_tipo: string
  evidencia_ref: string
  frase_id?: string | null
  vinculo_id?: string
}

/**
 * Notas de aplicação conhecidas. Cada nota em item que muda o site precisa
 * estar aqui com o texto exato; nota nova ou alterada aborta a derivação para
 * nova revisão humana.
 */
export const NOTAS_TRATADAS: Record<string, string> = {
  "F4-proc-tarcisio-gov-sp-indet":
    "publicar só 2052422-44.2025.8.26.0000; não publicar 1003777-02.2024.8.26.0562",
  "F4-proc-leandro-grass-omit-1":
    "publicar_com_selo o CNJ e corrigir o status da linha 05c04141: o TSE reverteu a inelegibilidade em maio de 2024 no RO 0602500-20.2022.6.07.0000",
  "F4-proc-tse-2026-230002549330-reexame":
    "publicar descrevendo como procedimento na Vara de Execução Penal de Boa Vista por ordem do STF (acordo de não persecução penal do 8 de janeiro, segundo a Folha BV), sem afirmar condenação",
  "F4-proc-pazolini-indet": "segredo de justiça (DJEN desde 29/09/2023), execução de ANPP: não publicar",
  "F5-par-ronaldo-caiado-13":
    "publicar como Trata do tema descrevendo Caiado como signatário (38º de 171) da PEC 9/2007, não como autor, e corrigir o tipo de projeto de lei para PEC",
}

/** Linha já publicada sem CNJ que o item "-omit-" completa (casada pela descrição na Mesa). */
export const LINHA_OMIT: Record<string, string> = {
  "F4-proc-lula-omit-1": "eb7b2f9b-9fc3-4e40-85a1-b942e18ce489",
  "F4-proc-lula-omit-2": "743b4234-5865-4c02-90a0-7ce5c4060402",
  "F4-proc-garotinho-omit-1": "da8ce4a6-f40c-4e77-b527-e237fc378b74",
  "F4-proc-victor-assis-omit-1": "17c955ab-1059-4e6d-bdd1-58c9d75f68c5",
  "F4-proc-delcidio-amaral-omit-1": "d8fdc402-1e2a-46e2-9ccd-75f2af087d7d",
  "F4-proc-leandro-grass-omit-1": "05c04141-af8a-44c0-a92b-819a2f5ce984",
}

/** Status novo por decisão da Mesa (o TSE reverteu a inelegibilidade no RO). */
export const STATUS_OMIT: Record<string, string> = {
  "F4-proc-leandro-grass-omit-1":
    "Inelegibilidade aplicada pelo TRE-DF revertida pelo TSE em maio de 2024 no recurso ordinário 0602500-20.2022.6.07.0000",
}

/** Descrição, tribunal e tipo fixados pela Mesa para CNJ cujo texto padrão do DJEN induziria erro. */
export const INSERCAO_AJUSTADA: Record<string, { descricao: string; tribunal: string; tipo: "criminal" | "civil" }> = {
  "1000060-07.2023.8.23.0010": {
    tribunal: "TJRR",
    tipo: "criminal",
    descricao:
      "O DJEN registra comunicação processual oficial no processo 1000060-07.2023.8.23.0010, procedimento na Vara de Execução Penal de Boa Vista (TJRR, sistema SEEU) aberto por ordem do STF, em que a candidata consta no polo passivo. Segundo a Folha BV, o procedimento acompanha um acordo de não persecução penal relativo aos atos de 8 de janeiro de 2023. Acordo de não persecução penal não é condenação, e a publicação não informa pena nem culpa.",
  },
}

/** Linhas públicas hoje que a Mesa decidiu não publicar: saem do site pelo código, sem escrita no banco. */
export const OCULTAR_NO_SITE: Record<string, { processo_id: string; motivo: string }> = {
  "2002493-39.2023.8.08.0024": {
    processo_id: "dd836992-ab4c-45fd-bc04-8b7b5b1750ac",
    motivo: "segredo de justiça no DJEN desde 29/09/2023 (execução de ANPP); decisão da Mesa L8",
  },
}

/**
 * Veto da conferência sobre CNJ que já está público por lote anterior, sem nota
 * de aplicação: não sai sem decisão nominal. Fica listado e sem ação.
 */
export const VETO_PUBLICO_PENDENTE: Record<string, string> = {
  "8066507-80.2023.8.05.0001": "F4-proc-jeronimo-indet",
}

/** Autoria corrigida pela Mesa em projetos_lei usados como evidência de promessa. */
export const AUTORIA_PROJETO: Record<string, { papel: "signatario"; ordem: number; total: number }> = {
  "F5-par-ronaldo-caiado-13": { papel: "signatario", ordem: 38, total: 171 },
}

export const MOTIVO_PUBLICAR = "Mesa L8 de 29/09/2026: vínculo publicado como \"Trata do tema\" após revisão editorial."
export const MOTIVO_DESPUBLICAR = "Mesa L8 de 29/09/2026: vínculo retirado da ficha após revisão editorial."
export const REVISADO_POR = MARCADOR_L8

const digitos = (valor: string) => valor.replace(/\D/g, "")

export interface EstadoProducao {
  candidatos: Map<string, string>
  processosPorCnj: Map<string, Array<{ id: string; candidato_id: string; numero_processo: string }>>
  processosPorId: Map<string, { id: string; candidato_id: string; numero_processo: string | null }>
  compromissos: Array<{
    id: string
    candidato_id: string
    programa_chave: string
    frase_id: string | null
    tema_id: string | null
    tipo_evidencia: string
    evidencia_ref: string
    relacao: string
    verificado: boolean
  }>
  compromissosPublicos: Set<string>
  projetos: Map<string, { id: string; candidato_id: string; tipo: string | null }>
}

export interface Pendencia {
  tabela: "processos" | "compromisso_evidencia" | "projetos_lei"
  id: string
}

export function cnjsDoItem(item: DecisaoFinal): string[] {
  const nota = item.nota_aplicacao ?? ""
  const somente = nota.match(/^publicar só (\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/)
  const lista = somente ? [somente[1]] : (item.cnjs_publicar ?? [])
  for (const cnj of lista) if (!cnjValido(cnj)) throw new Error(`${item.item_id}: CNJ invalido ${cnj}`)
  return lista.map(formatarCnj)
}

export function conferirNotas(decisoes: DecisaoFinal[]): void {
  const mudam = new Set<Decisao>(["publicar", "publicar_com_selo", "nao_publicar"])
  for (const item of decisoes) {
    if (!item.nota_aplicacao || !mudam.has(item.decisao)) continue
    if (item.familia === "identidade") continue // fora do escopo deste lote (gate de identidade próprio)
    const esperado = NOTAS_TRATADAS[item.item_id]
    if (esperado === undefined) throw new Error(`${item.item_id}: nota de aplicação sem tratamento: ${item.nota_aplicacao}`)
    if (esperado !== item.nota_aplicacao) throw new Error(`${item.item_id}: nota de aplicação mudou; revisar o tratamento`)
  }
}

function poloDe(registro: CnjDecisao): "A" | "P" | null {
  const polos = [...new Set(registro.sinais?.polos_destinatario ?? [])].filter((p) => p === "A" || p === "P")
  if (polos.length === 1) return polos[0] as "A" | "P"
  if (polos.length === 0) return null
  if (registro.jev?.papel === "parte_ativa") return "A"
  if (registro.jev?.papel === "parte_passiva") return "P"
  throw new Error(`${registro.item_id}/${registro.cnj}: polo ambiguo sem papel`)
}

export function derivar(
  decisoes: DecisaoFinal[],
  cnjDecisoes: CnjDecisao[],
  f5: Map<string, RegistroF5>,
  estado: EstadoProducao,
  preimagens: Record<string, string> | null,
) {
  conferirNotas(decisoes)
  const pendencias: Pendencia[] = []
  const md5 = (tabela: Pendencia["tabela"], id: string): string => {
    pendencias.push({ tabela, id })
    const valor = preimagens?.[id]
    if (preimagens && !/^[0-9a-f]{32}$/.test(valor ?? "")) throw new Error(`${tabela}/${id}: preimagem ausente`)
    return valor ?? ""
  }
  const candidato = (slug: string): string => {
    const id = estado.candidatos.get(slug)
    if (!id) throw new Error(`${slug}: ficha ausente em producao`)
    return id
  }

  // ---------- processos ----------
  const proc = decisoes.filter((d) => d.familia === "processos")
  const publicados = new Map<string, string[]>() // slug|cnj -> item_ids
  const completar: Array<Record<string, unknown>> = []
  for (const item of proc) {
    if (item.decisao !== "publicar" && item.decisao !== "publicar_com_selo") continue
    const slug = item.candidato_slug!
    const cnjs = cnjsDoItem(item)
    if (item.item_id.includes("-omit-")) {
      if (cnjs.length !== 1) throw new Error(`${item.item_id}: omit exige um CNJ`)
      const jaExistentes = estado.processosPorCnj.get(digitos(cnjs[0])) ?? []
      if (jaExistentes.length && !LINHA_OMIT[item.item_id]) {
        // O CNJ já entrou por outro lote na mesma ficha: nada a completar.
        const chave = `${slug}|${cnjs[0]}`
        publicados.set(chave, [...(publicados.get(chave) ?? []), item.item_id])
        continue
      }
      const linhaId = LINHA_OMIT[item.item_id]
      if (!linhaId) throw new Error(`${item.item_id}: linha omit sem mapeamento`)
      const linha = estado.processosPorId.get(linhaId)
      if (!linha || linha.candidato_id !== candidato(slug) || linha.numero_processo !== null) {
        throw new Error(`${item.item_id}: linha ${linhaId} ausente, de outra ficha ou ja com CNJ`)
      }
      if ((estado.processosPorCnj.get(digitos(cnjs[0])) ?? []).length) throw new Error(`${cnjs[0]}: ja existe em producao`)
      completar.push({
        item_id: item.item_id,
        decisao: item.decisao,
        processo_id: linhaId,
        slug,
        candidato_id: linha.candidato_id,
        numero_cnj: cnjs[0],
        status_novo: STATUS_OMIT[item.item_id] ?? null,
        preimage_md5: md5("processos", linhaId),
      })
      continue
    }
    for (const cnj of cnjs) {
      const chave = `${slug}|${cnj}`
      publicados.set(chave, [...(publicados.get(chave) ?? []), item.item_id])
    }
  }

  const inserir: Array<Record<string, unknown>> = []
  const noopProcessos: Array<Record<string, unknown>> = []
  for (const [chave, itens] of [...publicados.entries()].sort()) {
    const [slug, cnj] = chave.split("|")
    const candidatoId = candidato(slug)
    const existentes = estado.processosPorCnj.get(digitos(cnj)) ?? []
    if (existentes.some((p) => p.candidato_id !== candidatoId)) throw new Error(`${cnj}: vinculado a outra ficha`)
    if (existentes.length) {
      noopProcessos.push({ slug, numero_cnj: cnj, processo_id: existentes[0].id })
      continue
    }
    const registro = cnjDecisoes.find((r) => itens.includes(r.item_id) && formatarCnj(r.cnj) === cnj)
    if (!registro) throw new Error(`${cnj}: sem registro no cnj-decisoes`)
    const polo = poloDe(registro)
    const papel = registro.jev?.papel ?? ""
    if (polo === null && papel !== "parte_ativa" && papel !== "parte_passiva") throw new Error(`${cnj}: sem polo e sem papel`)
    const ajuste = INSERCAO_AJUSTADA[cnj]
    inserir.push({
      slug,
      candidato_id: candidatoId,
      numero_cnj: cnj,
      tribunal: registro.tribunal,
      classe: registro.classe,
      orgao: registro.orgao,
      polo,
      papel,
      tipo: tipoProcessual(registro.classe, ""),
      decisao_ref: [...itens].sort().join(","),
      ...(ajuste ? { ajuste } : {}),
    })
  }
  for (const cnj of Object.keys(INSERCAO_AJUSTADA)) {
    if (!inserir.some((l) => l.numero_cnj === cnj)) throw new Error(`${cnj}: ajuste sem insercao correspondente`)
  }

  // "não publicar" ainda público: só sai se estiver tratado em OCULTAR_NO_SITE.
  const ocultar: Array<Record<string, unknown>> = []
  const itensPorId = new Map(proc.map((d) => [d.item_id, d]))
  const conferidos = new Set<string>()
  const conflitos: string[] = []
  const jaPublicos: Array<Record<string, unknown>> = []
  const pendentes: Array<Record<string, unknown>> = []
  for (const registro of cnjDecisoes) {
    const item = itensPorId.get(registro.item_id)
    if (!item || (item.decisao !== "nao_publicar" && item.decisao !== "manter_oculto")) continue
    const cnj = formatarCnj(registro.cnj)
    const slug = item.candidato_slug!
    if (publicados.has(`${slug}|${cnj}`) || conferidos.has(`${slug}|${cnj}`)) continue
    conferidos.add(`${slug}|${cnj}`)
    const candidatoId = estado.candidatos.get(slug)
    const existentes = (estado.processosPorCnj.get(digitos(cnj)) ?? []).filter((p) => p.candidato_id === candidatoId)
    if (!existentes.length) continue
    const tratamento = OCULTAR_NO_SITE[cnj]
    const semMudanca = proc.some((d) => d.candidato_slug === slug && d.decisao === "sem_mudanca"
      && cnjDecisoes.some((r) => r.item_id === d.item_id && formatarCnj(r.cnj) === cnj))
    if (semMudanca && !tratamento) continue
    if (!tratamento && VETO_PUBLICO_PENDENTE[cnj] === item.item_id) {
      pendentes.push({ item_id: item.item_id, slug, numero_cnj: cnj, processo_id: existentes[0].id })
      continue
    }
    if (!tratamento && registro.status !== "publicar") {
      // Publicado por lote anterior com identidade própria; o "não publicar" do L8
      // só registra que a evidência deste lote não confirmou. Sem ação, listado.
      jaPublicos.push({ item_id: item.item_id, slug, numero_cnj: cnj, processo_id: existentes[0].id })
      continue
    }
    if (!tratamento || tratamento.processo_id !== existentes[0].id) {
      conflitos.push(`${slug}/${cnj} (${item.item_id}, ${item.decisao}, linha ${existentes[0].id})`)
      continue
    }
    ocultar.push({ item_id: item.item_id, slug, numero_cnj: cnj, processo_id: tratamento.processo_id, motivo: tratamento.motivo })
  }
  if (conflitos.length) throw new Error(`publico hoje e decisao de nao publicar sem tratamento: ${conflitos.join("; ")}`)
  for (const cnj of Object.keys(OCULTAR_NO_SITE)) {
    if (!ocultar.some((l) => l.numero_cnj === cnj)) throw new Error(`${cnj}: ocultacao sem decisao correspondente`)
  }

  // ---------- promessas ----------
  const prom = decisoes.filter((d) => d.familia === "promessas")
  const porLinha = new Map<string, { chave: RegistroF5; itens: string[]; decisoes: Set<Decisao> }>()
  for (const item of prom) {
    const reg = f5.get(item.item_id)
    if (!reg) throw new Error(`${item.item_id}: ausente no F5`)
    if (reg.frase_id) throw new Error(`${item.item_id}: frase_id nao suportado neste lote`)
    const chave = [reg.programa_chave, reg.tema_id, reg.evidencia_tipo, reg.evidencia_ref].join("|")
    const atual = porLinha.get(chave) ?? { chave: reg, itens: [], decisoes: new Set<Decisao>() }
    atual.itens.push(item.item_id)
    atual.decisoes.add(item.decisao)
    porLinha.set(chave, atual)
  }
  const verificar: Array<Record<string, unknown>> = []
  const inserirProm: Array<Record<string, unknown>> = []
  const despublicar: Array<Record<string, unknown>> = []
  let noopProm = 0
  for (const { chave, itens, decisoes: ds } of [...porLinha.values()].sort((a, b) => a.itens[0].localeCompare(b.itens[0]))) {
    if (ds.size !== 1) throw new Error(`${itens.join(",")}: decisoes divergentes para o mesmo vinculo`)
    const decisao = [...ds][0]
    const candidatoId = candidato(chave.candidato_slug)
    const linha = estado.compromissos.find((e) => e.programa_chave === chave.programa_chave && e.frase_id === null
      && e.tema_id === chave.tema_id && e.tipo_evidencia === chave.evidencia_tipo && e.evidencia_ref === chave.evidencia_ref)
    if (linha && linha.candidato_id !== candidatoId) throw new Error(`${itens.join(",")}: vinculo de outra ficha`)
    if (chave.vinculo_id && linha && linha.id !== chave.vinculo_id) throw new Error(`${itens.join(",")}: vinculo_id divergente`)
    const publico = linha ? estado.compromissosPublicos.has(linha.id) : false
    const base = { item_ids: itens.sort(), slug: chave.candidato_slug, candidato_id: candidatoId }
    if (decisao === "publicar") {
      if (publico) { noopProm += 1; continue }
      if (linha) {
        if (!["sustenta", "relacionada"].includes(linha.relacao)) throw new Error(`${itens.join(",")}: relacao ${linha.relacao}`)
        verificar.push({ ...base, id: linha.id, preimage_md5: md5("compromisso_evidencia", linha.id) })
      } else {
        inserirProm.push({ ...base, programa_chave: chave.programa_chave, tema_id: chave.tema_id,
          tipo_evidencia: chave.evidencia_tipo, evidencia_ref: chave.evidencia_ref })
      }
    } else if (decisao === "nao_publicar") {
      if (publico && linha) despublicar.push({ ...base, id: linha.id, preimage_md5: md5("compromisso_evidencia", linha.id) })
      else noopProm += 1
    } else if (decisao === "manter_oculto") {
      if (publico) throw new Error(`${itens.join(",")}: manter_oculto mas publico hoje`)
      noopProm += 1
    } else if (decisao === "sem_mudanca") {
      noopProm += 1
    } else {
      throw new Error(`${itens.join(",")}: decisao ${decisao} inesperada em promessas`)
    }
  }

  const autoria: Array<Record<string, unknown>> = []
  for (const [itemId, dados] of Object.entries(AUTORIA_PROJETO)) {
    const reg = f5.get(itemId)
    if (!reg || reg.evidencia_tipo !== "projeto_lei") throw new Error(`${itemId}: autoria sem projeto_lei`)
    const projeto = estado.projetos.get(reg.evidencia_ref)
    if (!projeto) throw new Error(`${itemId}: projeto ${reg.evidencia_ref} ausente`)
    if (projeto.tipo !== "PEC") throw new Error(`${itemId}: projeto nao esta como PEC; tratar o tipo antes`)
    autoria.push({ item_id: itemId, id: projeto.id, candidato_id: projeto.candidato_id, ...dados,
      preimage_md5: md5("projetos_lei", projeto.id) })
  }

  const fichasInsercao = new Set(inserir.map((l) => l.slug as string))
  const contagens = {
    processos_inserir: inserir.length,
    processos_fichas_inserir: fichasInsercao.size,
    processos_completar_cnj: completar.length,
    processos_status_corrigido: completar.filter((l) => l.status_novo).length,
    processos_noop_ja_publicos: noopProcessos.length,
    processos_ocultar_no_site: ocultar.length,
    processos_nao_publicar_ja_publicos_sem_acao: jaPublicos.length,
    processos_veto_publico_pendente_decisao: pendentes.length,
    promessas_verificar: verificar.length,
    promessas_inserir: inserirProm.length,
    promessas_despublicar: despublicar.length,
    promessas_noop: noopProm,
    projetos_autoria: autoria.length,
    candidate_changes_esperados: inserir.length + completar.filter((l) => l.status_novo).length,
  }
  return {
    pendencias,
    lista: {
      versao: VERSAO_L8,
      marcador: MARCADOR_L8,
      revisao_em: REVISAO_L8,
      contagens,
      processos: { inserir, completar_cnj: completar, noop_ja_publicos: noopProcessos, ocultar_no_site: ocultar,
        nao_publicar_ja_publicos_sem_acao: jaPublicos, veto_publico_pendente_decisao: pendentes },
      promessas: { verificar, inserir: inserirProm, despublicar },
      projetos_lei: { autoria },
      motivos: { publicar: MOTIVO_PUBLICAR, despublicar: MOTIVO_DESPUBLICAR, revisado_por: REVISADO_POR },
    },
  }
}

export function allowlistGate(lista: ReturnType<typeof derivar>["lista"]) {
  const inserir = lista.processos.inserir as Array<{ slug: string }>
  const slugs = [...new Set(inserir.map((l) => l.slug))].sort()
  const camposProcesso = ["candidato_id", "tipo", "tribunal", "numero_processo", "descricao", "status",
    "data_inicio", "data_decisao", "gravidade", "fonte", "url_fonte"]
  return {
    _comentario:
      "LOTE APROVADO PELA MESA E NAO APLICADO. A allowlist autoriza as escritas nominais da migration L8 e carrega a lista fechada que o gerador le; aplicar continua sendo ato externo separado. Regenerar com scripts/audit/derivar-lista-l8-mesa.ts.",
    recorte: RECORTE_L8,
    migration: `${VERSAO_L8}_${NOME_L8}.sql`,
    fonte: "DJEN/CNJ (Comunica PJe), DataJud, TSE, Câmara dos Deputados e decisões da Mesa editorial L8 de 29/09/2026.",
    coorte: slugs,
    fora_por_construcao: { slugs: [] as string[] },
    entries: slugs.map((slug) => ({
      tabela: "processos",
      slug,
      campos: camposProcesso,
      max_registros: inserir.filter((l) => l.slug === slug).length,
    })),
    referencias: [
      { tabela: "processos", ref: MARCADOR_L8, campos: ["numero_processo", "status"] },
      { tabela: "compromisso_evidencia", ref: MARCADOR_L8,
        campos: ["candidato_id", "programa_chave", "frase_id", "tema_id", "tipo_evidencia", "evidencia_ref",
          "relacao", "origem", "probabilidade", "verificado", "revisado_por", "revisado_em", "motivo", "updated_at"] },
      { tabela: "projetos_lei", ref: MARCADOR_L8, campos: ["metadata"] },
      { tabela: "coleta_log", ref: `migration:${VERSAO_L8}`,
        campos: ["fonte", "escopo", "alvo", "candidato_id", "resultado", "volume", "detalhe", "url", "execucao", "natureza"] },
    ],
    lista_fechada: lista,
  }
}

export function sqlPreimagens(pendencias: Pendencia[]): string {
  const por = (tabela: Pendencia["tabela"]) => pendencias.filter((p) => p.tabela === tabela).map((p) => `'${p.id}'::uuid`)
  const partes = (["processos", "compromisso_evidencia", "projetos_lei"] as const)
    .filter((t) => por(t).length)
    .map((t) => `SELECT id::text, md5(to_jsonb(x)::text) AS m FROM public.${t} x WHERE id IN (${por(t).join(", ")})`)
  return `-- somente leitura: preimagens md5 das linhas que a migration L8 altera\nSET TIME ZONE 'UTC';\nSELECT json_object_agg(id, m) AS preimagens FROM (\n  ${partes.join("\n  UNION ALL\n  ")}\n) t;\n`
}

async function lerEstado(slugs: string[], programas: string[], projetos: string[]): Promise<EstadoProducao> {
  const { supabase } = await import("../lib/supabase")
  const tudo = async <T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
    const saida: T[] = []
    for (let de = 0; ; de += 1000) {
      const { data, error } = await consulta(de, de + 999)
      if (error) throw new Error(`leitura REST falhou: ${JSON.stringify(error)}`)
      saida.push(...(data ?? []))
      if (!data || data.length < 1000) return saida
    }
  }
  const candidatos = await tudo<{ id: string; slug: string }>((de, ate) =>
    supabase.from("candidatos").select("id,slug").in("slug", slugs).order("id").range(de, ate))
  const processos = await tudo<{ id: string; candidato_id: string; numero_processo: string | null }>((de, ate) =>
    supabase.from("processos").select("id,candidato_id,numero_processo").order("id").range(de, ate))
  const compromissos = await tudo<EstadoProducao["compromissos"][number]>((de, ate) =>
    supabase.from("compromisso_evidencia")
      .select("id,candidato_id,programa_chave,frase_id,tema_id,tipo_evidencia,evidencia_ref,relacao,verificado")
      .in("programa_chave", programas).order("id").range(de, ate))
  const publicos = await tudo<{ id: string }>((de, ate) =>
    supabase.from("compromisso_evidencia_publica").select("id").in("programa_chave", programas).order("id").range(de, ate))
  const projetosRows = await tudo<{ id: string; candidato_id: string; tipo: string | null }>((de, ate) =>
    supabase.from("projetos_lei").select("id,candidato_id,tipo").in("id", projetos).order("id").range(de, ate))
  const porCnj = new Map<string, Array<{ id: string; candidato_id: string; numero_processo: string }>>()
  for (const p of processos) {
    if (!p.numero_processo) continue
    const d = digitos(p.numero_processo)
    porCnj.set(d, [...(porCnj.get(d) ?? []), { ...p, numero_processo: p.numero_processo }])
  }
  return {
    candidatos: new Map(candidatos.map((c) => [c.slug, c.id])),
    processosPorCnj: porCnj,
    processosPorId: new Map(processos.map((p) => [p.id, p])),
    compromissos,
    compromissosPublicos: new Set(publicos.map((p) => p.id)),
    projetos: new Map(projetosRows.map((p) => [p.id, p])),
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const valor = (nome: string) => args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
  const [decisoesPath, cnjPath, f5Path] = [valor("decisoes"), valor("cnj"), valor("f5")]
  if (!decisoesPath || !cnjPath || !f5Path) throw new Error("--decisoes, --cnj e --f5 sao obrigatorios")
  const decisoes = JSON.parse(readFileSync(resolve(decisoesPath), "utf8")) as DecisaoFinal[]
  const cnjDecisoes = JSON.parse(readFileSync(resolve(cnjPath), "utf8")) as CnjDecisao[]
  const f5 = new Map(readFileSync(resolve(f5Path), "utf8").split("\n").filter(Boolean)
    .map((l) => JSON.parse(l) as RegistroF5).map((r) => [r.id, r]))
  const slugs = [...new Set(decisoes.filter((d) => d.familia === "processos" || d.familia === "promessas")
    .map((d) => d.candidato_slug).filter((s): s is string => Boolean(s)))]
  const promessas = decisoes.filter((d) => d.familia === "promessas").map((d) => f5.get(d.item_id)).filter(Boolean) as RegistroF5[]
  const programas = [...new Set(promessas.map((r) => r.programa_chave))]
  const projetos = Object.keys(AUTORIA_PROJETO).map((id) => f5.get(id)?.evidencia_ref).filter((x): x is string => Boolean(x))
  const estado = await lerEstado(slugs, programas, projetos)
  const emitir = valor("emitir-sql")
  const preimagensPath = valor("preimagens")
  if (emitir) {
    const { pendencias } = derivar(decisoes, cnjDecisoes, f5, estado, null)
    writeFileSync(resolve(emitir), sqlPreimagens(pendencias))
    console.log(`SQL de preimagens: ${pendencias.length} linhas -> ${emitir}`)
    return
  }
  if (!preimagensPath) throw new Error("--preimagens (ou --emitir-sql) e obrigatorio")
  const bruto = JSON.parse(readFileSync(resolve(preimagensPath), "utf8")) as Record<string, string> | { preimagens: Record<string, string> }
  const preimagens = "preimagens" in bruto && typeof bruto.preimagens === "object" ? bruto.preimagens : bruto as Record<string, string>
  const { lista } = derivar(decisoes, cnjDecisoes, f5, estado, preimagens)
  const saida = valor("saida") ?? `scripts/audit/allowlist-${RECORTE_L8}.json`
  writeFileSync(resolve(saida), `${JSON.stringify(allowlistGate(lista), null, 2)}\n`)
  console.log(JSON.stringify(lista.contagens))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  })
}
