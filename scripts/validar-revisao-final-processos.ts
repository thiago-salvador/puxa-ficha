import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const TOTAL_CNJS = 204
const TAMANHOS_LOTES = [20, 20, 7] as const
const TOTAL_PROCESSOS_REVALIDADOS = 6
const TOTAL_GRUPOS_ATENCAO = 6

const DECISOES = new Set([
  "publicar",
  "ponto_atencao",
  "nao_publicar",
  "bloqueado_concreto",
])

type BaseItem = {
  numero_cnj: string
  recomendacao: string
  slug?: string
}

type RevisaoBase = {
  itens: BaseItem[]
}

type FonteOficial = {
  url: string
  titulo: string
  consultado_em: string | null
}

const CATEGORIAS_DESCARTE = new Set([
  "homonimo",
  "terceiro",
  "autor_vitima_sem_fato_adverso",
  "autoridade_nominal",
  "duplicata_real",
  "associacao_incorreta",
])

export type ItemFinal = {
  numero_cnj: string
  slug: string
  decisao: string
  motivo: string
  familia_processual: string
  fontes_oficiais: FonteOficial[]
  bloqueio: string | null
  origem_revisao: string
  identidade_confirmada: boolean | null
  contexto_identidade: string
  papel_processual: string
  estado_oficial: string
  observacoes: string
  categoria_descarte: string | null
}

type LotePesquisa = {
  numero: number
  itens: ItemFinal[]
}

type ProcessoRevalidado = {
  numero_cnj: string
  decisao: string
  texto_publicavel: string | null
  fontes_oficiais: FonteOficial[]
}

type GrupoAtencao = {
  id: string
  titulo: string
  status: "aprovado" | "rejeitado" | "bloqueado"
  texto: string
  cnjs: string[]
  fontes_oficiais: FonteOficial[]
}

export type EvidenciaFinal = {
  schema_version: 1
  supabase_ref: string
  base_commit: string
  gerado_em: string
  inputs: Record<string, string>
  lotes_pesquisa: LotePesquisa[]
  processos_revalidados: ProcessoRevalidado[]
  pontos_atencao: GrupoAtencao[]
  descartes_revalidados: ItemFinal[]
  itens: ItemFinal[]
  resumo: Record<string, number>
  supabase_readback: Record<string, unknown>
  decisoes_thiago: string[]
  chat7: {
    metricas_finais: "nao_liberado" | "liberado"
    deploy: "nao_liberado" | "liberado"
    motivo: string
    requisitos_pendentes: string[]
  }
}

function falhar(caminho: string, mensagem: string): never {
  throw new Error(`${caminho}: ${mensagem}`)
}

function texto(valor: unknown, caminho: string): string {
  if (typeof valor !== "string" || !valor.trim()) falhar(caminho, "texto obrigatorio")
  return valor.trim()
}

function validarFonte(fonte: FonteOficial, caminho: string): void {
  const url = texto(fonte?.url, `${caminho}.url`)
  texto(fonte?.titulo, `${caminho}.titulo`)
  if (fonte?.consultado_em !== null) {
    const consultadoEm = texto(fonte?.consultado_em, `${caminho}.consultado_em`)
    if (Number.isNaN(Date.parse(consultadoEm))) falhar(`${caminho}.consultado_em`, "data invalida")
  }
  if (new URL(url).protocol !== "https:") falhar(`${caminho}.url`, "HTTPS obrigatorio")
}

function validarItem(item: ItemFinal, caminho: string): void {
  texto(item.numero_cnj, `${caminho}.numero_cnj`)
  texto(item.slug, `${caminho}.slug`)
  texto(item.motivo, `${caminho}.motivo`)
  texto(item.familia_processual, `${caminho}.familia_processual`)
  texto(item.origem_revisao, `${caminho}.origem_revisao`)
  texto(item.contexto_identidade, `${caminho}.contexto_identidade`)
  texto(item.papel_processual, `${caminho}.papel_processual`)
  texto(item.estado_oficial, `${caminho}.estado_oficial`)
  texto(item.observacoes, `${caminho}.observacoes`)
  if (![true, false, null].includes(item.identidade_confirmada)) {
    falhar(`${caminho}.identidade_confirmada`, "deve ser boolean ou null")
  }
  if (!DECISOES.has(item.decisao)) falhar(`${caminho}.decisao`, "decisao invalida")
  if (!Array.isArray(item.fontes_oficiais)) falhar(`${caminho}.fontes_oficiais`, "array obrigatorio")
  item.fontes_oficiais.forEach((fonte, indice) => validarFonte(fonte, `${caminho}.fontes_oficiais[${indice}]`))
  if (item.decisao === "bloqueado_concreto") {
    texto(item.bloqueio, `${caminho}.bloqueio`)
  } else if (item.bloqueio !== null) {
    falhar(`${caminho}.bloqueio`, "deve ser null fora de bloqueado_concreto")
  }
  if (["publicar", "ponto_atencao"].includes(item.decisao) && item.fontes_oficiais.length === 0) {
    falhar(`${caminho}.fontes_oficiais`, "fonte oficial obrigatoria para publicar ou ponto de atencao")
  }
  if (["publicar", "ponto_atencao"].includes(item.decisao) && item.identidade_confirmada !== true) {
    falhar(`${caminho}.identidade_confirmada`, "identidade confirmada obrigatoria para publicar ou ponto de atencao")
  }
  if (item.decisao === "nao_publicar") {
    if (!CATEGORIAS_DESCARTE.has(String(item.categoria_descarte))) {
      falhar(`${caminho}.categoria_descarte`, "categoria terminal obrigatoria")
    }
  } else if (item.categoria_descarte !== null) {
    falhar(`${caminho}.categoria_descarte`, "deve ser null fora de nao_publicar")
  }
}

function conjuntoExato(recebidos: string[], esperados: string[], caminho: string): void {
  if (new Set(recebidos).size !== recebidos.length) falhar(caminho, "CNJ duplicado")
  const a = [...recebidos].sort()
  const b = [...esperados].sort()
  if (a.length !== b.length || a.some((valor, indice) => valor !== b[indice])) {
    falhar(caminho, "cobertura de CNJs divergente")
  }
}

export function validarRevisaoFinal(
  evidencia: EvidenciaFinal,
  revisaoBase: RevisaoBase,
): Record<string, number> {
  if (evidencia.schema_version !== 1) falhar("schema_version", "esperado 1")
  texto(evidencia.supabase_ref, "supabase_ref")
  if (!/^[0-9a-f]{40}$/.test(texto(evidencia.base_commit, "base_commit"))) {
    falhar("base_commit", "SHA-1 completo obrigatorio")
  }
  texto(evidencia.gerado_em, "gerado_em")
  if (!evidencia.inputs || Object.keys(evidencia.inputs).length < 2) {
    falhar("inputs", "ao menos dois hashes obrigatorios")
  }
  for (const [nome, hash] of Object.entries(evidencia.inputs)) {
    if (!/^[0-9a-f]{64}$/.test(hash)) falhar(`inputs.${nome}`, "SHA-256 invalido")
  }
  if (!Array.isArray(revisaoBase.itens) || revisaoBase.itens.length !== TOTAL_CNJS) {
    falhar("revisao_base.itens", `esperados ${TOTAL_CNJS} itens`)
  }
  const baseCnjs = revisaoBase.itens.map((item) => item.numero_cnj)
  conjuntoExato(baseCnjs, baseCnjs, "revisao_base.itens")

  if (!Array.isArray(evidencia.itens) || evidencia.itens.length !== TOTAL_CNJS) {
    falhar("itens", `esperados ${TOTAL_CNJS} itens`)
  }
  evidencia.itens.forEach((item, indice) => validarItem(item, `itens[${indice}]`))
  conjuntoExato(evidencia.itens.map((item) => item.numero_cnj), baseCnjs, "itens")
  const basePorCnj = new Map(revisaoBase.itens.map((item) => [item.numero_cnj, item]))
  for (const item of evidencia.itens) {
    const base = basePorCnj.get(item.numero_cnj)
    if (base?.slug && base.slug !== item.slug) falhar(`itens.${item.numero_cnj}.slug`, "diverge da revisão base")
  }

  const pesquisar = revisaoBase.itens
    .filter((item) => item.recomendacao === "pesquisar_mais")
    .map((item) => item.numero_cnj)
  if (pesquisar.length !== TAMANHOS_LOTES.reduce((total, atual) => total + atual, 0)) {
    falhar("revisao_base", "esperados 47 itens pesquisar_mais")
  }
  if (!Array.isArray(evidencia.lotes_pesquisa) || evidencia.lotes_pesquisa.length !== TAMANHOS_LOTES.length) {
    falhar("lotes_pesquisa", "esperados tres lotes")
  }
  evidencia.lotes_pesquisa.forEach((lote, indice) => {
    if (lote.numero !== indice + 1) falhar(`lotes_pesquisa[${indice}].numero`, "ordem invalida")
    if (!Array.isArray(lote.itens) || lote.itens.length !== TAMANHOS_LOTES[indice]) {
      falhar(`lotes_pesquisa[${indice}].itens`, `esperados ${TAMANHOS_LOTES[indice]} itens`)
    }
  })
  const itensLotes = evidencia.lotes_pesquisa.flatMap((lote) => lote.itens)
  conjuntoExato(itensLotes.map((item) => item.numero_cnj), pesquisar, "lotes_pesquisa")
  for (const item of itensLotes) {
    if (!["pesquisa_complementar", "pesquisa_complementar_revisada"].includes(item.origem_revisao)) {
      falhar(`lotes_pesquisa.${item.numero_cnj}.origem_revisao`, "esperada pesquisa complementar ou revisão adversarial")
    }
  }

  const publicaveisOriginais = revisaoBase.itens
    .filter((item) => item.recomendacao === "publicar")
    .map((item) => item.numero_cnj)
  if (publicaveisOriginais.length !== TOTAL_PROCESSOS_REVALIDADOS) {
    falhar("revisao_base", `esperados ${TOTAL_PROCESSOS_REVALIDADOS} publicaveis originais`)
  }
  if (!Array.isArray(evidencia.processos_revalidados) || evidencia.processos_revalidados.length !== TOTAL_PROCESSOS_REVALIDADOS) {
    falhar("processos_revalidados", `esperados ${TOTAL_PROCESSOS_REVALIDADOS} itens`)
  }
  conjuntoExato(
    evidencia.processos_revalidados.map((item) => item.numero_cnj),
    publicaveisOriginais,
    "processos_revalidados",
  )
  evidencia.processos_revalidados.forEach((item, indice) => {
    if (!DECISOES.has(item.decisao)) falhar(`processos_revalidados[${indice}].decisao`, "decisao invalida")
    if (!Array.isArray(item.fontes_oficiais) || item.fontes_oficiais.length === 0) {
      falhar(`processos_revalidados[${indice}].fontes_oficiais`, "fonte oficial obrigatoria")
    }
    item.fontes_oficiais.forEach((fonte, fonteIndice) =>
      validarFonte(fonte, `processos_revalidados[${indice}].fontes_oficiais[${fonteIndice}]`)
    )
    if (item.decisao === "publicar") texto(item.texto_publicavel, `processos_revalidados[${indice}].texto_publicavel`)
  })

  if (!Array.isArray(evidencia.pontos_atencao) || evidencia.pontos_atencao.length !== TOTAL_GRUPOS_ATENCAO) {
    falhar("pontos_atencao", `esperados ${TOTAL_GRUPOS_ATENCAO} grupos`)
  }
  const idsGrupos = new Set<string>()
  const statusGrupos = new Set(["aprovado", "rejeitado", "bloqueado"])
  const itemPorCnj = new Map(evidencia.itens.map((item) => [item.numero_cnj, item]))
  for (const [indice, grupo] of evidencia.pontos_atencao.entries()) {
    const id = texto(grupo.id, `pontos_atencao[${indice}].id`)
    if (idsGrupos.has(id)) falhar(`pontos_atencao[${indice}].id`, "grupo duplicado")
    idsGrupos.add(id)
    if (!statusGrupos.has(grupo.status)) falhar(`pontos_atencao[${indice}].status`, "status invalido")
    texto(grupo.titulo, `pontos_atencao[${indice}].titulo`)
    texto(grupo.texto, `pontos_atencao[${indice}].texto`)
    if (!Array.isArray(grupo.cnjs) || grupo.cnjs.length === 0) falhar(`pontos_atencao[${indice}].cnjs`, "CNJs obrigatorios")
    if (!Array.isArray(grupo.fontes_oficiais) || grupo.fontes_oficiais.length === 0) {
      falhar(`pontos_atencao[${indice}].fontes_oficiais`, "fonte oficial obrigatoria")
    }
    grupo.fontes_oficiais.forEach((fonte, fonteIndice) =>
      validarFonte(fonte, `pontos_atencao[${indice}].fontes_oficiais[${fonteIndice}]`)
    )
    const decisaoEsperada = grupo.status === "aprovado"
      ? "ponto_atencao"
      : grupo.status === "rejeitado"
        ? "nao_publicar"
        : "bloqueado_concreto"
    for (const cnj of grupo.cnjs) {
      const item = itemPorCnj.get(cnj)
      if (!item) falhar(`pontos_atencao[${indice}].cnjs`, `CNJ inexistente: ${cnj}`)
      if (item.decisao !== decisaoEsperada) {
        falhar(`pontos_atencao[${indice}].cnjs`, `${cnj} deveria ser ${decisaoEsperada}`)
      }
    }
  }
  const finaisAtencao = evidencia.itens
    .filter((item) => item.decisao === "ponto_atencao")
    .map((item) => item.numero_cnj)
  conjuntoExato(
    evidencia.pontos_atencao.filter((grupo) => grupo.status === "aprovado").flatMap((grupo) => grupo.cnjs),
    finaisAtencao,
    "pontos_atencao.cnjs_aprovados",
  )

  const descartesOriginais = revisaoBase.itens
    .filter((item) => item.recomendacao === "nao_publicar")
    .map((item) => item.numero_cnj)
  if (!Array.isArray(evidencia.descartes_revalidados) || evidencia.descartes_revalidados.length !== 86) {
    falhar("descartes_revalidados", "esperados 86 itens")
  }
  evidencia.descartes_revalidados.forEach((item, indice) => validarItem(item, `descartes_revalidados[${indice}]`))
  conjuntoExato(
    evidencia.descartes_revalidados.map((item) => item.numero_cnj),
    descartesOriginais,
    "descartes_revalidados",
  )
  for (const item of evidencia.descartes_revalidados) {
    const final = itemPorCnj.get(item.numero_cnj)
    if (!final || final.decisao !== item.decisao || final.categoria_descarte !== item.categoria_descarte) {
      falhar(`descartes_revalidados.${item.numero_cnj}`, "diverge da decisão final")
    }
    if (item.origem_revisao !== "auditoria_adversarial_descarte") {
      falhar(`descartes_revalidados.${item.numero_cnj}.origem_revisao`, "esperada auditoria adversarial")
    }
  }

  const resumo = Object.fromEntries([...DECISOES].map((decisao) => [
    decisao,
    evidencia.itens.filter((item) => item.decisao === decisao).length,
  ]))
  for (const [chave, valor] of Object.entries(resumo)) {
    if (evidencia.resumo?.[chave] !== valor) falhar(`resumo.${chave}`, `esperado ${valor}`)
  }
  if (!evidencia.supabase_readback || typeof evidencia.supabase_readback !== "object") {
    falhar("supabase_readback", "objeto obrigatorio")
  }
  const readback = evidencia.supabase_readback
  if (readback.modo !== "select_read_only") falhar("supabase_readback.modo", "esperado select_read_only")
  if (readback.escritas_realizadas !== false) falhar("supabase_readback.escritas_realizadas", "deve ser false")
  if (readback.cnjs_204_ja_em_processos !== 0) falhar("supabase_readback.cnjs_204_ja_em_processos", "esperado zero")
  if (!Array.isArray(readback.cnjs_sobrepostos) || readback.cnjs_sobrepostos.length !== 0) {
    falhar("supabase_readback.cnjs_sobrepostos", "esperada lista vazia")
  }
  const consultadoEm = Date.parse(texto(readback.consultado_em, "supabase_readback.consultado_em"))
  const geradoEm = Date.parse(evidencia.gerado_em)
  if (Number.isNaN(consultadoEm) || Number.isNaN(geradoEm) || consultadoEm > geradoEm + 5 * 60_000 || geradoEm - consultadoEm > 24 * 60 * 60_000) {
    falhar("supabase_readback.consultado_em", "readback deve anteceder a evidencia em no maximo 24 horas")
  }
  if (!Array.isArray(evidencia.decisoes_thiago)) falhar("decisoes_thiago", "array obrigatorio")
  if (!evidencia.chat7 || evidencia.chat7.metricas_finais !== "nao_liberado" || evidencia.chat7.deploy !== "nao_liberado") {
    falhar("chat7", "metricas finais e deploy devem permanecer nao liberados antes da aplicacao e do readback")
  }
  texto(evidencia.chat7.motivo, "chat7.motivo")
  if (!Array.isArray(evidencia.chat7.requisitos_pendentes) || evidencia.chat7.requisitos_pendentes.length === 0) {
    falhar("chat7.requisitos_pendentes", "ao menos um requisito pendente")
  }
  evidencia.chat7.requisitos_pendentes.forEach((item, indice) => texto(item, `chat7.requisitos_pendentes[${indice}]`))
  return resumo
}

function esc(valor: unknown): string {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function gerarHtml(evidencia: EvidenciaFinal): string {
  const rotulos: Record<string, string> = {
    publicar: "publicar",
    ponto_atencao: "ponto de atenção",
    nao_publicar: "não publicar",
    bloqueado_concreto: "bloqueio concreto",
  }
  const grupos = evidencia.pontos_atencao.map((grupo) => `
    <article><p><strong>Status: ${esc(grupo.status)}</strong></p><h3>${esc(grupo.titulo)}</h3><p>${esc(grupo.texto)}</p><small>${grupo.cnjs.length} CNJ(s) · <a href="${esc(grupo.fontes_oficiais[0]?.url)}">fonte oficial</a></small></article>`).join("")
  const publicar = evidencia.itens.filter((item) => item.decisao === "publicar")
  const bloqueados = evidencia.itens.filter((item) => item.decisao === "bloqueado_concreto")
  const descartados = evidencia.itens.filter((item) => item.decisao === "nao_publicar")
  const listaItens = (itens: ItemFinal[]) => itens.map((item) => `
    <li><strong>${esc(item.slug)}</strong> · <code>${esc(item.numero_cnj)}</code><br>${esc(item.motivo)}${item.fontes_oficiais[0]?.url ? ` <a href="${esc(item.fontes_oficiais[0].url)}">Fonte oficial</a>` : ""}</li>`).join("")
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
<title>Revisão final de processos | Puxa Ficha</title><style>
:root{color-scheme:light;--bg:#f4f1ea;--paper:#fff;--ink:#172019;--muted:#59645d;--line:#d8ddd7;--blue:#155f85;--green:#176b46}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:42px 22px 70px}h1{font-size:clamp(34px,6vw,64px);line-height:1.02;margin:8px 0 18px}.lede{max-width:760px;color:var(--muted);font-size:19px}.metrics,.groups,.choices{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metrics{margin:28px 0}.metric,article,.decision,details{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px}.metric b{display:block;font-size:34px}.groups{grid-template-columns:repeat(2,1fr)}article h3{margin-top:0}.decision{margin-top:28px}.choices{grid-template-columns:repeat(2,1fr)}label{display:flex;gap:10px;border:1px solid var(--line);border-radius:12px;padding:14px}label:has(input:checked){border:2px solid var(--blue);padding:13px;background:#f2f8fb}textarea{width:100%;min-height:110px;margin:14px 0;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit}button{background:var(--green);color:#fff;border:0;border-radius:10px;padding:13px 20px;font-weight:750;cursor:pointer}#status{margin-left:12px;color:var(--muted)}ul{padding-left:22px}li{margin:12px 0}code{font-size:13px}details{margin:16px 0}summary{cursor:pointer;font-weight:750}@media(max-width:760px){.metrics,.groups,.choices{grid-template-columns:1fr}}
</style></head><body><main><p>Puxa Ficha · aprovação editorial</p><h1>Os 204 CNJs estão editorialmente reconciliados.</h1><p class="lede">Nada foi publicado. Esta página reúne o resultado da pesquisa, os textos agregados e os bloqueios concretos para a decisão final.</p>
<section class="metrics">${Object.entries(evidencia.resumo).map(([chave, valor]) => `<div class="metric"><span>${esc(rotulos[chave] ?? chave.replaceAll("_", " "))}</span><b>${valor}</b></div>`).join("")}</section>
<details><summary>Pronto para publicação após aprovação (${publicar.length})</summary><ul>${listaItens(publicar)}</ul></details>
<h2>Seis famílias avaliadas para ponto de atenção</h2><section class="groups">${grupos}</section>
<details open><summary>Bloqueios concretos (${bloqueados.length})</summary>${bloqueados.length ? `<ul>${listaItens(bloqueados)}</ul>` : "<p>Nenhum bloqueio concreto permaneceu.</p>"}</details>
<details><summary>Descartados com motivo (${descartados.length})</summary><ul>${listaItens(descartados)}</ul></details>
<details><summary>Decisões que ainda dependem do Thiago (${evidencia.decisoes_thiago.length})</summary>${evidencia.decisoes_thiago.length ? `<ul>${evidencia.decisoes_thiago.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "<p>Nenhuma decisão adicional além da aprovação editorial do conjunto.</p>"}</details>
<section class="decision"><h2>Chat 7: não liberado</h2><p>${esc(evidencia.chat7.motivo)}</p><ul>${evidencia.chat7.requisitos_pendentes.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>
<section class="decision"><h2>Decisão final</h2><div class="choices"><label><input type="radio" name="decisao" value="aprovar" checked><span><b>Aprovar a classificação editorial · Recomendado</b><br><small>Registra a aprovação desta revisão. Não autoriza migrations nem publicação.</small></span></label><label><input type="radio" name="decisao" value="revisar"><span><b>Devolver para revisão</b><br><small>Mantém todos os itens fora da publicação.</small></span></label></div><textarea id="instructions" placeholder="Instruções adicionais"></textarea><button id="apply">Aplicar</button><span id="status"></span></section>
<script>document.getElementById('apply').addEventListener('click',async()=>{const button=document.getElementById('apply'),status=document.getElementById('status');button.disabled=true;status.textContent='Registrando...';const payload={tipo:'processos_revisao_final',decisao:document.querySelector('input[name=decisao]:checked').value,instrucoes:document.getElementById('instructions').value,gerado_em:new Date().toISOString()};try{const response=await fetch('/aplicar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw new Error('HTTP '+response.status);status.textContent='Decisão registrada. Nenhum dado foi publicado.'}catch(error){status.textContent='Falha ao registrar: '+error.message;button.disabled=false}})</script></main></body></html>`
}

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length)
}

function escreverAtomico(caminho: string, conteudo: string): void {
  mkdirSync(dirname(caminho), { recursive: true })
  const temporario = `${caminho}.${process.pid}.tmp`
  writeFileSync(temporario, conteudo, { encoding: "utf8", flag: "wx" })
  renameSync(temporario, caminho)
}

export function main(): void {
  const raiz = resolve(homedir(), ".disposable-html")
  const review = resolve(argumento("review") ?? `${raiz}/2026-08-05-puxa-ficha-processos-revisao-editorial.json`)
  const draft = resolve(argumento("draft") ?? `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.draft.json`)
  const evidence = resolve(argumento("evidence") ?? `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.evidence.json`)
  const html = resolve(argumento("html") ?? `${raiz}/2026-08-05-puxa-ficha-processos-revisao-final.descartavel.html`)
  const revisaoBase = JSON.parse(readFileSync(review, "utf8")) as RevisaoBase
  const evidenciaFinal = JSON.parse(readFileSync(draft, "utf8")) as EvidenciaFinal
  const resumo = validarRevisaoFinal(evidenciaFinal, revisaoBase)
  escreverAtomico(evidence, `${JSON.stringify(evidenciaFinal, null, 2)}\n`)
  escreverAtomico(html, gerarHtml(evidenciaFinal))
  process.stdout.write(`${JSON.stringify({ evidence, html, resumo })}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main()
