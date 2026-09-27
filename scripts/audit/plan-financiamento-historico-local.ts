import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { manifestAssets, readRows } from "./collect-tse-family-receipts-local"
import { planHistoricalFinance, safeFinanceSlugsFromCells, type FinanceCandidate, type FinanceProfile } from "../lib/financiamento-historico-plano"
import { maskDocumentLikeSequences } from "../../src/lib/observacao-publica"
import { assertOutsideRepository } from "./lib/private-output"

function arg(name:string):string { const prefix=`--${name}=`;const value=process.argv.find(x=>x.startsWith(prefix))?.slice(prefix.length);if(!value)throw new Error(`argumento obrigatório: ${prefix}<arquivo>`);return resolve(value) }
function readJson<T>(path:string):T{return JSON.parse(readFileSync(path,"utf8")) as T}
function save(path:string,value:unknown):void{const target=assertOutsideRepository(path,"private output");mkdirSync(dirname(target),{recursive:true,mode:0o700});writeFileSync(target,JSON.stringify(value,null,2)+"\n",{mode:0o600});chmodSync(target,0o600)}
function maskDonorNames(rows:Array<Record<string,string>>):Array<Record<string,string>>{
  const names=new Set(["NM_DOADOR","NM_DOADOR_RFB","NM_DOADOR_ORIGINARIO","NO_DOADOR","Nome do doador","Nome do doador RFB"])
  return rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,names.has(key)?maskDocumentLikeSequences(value):value])))
}

async function main():Promise<void>{
  const manifestPath=arg("manifest"), candidatesPath=arg("candidates"), profilesPath=arg("profiles"), classificationPath=arg("classification"), out=arg("out")
  const manifest=readJson<{assets:unknown[];pending?:unknown[]}>(manifestPath)
  if(manifest.pending?.length)throw new Error("manifesto oficial incompleto")
  const assets=await manifestAssets(manifest as never)
  const candidates=readJson<FinanceCandidate[]>(candidatesPath), profiles=readJson<FinanceProfile[]>(profilesPath)
  const classification=readJson<{cells:Array<{slug:string;family:string;category:string}>}>(classificationPath)
  const identityRisk=new Set(classification.cells.filter(c=>c.category==="identity_review").map(c=>c.slug))
  const safeSlugs=safeFinanceSlugsFromCells(classification.cells)
  if(!safeSlugs.size)throw new Error("classificação sem allowlist stale_not_projected para financiamento")
  const wantedSq=new Set(candidates.flatMap(c=>Object.values(c.ids?.tse_sq_candidato??{})))
  const cachePath=process.argv.find(x=>x.startsWith("--rows-cache="))?.slice("--rows-cache=".length)
  const cached=cachePath&&existsSync(resolve(cachePath))?readJson<{source_revisions:Array<{path:string;sha256:string}>;rows:Record<string,Array<Record<string,string>>>}>(resolve(cachePath)):null
  const expectedRevisions=assets.map(a=>({path:a.path,sha256:a.sha256}))
  const cacheValid=Boolean(cached&&JSON.stringify(cached.source_revisions)===JSON.stringify(expectedRevisions))
  const sourceRowsByAsset=new Map<string,Array<Record<string,string>>>(cacheValid?Object.entries(cached!.rows).map(([key,rows])=>[key,maskDonorNames(rows)]):[])
  if(cacheValid&&cachePath)save(resolve(cachePath),{source_revisions:expectedRevisions,rows:Object.fromEntries(sourceRowsByAsset)})
  // Reader gained safe receipt IDs after the first private cache was made; refresh only 2010,
  // whose package has 28 disjoint UF/BR partitions and can contain repeated receipt exports.
  for(const asset of assets.filter(a=>a.family==="financiamento"&&a.year===2010)){
    const key=`${asset.family}|${asset.year}|${asset.path}`,rows=sourceRowsByAsset.get(key)??[]
    const hasReceiptKey=rows.some(row=>["SQ_RECEITA","NR_RECIBO_DOACAO","Numero Recibo Eleitoral","Número Recibo Eleitoral"].some(field=>Boolean(row[field])))
    if(!hasReceiptKey)sourceRowsByAsset.delete(key)
  }
  for(const asset of assets){
    if(!["financiamento","historico_politico","perfil_atual"].includes(asset.family))continue
    const key=`${asset.family}|${asset.year}|${asset.path}`
    if(sourceRowsByAsset.has(key))continue
    const rows=maskDonorNames(await readRows(asset.path,asset.family as "financiamento"|"historico_politico"|"perfil_atual",wantedSq,asset.year))
    sourceRowsByAsset.set(key,rows)
    if(cachePath){save(resolve(cachePath),{source_revisions:expectedRevisions,rows:Object.fromEntries(sourceRowsByAsset)})}
  }
  const relevantAssets=assets.filter(a=>["financiamento","historico_politico","perfil_atual"].includes(a.family))
  const sourceComplete=relevantAssets.length>0&&(manifest.pending?.length??0)===0&&relevantAssets.every(a=>sourceRowsByAsset.has(`${a.family}|${a.year}|${a.path}`))
  const planned=planHistoricalFinance({sourceComplete,assets,candidates,profiles,sourceRowsByAsset,safeSlugs})
  const revisions=assets.filter(a=>["financiamento","historico_politico","perfil_atual"].includes(a.family)).map(({family,year,url,sha256})=>({family,year,url,sha256}))
  const plan={schema_version:1,family:"financiamento_historico",generated_at:new Date().toISOString(),allowlist:{classification_file:classificationPath,classification_sha256:createHash("sha256").update(readFileSync(classificationPath)).digest("hex"),class:"stale_not_projected",profiles:safeSlugs.size,identity_risk_excluded:identityRisk.size},source_revisions:revisions,...planned}
  const planSha=createHash("sha256").update(JSON.stringify(planned.acoes)).digest("hex")
  save(out,{...plan,plano_sha256:planSha})
  save(out.replace(/\.json$/,"-resumo.json"),{plano_sha256:planSha,summary:planned.summary,review:planned.review.length,allowlist_profiles:safeSlugs.size,source_assets:revisions.length})
  console.log(JSON.stringify({plano_sha256:planSha,...planned.summary,allowlist_profiles:safeSlugs.size,source_assets:revisions.length,out}))
}
main().catch(error=>{console.error(error instanceof Error?error.message:"falha ao planejar financiamento histórico");process.exitCode=1})
