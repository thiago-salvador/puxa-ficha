import { createHash } from "node:crypto"
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import type { EvidenciaFinal, ItemFinal } from "./validar-revisao-final-processos"

export function exigirItemFinal(
  finalPorCnj: ReadonlyMap<string, ItemFinal>,
  cnj: string,
  origem: string,
): ItemFinal {
  const final = finalPorCnj.get(cnj)
  if (!final) throw new Error(`${cnj}: ausente na decisao final (${origem})`)
  return final
}

type Registro = Record<string, unknown>

function argumento(nome: string, padrao: string): string {
  const prefixo = `--${nome}=`
  return resolve(process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? padrao)
}

function lerJson(caminho: string): unknown {
  return JSON.parse(readFileSync(caminho, "utf8")) as unknown
}

function objeto(valor: unknown, caminho: string): Registro {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Error(`${caminho}: objeto obrigatorio`)
  return valor as Registro
}

function array(valor: unknown, caminho: string): Registro[] {
  if (!Array.isArray(valor)) throw new Error(`${caminho}: array obrigatorio`)
  return valor as Registro[]
}

function hash(caminho: string): string {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex")
}

function semTravoes(valor: unknown): unknown {
  if (typeof valor === "string") return valor.replace(/[—–]/g, "-")
  if (Array.isArray(valor)) return valor.map(semTravoes)
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, semTravoes(item)]))
  }
  return valor
}

function fontes(valor: unknown, fallback?: string): ItemFinal["fontes_oficiais"] {
  const recebidas = Array.isArray(valor) ? valor as Registro[] : []
  const saida = recebidas.map((fonte) => ({
    url: String(fonte.url ?? ""),
    titulo: String(fonte.titulo ?? "Fonte processual oficial"),
    consultado_em: typeof fonte.consultado_em === "string" ? fonte.consultado_em : null,
  })).filter((fonte) => fonte.url.startsWith("https://"))
  if (saida.length === 0 && fallback?.startsWith("https://")) {
    saida.push({ url: fallback, titulo: "Comunicação processual oficial", consultado_em: null })
  }
  return saida
}

function categoriaDescarte(revisao: Registro, base: Registro): string | null {
  const motivo = `${String(revisao.observacoes ?? "")} ${String(revisao.motivo ?? base.motivo ?? "")} ${JSON.stringify(base.duplicidade ?? {})}`.toLowerCase()
  if (/hom[oô]nim|erro de identidade|identidade eleitoral incompat[ií]vel/.test(motivo)) return "homonimo"
  if (/duplicat|duplicidade real|mesmo n[uú]cleo f[aá]tico|contaria o mesmo caso|processo j[aá] identificado/.test(motivo)) return "duplicata_real"
  if (/terceir|n[aã]o aparece como parte|apenas menciona|sem v[ií]nculo pessoal/.test(motivo)) return "terceiro"
  if (/autoridade nominal|autoridade institucional|representante legal|apenas pela fun[cç][aã]o|inclus[aã]o apenas pela fun[cç][aã]o/.test(motivo)) return "autoridade_nominal"
  if (/associa[cç][aã]o incorreta|retirada? do polo|exclu[ií]d[oa] do polo|ilegitimidade passiva|intimad[oa] por equ[ií]voco|n[aã]o poderia figurar/.test(motivo)) return "associacao_incorreta"
  const autorOuVitima = /autor|v[ií]tima|querelante|impetrante|representa[cç][aã]o criminal|queixa-crime/.test(motivo)
  const semFatoAdverso = /sem fato adverso|n[aã]o h[aá] acusa[cç][aã]o|n[aã]o cont[eé]m imputa[cç][aã]o|n[aã]o [ée] alvo|n[aã]o investigad|n[aã]o representa passivo|n[aã]o se trata de passivo|n[aã]o [ée] imputac[aã]o|n[aã]o aponta il[ií]cito/.test(motivo)
  if (autorOuVitima && semFatoAdverso) return "autor_vitima_sem_fato_adverso"
  return null
}

function estadoBase(base: Registro): string {
  const datajud = objeto(base.datajud ?? {}, `datajud.${String(base.numero_cnj)}`)
  if (datajud.status === "erro") return `Estado oficial atual não confirmado. DataJud: ${String(datajud.motivo ?? "erro sem detalhe")}`
  return `Estado oficial registrado na triagem: ${JSON.stringify(datajud)}`
}

function itemFinal(
  base: Registro,
  revisao: Registro,
  origemRevisao: string,
  overrides: Partial<ItemFinal> = {},
): ItemFinal {
  const decisao = String(overrides.decisao ?? revisao.decisao ?? "")
  return {
    numero_cnj: String(base.numero_cnj),
    slug: String(base.slug),
    decisao,
    motivo: String(overrides.motivo ?? revisao.motivo ?? base.motivo ?? ""),
    familia_processual: String(overrides.familia_processual ?? revisao.familia_processual ?? base.classe ?? "família não especificada"),
    fontes_oficiais: overrides.fontes_oficiais ?? fontes(revisao.fontes_oficiais, String(base.fonte_oficial || base.url || "")),
    bloqueio: overrides.bloqueio !== undefined
      ? overrides.bloqueio
      : decisao === "bloqueado_concreto"
        ? String(revisao.bloqueio ?? revisao.limitacoes ?? revisao.motivo ?? "bloqueio oficial não detalhado")
        : null,
    origem_revisao: origemRevisao,
    identidade_confirmada: overrides.identidade_confirmada !== undefined
      ? overrides.identidade_confirmada
      : typeof revisao.identidade_confirmada === "boolean"
        ? revisao.identidade_confirmada
        : null,
    contexto_identidade: String(overrides.contexto_identidade ?? revisao.contexto_identidade ?? base.contexto_identidade ?? "Contexto de identidade não registrado no artefato de origem."),
    papel_processual: String(overrides.papel_processual ?? revisao.papel_processual ?? base.motivo ?? "Papel processual não registrado no artefato de origem."),
    estado_oficial: String(overrides.estado_oficial ?? revisao.estado_oficial ?? estadoBase(base)),
    observacoes: String(overrides.observacoes ?? revisao.observacoes ?? base.motivo ?? "Sem observações adicionais."),
    categoria_descarte: overrides.categoria_descarte !== undefined
      ? overrides.categoria_descarte
      : String(overrides.decisao ?? revisao.decisao ?? "") === "nao_publicar"
        ? categoriaDescarte(revisao, base)
        : null,
  }
}

export function main(): void {
  const raiz = resolve(homedir(), ".disposable-html")
  const caminhos = {
    original: argumento("original", `${raiz}/2026-08-05-puxa-ficha-processos-curadoria.evidence.json`),
    review: argumento("review", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-editorial.json`),
    lote1: argumento("lote1", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.lote-1.json`),
    lote2: argumento("lote2", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.lote-2.json`),
    lote3: argumento("lote3", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.lote-3.json`),
    processos6: argumento("processos6", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.processos-6.json`),
    pontos6: argumento("pontos6", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.pontos-6.json`),
    descartes86: argumento("descartes86", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.descartes-86.json`),
    readback: argumento("readback", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.supabase-readback.json`),
    draft: argumento("draft", `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.draft.json`),
  }

  const review = objeto(lerJson(caminhos.review), "review")
  const baseItens = array(review.itens, "review.itens")
  const lotesBrutos = [caminhos.lote1, caminhos.lote2, caminhos.lote3].map((caminho) => {
    const bruto = lerJson(caminho)
    return array(Array.isArray(bruto) ? bruto : objeto(bruto, caminho).itens, `${caminho}.itens`)
  })
  const lotes = lotesBrutos.flat()
  const lotePorCnj = new Map(lotes.map((item) => [String(item.numero_cnj), item]))
  const processos6 = array(objeto(lerJson(caminhos.processos6), "processos6").itens, "processos6.itens")
  const processoPorCnj = new Map(processos6.map((item) => [String(item.numero_cnj), item]))
  const pontos = objeto(lerJson(caminhos.pontos6), "pontos6")
  const grupos = array(pontos.grupos, "pontos6.grupos")
  const reclassificacoes = array(pontos.reclassificacoes, "pontos6.reclassificacoes")
  const reclassificacaoPorCnj = new Map(reclassificacoes.map((item) => [String(item.numero_cnj), item]))
  const descartes86 = array(objeto(lerJson(caminhos.descartes86), "descartes86").itens, "descartes86.itens")
  const descartePorCnj = new Map(descartes86.map((item) => [String(item.numero_cnj), item]))
  const grupoPorCnj = new Map<string, Registro>()
  for (const grupo of grupos) {
    for (const cnj of arrayCnj(grupo.cnjs, `grupo.${grupo.id}.cnjs`)) grupoPorCnj.set(cnj, grupo)
  }

  const itens = baseItens.map((base) => {
    const cnj = String(base.numero_cnj)
    const lote = lotePorCnj.get(cnj)
    const processo = processoPorCnj.get(cnj)
    const grupo = grupoPorCnj.get(cnj)
    let final: ItemFinal
    if (lote) {
      const corrigirDesfechoFavoravel = cnj === "7066233-62.2023.8.22.0001" && lote.decisao === "nao_publicar"
      final = itemFinal(base, lote, corrigirDesfechoFavoravel ? "pesquisa_complementar_revisada" : "pesquisa_complementar", corrigirDesfechoFavoravel ? {
        decisao: "publicar",
        motivo: `${String(lote.motivo)} O desfecho favorável deve acompanhar a descrição com o mesmo destaque.`,
        bloqueio: null,
        categoria_descarte: null,
      } : {})
    } else if (processo) {
      final = itemFinal(base, processo, "revalidacao_publicavel", {
        identidade_confirmada: base.confianca === "alta" ? true : null,
        contexto_identidade: String(base.contexto_identidade ?? "Contexto não registrado."),
        papel_processual: String(base.motivo ?? "Papel não registrado."),
        estado_oficial: String(processo.estado_oficial ?? estadoBase(base)),
        observacoes: String(processo.motivo ?? base.motivo ?? "Sem observações adicionais."),
        categoria_descarte: String(processo.decisao) === "nao_publicar"
          ? cnj === "0031533-97.2021.8.06.0001"
            ? "autoridade_nominal"
            : categoriaDescarte(processo, base)
          : null,
      })
    } else if (grupo) {
      const status = String(grupo.status)
      const decisao = status === "aprovado" ? "ponto_atencao" : status === "rejeitado" ? "nao_publicar" : "bloqueado_concreto"
      const categoriaGrupo = status !== "rejeitado"
        ? null
        : String(grupo.id) === "cicero-transparencia-gestao"
          ? "autoridade_nominal"
          : "associacao_incorreta"
      final = itemFinal(base, grupo, "ponto_atencao_agregado", {
        decisao,
        motivo: `${String(grupo.texto)} ${String(grupo.limitacoes ?? "")}`.trim(),
        familia_processual: String(grupo.id),
        fontes_oficiais: fontes(grupo.fontes_oficiais, String(base.fonte_oficial || base.url || "")),
        bloqueio: decisao === "bloqueado_concreto" ? String(grupo.limitacoes ?? grupo.texto) : null,
        identidade_confirmada: status === "aprovado" || status === "bloqueado" ? true : null,
        contexto_identidade: String(base.contexto_identidade ?? grupo.texto),
        papel_processual: `${String(base.motivo ?? "Papel individual não detalhado.")} Avaliação agregada: ${String(grupo.titulo)}.`,
        estado_oficial: `${String(grupo.texto)} Limitações: ${String(grupo.limitacoes ?? "")}`,
        observacoes: String(grupo.limitacoes ?? grupo.texto),
        categoria_descarte: categoriaGrupo,
      })
    } else if (String(base.recomendacao) === "nao_publicar") {
      const descarte = descartePorCnj.get(cnj)
      if (!descarte) throw new Error(`${cnj}: ausente na auditoria adversarial dos 86 descartes`)
      const decisaoDescarte = String(descarte.decisao)
      final = itemFinal(base, descarte, "auditoria_adversarial_descarte", {
        identidade_confirmada: typeof descarte.identidade_confirmada === "boolean"
          ? descarte.identidade_confirmada
          : decisaoDescarte === "publicar" && base.confianca === "alta" && base.vinculacao === "pessoal"
            ? true
            : null,
        contexto_identidade: String(descarte.contexto_identidade ?? base.contexto_identidade ?? "Contexto não registrado."),
        papel_processual: String(descarte.papel_processual ?? descarte.motivo ?? base.motivo ?? "Papel não registrado."),
        estado_oficial: String(descarte.estado_oficial ?? descarte.motivo ?? estadoBase(base)),
        observacoes: String(descarte.observacoes ?? descarte.motivo ?? base.motivo ?? "Sem observações adicionais."),
        categoria_descarte: descarte.categoria_descarte === null ? null : String(descarte.categoria_descarte ?? categoriaDescarte(descarte, base)),
        fontes_oficiais: fontes(descarte.fontes_oficiais, String(base.fonte_oficial || base.url || "")),
        bloqueio: decisaoDescarte === "bloqueado_concreto"
          ? String(descarte.bloqueio ?? descarte.motivo ?? estadoBase(base))
          : null,
      })
    } else {
      throw new Error(`${cnj}: sem decisao final`)
    }
    const reclassificacao = reclassificacaoPorCnj.get(cnj)
    if (reclassificacao) {
      const decisaoReclassificada = String(reclassificacao.decisao)
      final = {
        ...final,
        decisao: decisaoReclassificada,
        motivo: String(reclassificacao.motivo),
        bloqueio: decisaoReclassificada === "bloqueado_concreto"
          ? String(reclassificacao.motivo)
          : null,
        identidade_confirmada: decisaoReclassificada === "publicar" ? true : final.identidade_confirmada,
        estado_oficial: decisaoReclassificada === "publicar" ? String(reclassificacao.motivo) : final.estado_oficial,
        observacoes: String(reclassificacao.motivo),
        categoria_descarte: decisaoReclassificada === "nao_publicar"
          ? final.categoria_descarte ?? "associacao_incorreta"
          : null,
      }
    }
    return final
  })

  const finalPorCnj = new Map(itens.map((item) => [item.numero_cnj, item]))
  const descartesRevalidados = descartes86.map((item) =>
    exigirItemFinal(finalPorCnj, String(item.numero_cnj), "descartes86"),
  )
  const lotesPesquisa = lotesBrutos.map((lote, indice) => ({
    numero: indice + 1,
    itens: lote.map((item) =>
      exigirItemFinal(finalPorCnj, String(item.numero_cnj), `lote-${indice + 1}`),
    ),
  }))
  const resumo = Object.fromEntries(
    ["publicar", "ponto_atencao", "nao_publicar", "bloqueado_concreto"].map((decisao) => [
      decisao,
      itens.filter((item) => item.decisao === decisao).length,
    ]),
  )
  const evidencia: EvidenciaFinal = {
    schema_version: 1,
    supabase_ref: "wskpzsobvqwhnbsdsmok",
    base_commit: "2906b187709c0ba949214992ef00fcb9cb7886df",
    gerado_em: new Date().toISOString(),
    inputs: Object.fromEntries(Object.entries(caminhos).filter(([nome]) => nome !== "draft").map(([nome, caminho]) => [nome, hash(caminho)])),
    lotes_pesquisa: lotesPesquisa,
    processos_revalidados: processos6.map((item) => ({
      numero_cnj: String(item.numero_cnj),
      decisao: String(item.decisao),
      texto_publicavel: item.texto_publicavel === null ? null : String(item.texto_publicavel),
      fontes_oficiais: fontes(item.fontes_oficiais),
    })),
    pontos_atencao: grupos.map((grupo) => ({
      id: String(grupo.id),
      titulo: String(grupo.titulo),
      status: grupo.status as "aprovado" | "rejeitado" | "bloqueado",
      texto: `${String(grupo.texto)} Limitações: ${String(grupo.limitacoes ?? "")}`,
      cnjs: arrayCnj(grupo.cnjs, `grupo.${grupo.id}.cnjs`),
      fontes_oficiais: fontes(grupo.fontes_oficiais),
    })),
    descartes_revalidados: descartesRevalidados,
    itens,
    resumo,
    supabase_readback: objeto(lerJson(caminhos.readback), "supabase_readback"),
    decisoes_thiago: [
      `Aprovar ou devolver a revisão editorial de ${resumo.publicar} processos e ${resumo.ponto_atencao} registros em pontos de atenção.`,
      "Autorizar separadamente a preparação das migrations.",
      "Autorizar separadamente a aplicação das migrations no Supabase.",
      "Liberar métricas finais e deploy somente após aplicação, leitura pós-migração e reconciliação sem divergências.",
    ],
    chat7: {
      metricas_finais: "nao_liberado",
      deploy: "nao_liberado",
      motivo: `Nenhum dos ${itens.length} CNJs revisados está em public.processos e nenhuma escrita foi realizada. A classificação editorial, sozinha, não prova o estado publicado.`,
      requisitos_pendentes: [
        "Aprovação editorial explícita do Thiago.",
        "Autorização separada para preparar e aplicar migrations.",
        "Leitura pós-migração do Supabase com reconciliação dos 204 CNJs.",
        "Reexecução das métricas finais e dos gates de deploy sobre o estado publicado.",
      ],
    },
  }
  const limpo = semTravoes(evidencia) as EvidenciaFinal
  const temporario = `${caminhos.draft}.${process.pid}.tmp`
  writeFileSync(temporario, `${JSON.stringify(limpo, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  renameSync(temporario, caminhos.draft)
  process.stdout.write(`${JSON.stringify({ draft: caminhos.draft, resumo })}\n`)
}

function arrayCnj(valor: unknown, caminho: string): string[] {
  if (!Array.isArray(valor) || valor.some((item) => typeof item !== "string")) {
    throw new Error(`${caminho}: array de CNJs obrigatorio`)
  }
  return valor as string[]
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main()
