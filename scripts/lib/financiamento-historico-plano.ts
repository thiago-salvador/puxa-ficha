import { createHash } from "node:crypto"
import { canonicalCargo } from "../../src/lib/cargo-utils"
import { normalizeMaioresDoadoresForStorage, sanitizeMaioresDoadoresForPublic } from "../../src/lib/financiamento-public"
import { categoriaFinanciamentoExibida, classifyFinanciamentoOrigem } from "./ingest-tse"
import { normalizeFinanciamentoReceitaRow } from "./financiamento-receita-legacy-row"
import { financiamentoReceitaDedupKey } from "./financiamento-receita-dedup"
import { stableJson } from "./tse-2026-financas-plano"

export const FINANCE_DISPLAY_FIELDS = [
  "cargo_candidatura", "total_arrecadado", "total_fundo_partidario", "total_fundo_eleitoral",
  "total_pessoa_fisica", "total_recursos_proprios", "categorias_origem", "maiores_doadores",
] as const

export type FinanceSourceRow = Record<string, string>
export type FinanceCandidate = { slug: string; id?: string; ids?: { tse_sq_candidato?: Record<string,string>; tse_uf_candidatura?: Record<string,string> } }
export type FinanceProfile = { slug: string; id: string; financiamento?: Record<string, unknown>[]; financiamento_eleicoes?: Record<string,unknown>[] }
export type FinanceAsset = { family: string; year: number; url: string; sha256: string; path: string }
export type FinanceAction = {
  tipo: "substituir_financiamento"; slug: string; candidato_id: string; ano_eleicao: number
  sq_candidato: string; uf_candidatura: string; antes_publico: Record<string,unknown>[]; antes_sha256: string
  row_id?: string; depois: Record<string,unknown>; fonte_url: string; pacote_sha256: string; source_complete: true; classification: "a"
}
export type FinanceReview = { slug: string; ano_eleicao?: number; motivo: string }
export function safeFinanceSlugsFromCells(cells: readonly {slug:string;family:string;category:string}[]): Set<string> {
  const identityRisk=new Set(cells.filter(cell=>cell.category==="identity_review").map(cell=>cell.slug))
  return new Set(cells.filter(cell=>cell.family==="financiamento"&&cell.category==="stale_not_projected"&&!identityRisk.has(cell.slug)).map(cell=>cell.slug))
}

function money(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null
  const s = String(raw ?? "").trim()
  if (["#NULO#", "#NE#", "-1"].includes(s)) return null
  if (!s) return null
  const value = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s)
  return Number.isFinite(value) ? value : null
}
function round(value: number): number { return Math.round(value * 100) / 100 }
function txt(value: unknown): string { return typeof value === "string" ? value.trim() : "" }
function yearOf(row: FinanceSourceRow, fallback: number): number {
  const n = Number(row.ANO_ELEICAO || row.ANO || row.ANO_CANDIDATURA || fallback)
  return Number.isInteger(n) && n >= 1900 ? n : fallback
}
function normalizeReceipt(row: FinanceSourceRow): FinanceSourceRow { return normalizeFinanciamentoReceitaRow(row) }
function ufOf(row: FinanceSourceRow): string { return txt(row.SG_UF_CANDIDATURA || row.SG_UF || row.UF || row.SG_UE).toUpperCase() }
function cargoOf(row: FinanceSourceRow): string | null { const raw = txt(row.DS_CARGO); return raw ? canonicalCargo(raw) : null }
function publicRow(row: Record<string,unknown>): Record<string,unknown> {
  return Object.fromEntries(FINANCE_DISPLAY_FIELDS.map((field) => [field, row[field] ?? null]))
}
function equal(a: unknown,b: unknown): boolean { return stableJson(a) === stableJson(b) }
function sha(value: unknown): string { return createHash("sha256").update(stableJson(value)).digest("hex") }
export function hashFinancePreimage(value: unknown): string { return sha(value) }

/** Aggregate only the whitelisted, CPF-free TSE fields into the public display contract. */
export function aggregateOfficialFinance(rows: readonly FinanceSourceRow[], year: number, cargo: string): Record<string,unknown> | null {
  if (!rows.length) return null
  let total=0, fp=0, fe=0, pf=0, own=0
  const categories={fundo_eleitoral:0,fundo_partidario:0,outros_recursos:0,nao_informado_pelo_tse:0}
  const donors: Array<{nome:string;valor:number;tipo:string}> = []
  for (const raw of rows) {
    if (raw.__truncated_row === "1") return null
    const row=normalizeReceipt(raw)
    const value=money(row.VR_RECEITA || row.VALOR_RECEITA)
    if(value===null)return null
    const source=txt(row.DS_FONTE_RECEITA), origin=txt(row.DS_ORIGEM_RECEITA)
    const bucket=categoriaFinanciamentoExibida(source,origin)
    categories[bucket]+=value
    const classed=classifyFinanciamentoOrigem([source,origin].filter(Boolean).join(" — "))
    if(classed==="fundo_partidario") fp+=value
    else if(classed==="fundo_eleitoral") fe+=value
    else if(classed==="pessoa_fisica") pf+=value
    else if(classed==="recursos_proprios") own+=value
    total+=value
    const name=txt(row.NM_DOADOR || row.NM_DOADOR_RFB)
    if(name && !/#NULO|#NE|^\s*-1\s*$/i.test(name)) {
      const tipo=classed==="fundo_partidario"?"fundo_partidario":classed==="fundo_eleitoral"?"fundo_eleitoral":classed==="recursos_proprios"?"recursos_proprios":row.__donor_kind==="PF"?"PF":row.__donor_kind==="PJ"?"PJ":classed==="pessoa_fisica"?"PF":"PJ"
      donors.push({nome:name,valor:value,tipo})
    }
  }
  const maiores=sanitizeMaioresDoadoresForPublic(normalizeMaioresDoadoresForStorage(donors))
  return {
    cargo_candidatura:cargo,
    total_arrecadado:round(total), total_fundo_partidario:round(fp), total_fundo_eleitoral:round(fe),
    total_pessoa_fisica:round(pf), total_recursos_proprios:round(own),
    categorias_origem:Object.fromEntries(Object.entries(categories).map(([key,value])=>[key,round(value)])),
    maiores_doadores:maiores,
  }
}

export function planHistoricalFinance(input: {
  sourceComplete?: boolean;
  assets: readonly FinanceAsset[]; candidates: readonly FinanceCandidate[]; profiles: readonly FinanceProfile[];
  sourceRowsByAsset: ReadonlyMap<string, readonly FinanceSourceRow[]>; safeSlugs: ReadonlySet<string>;
}): { acoes: FinanceAction[]; review: FinanceReview[]; summary: Record<string,number> } {
  const candidateBySlug=new Map(input.candidates.map(c=>[c.slug,c]))
  const actions:FinanceAction[]=[]; const review:FinanceReview[]=[]
  const financeAssets=input.assets.filter(a=>a.family==="financiamento")
  const contextAssets=input.assets.filter(a=>a.family==="historico_politico"||a.family==="perfil_atual")
  const contextBy=new Map<string,FinanceSourceRow[]>()
  for(const asset of contextAssets){
    for(const row of input.sourceRowsByAsset.get(`${asset.family}|${asset.year}|${asset.path}`)??[]){
      const y=yearOf(row,asset.year),sq=txt(row.SQ_CANDIDATO),uf=ufOf(row)
      if(!sq||!uf)continue
      const key=`${y}|${sq}|${uf}`; const group=contextBy.get(key)??[];group.push(row);contextBy.set(key,group)
    }
  }
  for(const profile of input.profiles){
    if(!input.safeSlugs.has(profile.slug))continue
    if(!input.sourceComplete){review.push({slug:profile.slug,motivo:"pacote_oficial_completo_nao_comprovado"});continue}
    const candidate=candidateBySlug.get(profile.slug)
    if(!candidate||!profile.id){review.push({slug:profile.slug,motivo:"candidato_id_ausente"});continue}
    const current=Array.isArray(profile.financiamento)?profile.financiamento:[]
    const series=Array.isArray(profile.financiamento_eleicoes)?profile.financiamento_eleicoes:[]
    const sourceYears=[...new Set(financeAssets.map(a=>a.year).filter(y=>y<2026&&candidate.ids?.tse_sq_candidato?.[String(y)]))].sort((a,b)=>a-b)
    for(const year of sourceYears){
      const asset=financeAssets.find(a=>a.year===year)!
      const sq=candidate.ids?.tse_sq_candidato?.[String(year)]??""
      const contextRows=[...contextBy.entries()].filter(([key])=>key.startsWith(`${year}|${sq}|`)).flatMap(([,rows])=>rows)
      const ufs=[...new Set(contextRows.map(ufOf).filter(Boolean))]
      const identityUf=candidate.ids?.tse_uf_candidatura?.[String(year)]?.toUpperCase()
      const uf=identityUf && ufs.includes(identityUf) ? identityUf : ufs.length===1 ? ufs[0] : ""
      if(!uf){review.push({slug:profile.slug,ano_eleicao:year,motivo:"uf_oficial_ausente_ou_ambiguo"});continue}
      const officialContexts=contextRows.filter(row=>ufOf(row)===uf)
      const cargos=[...new Set(officialContexts.map(cargoOf).filter((c):c is string=>Boolean(c)))]
      if(cargos.length!==1){review.push({slug:profile.slug,ano_eleicao:year,motivo:"cargo_oficial_ausente_ou_ambiguo"});continue}
      const allFinance=input.sourceRowsByAsset.get(`${asset.family}|${asset.year}|${asset.path}`)??[]
      const matched=allFinance.map(normalizeReceipt).filter(r=>txt(r.SQ_CANDIDATO)===sq&&ufOf(r)===uf&&yearOf(r,year)===year)
      const seen=new Set<string>()
      const official=matched.filter(row=>{
        const key=txt(row.__receipt_dedup_sha256)||financiamentoReceitaDedupKey(row,{ano:year,uf,sqCandidato:sq})
        if(!key)return true
        if(seen.has(key))return false
        seen.add(key);return true
      })
      if(!official.length){review.push({slug:profile.slug,ano_eleicao:year,motivo:"sem_linhas_de_receita_correspondentes"});continue}
      const after=aggregateOfficialFinance(official,year,cargos[0]!)
      if(!after){review.push({slug:profile.slug,ano_eleicao:year,motivo:"agregacao_oficial_vazia"});continue}
      const existing=current.filter(r=>Number(r.ano_eleicao)===year)
      if(existing.length>1){review.push({slug:profile.slug,ano_eleicao:year,motivo:"mais_de_uma_linha_publica_no_ano"});continue}
      const before=existing.map(publicRow)
      const annual=series.filter(r=>Number(r.ano)===year)
      if(annual.length>1){review.push({slug:profile.slug,ano_eleicao:year,motivo:"serie_anual_ambigua"});continue}
      if(before.length===1&&equal(before[0],publicRow(after))&&annual.length===1&&annual[0]?.estado==="publicado")continue
      actions.push({tipo:"substituir_financiamento",slug:profile.slug,candidato_id:profile.id,ano_eleicao:year,sq_candidato:sq,uf_candidatura:uf,antes_publico:before,antes_sha256:sha(before),...(typeof existing[0]?.id==="string"?{row_id:existing[0].id}:{}),depois:{ano_eleicao:year,...after},fonte_url:asset.url,pacote_sha256:asset.sha256,source_complete:true,classification:"a"})
    }
    for(const row of current){const year=Number(row.ano_eleicao);if(year&&!sourceYears.includes(year))review.push({slug:profile.slug,ano_eleicao:year,motivo:"linha_publica_sem_pacote_oficial_correspondente"})}
  }
  const summary={actions:actions.length,profiles:new Set(actions.map(a=>a.slug)).size,years:new Set(actions.map(a=>a.ano_eleicao)).size,review:review.length,updates:actions.filter(a=>a.antes_publico.length===1).length,inserts:actions.filter(a=>a.antes_publico.length===0).length}
  return {acoes:actions,review,summary}
}
