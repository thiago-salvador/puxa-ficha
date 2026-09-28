/** Hash-pinned historical finance apply path. Defaults to dry-run. */
import { createHash, randomUUID } from "node:crypto"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { supabase } from "../lib/supabase"
import { escreverAuditado as escreverAuditadoReal } from "../lib/escrita-auditada"
import { sanitizeMaioresDoadoresForPublic } from "../../src/lib/financiamento-public"
import { FINANCE_DISPLAY_FIELDS, hashFinancePreimage, type FinanceAction } from "../lib/financiamento-historico-plano"
import { assertOutsideRepository } from "./lib/private-output"

type Row=Record<string,unknown>
type Result={data:Row[]|null;error:{message:string}|null}
type Query=PromiseLike<Result>&{select(columns?:string):Query;eq(column:string,value:unknown):Query;is(column:string,value:null):Query;update(value:Row):Query;insert(value:Row):Query;delete():Query}
type Client={from(table:string):Query}
type AuditedFinanceAction=FinanceAction&{source_complete?:boolean}
type Plan={plano_sha256:string;acoes:AuditedFinanceAction[];source_revisions?:Array<{family:string;year:number;url:string;sha256:string}>}
type Options={apply:boolean;expectedPlanSha:string;evidenceDir:string;batchIndex?:number;client?:Client;runId?:string;auditWrite?:typeof escreverAuditadoReal}
const SCRIPT="apply-financiamento-historico-local"
const BATCH=25
const MAX_ACTIONS_PER_RUN=50
const CANDIDATE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const stable=(v:unknown):string=>Array.isArray(v)?`[${v.map(stable).join(",")}]`:v&&typeof v==="object"?`{${Object.entries(v as Row).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${stable(x)}`).join(",")}}`:JSON.stringify(v)??"null"
const digest=(v:string)=>createHash("sha256").update(v).digest("hex")
export const projection=(row:Row)=>Object.fromEntries(FINANCE_DISPLAY_FIELDS.map(field=>[field,field==="maiores_doadores"?sanitizeMaioresDoadoresForPublic(row[field]):row[field]??null]))
const same=(a:unknown,b:unknown)=>stable(a)===stable(b)
function persist(path:string,value:unknown):void{const target=assertOutsideRepository(path,"evidence");mkdirSync(dirname(target),{recursive:true,mode:0o700});writeFileSync(target,`${JSON.stringify(value,null,2)}\n`,{mode:0o600,flag:"wx"});chmodSync(target,0o600)}

export function mergeStoredDonorIdentifiers(next:unknown,stored:unknown):unknown {
  const publicDonors=sanitizeMaioresDoadoresForPublic(next)
  if(!Array.isArray(stored))return publicDonors
  const key=(donor:Row)=>`${String(donor.nome??"").trim().toLocaleLowerCase("pt-BR")}|${String(donor.tipo??"")}`
  const old=stored.filter((value):value is Row=>Boolean(value&&typeof value==="object"))
  const oldCounts=new Map<string,number>()
  for(const donor of old)oldCounts.set(key(donor),(oldCounts.get(key(donor))??0)+1)
  const nextCounts=new Map<string,number>()
  for(const donor of publicDonors)nextCounts.set(key(donor),(nextCounts.get(key(donor))??0)+1)
  return publicDonors.map((donor)=>{
    const match=old.find((item)=>key(item)===key(donor))
    if(!match)return donor
    if(oldCounts.get(key(donor))!==1||nextCounts.get(key(donor))!==1){
      if(["cpf_hash","cpf_hash_versao","cnpj"].some((field)=>match[field]!=null))throw new Error("ambiguous_stored_donor_identity")
      return donor
    }
    const identifiers=Object.fromEntries(["cpf_hash","cpf_hash_versao","cnpj"]
      .filter((field)=>match[field]!=null).map((field)=>[field,match[field]]))
    return {...donor,...identifiers}
  })
}

export function validateHistoricalFinancePlan(plan:Plan):void{
  if(!Array.isArray(plan.acoes))throw new Error("plano sem acoes")
  const identities=new Set<string>()
  for(const action of plan.acoes){
    if(action.tipo!=="substituir_financiamento"||action.classification!=="a"||!action.slug||!action.candidato_id
      ||!Number.isInteger(action.ano_eleicao)||action.ano_eleicao>=2026||!action.sq_candidato||!/^([A-Z]{2})$/.test(action.uf_candidatura)
      ||!Array.isArray(action.antes_publico)||!/^([a-f0-9]{64})$/.test(action.antes_sha256)
      ||!/^([a-f0-9]{64})$/.test(action.pacote_sha256)||!action.fonte_url.startsWith("https://cdn.tse.jus.br/")
      ||!action.depois||Number(action.depois.ano_eleicao)!==action.ano_eleicao||action.source_complete!==true
      ||action.antes_publico.length>1||(action.antes_publico.length===1&&!action.row_id)){
      throw new Error("acao historica sem class-a, contexto, contrato de display, serie ou proveniencia")
    }
    const identity=`${action.candidato_id}/${action.ano_eleicao}`
    if(identities.has(identity))throw new Error("plano financeiro contém identidade/ano duplicado")
    identities.add(identity)
    if(!CANDIDATE_ID.test(action.candidato_id)||action.candidato_id===action.slug)throw new Error("ação financeira sem identidade pública estável")
    if(hashFinancePreimage(action.antes_publico)!==action.antes_sha256)throw new Error("digest preimage publico invalido")
  }
}

export function dryRunHistoricalFinance(plan:Plan,expectedPlanSha:string){
  validateHistoricalFinancePlan(plan)
  const actual=digest(JSON.stringify(plan.acoes))
  if(!expectedPlanSha||actual!==expectedPlanSha||plan.plano_sha256!==actual)throw new Error("hash esperado diverge do plano")
  return{dry_run:true,plan_sha256:actual,actions:plan.acoes.length,batches:Math.ceil(plan.acoes.length/BATCH),production_writes:0}
}

export function selectHistoricalFinanceBatch(actions:readonly AuditedFinanceAction[],batchIndex:number):readonly AuditedFinanceAction[]{
  if(!Number.isInteger(batchIndex)||batchIndex<0)throw new Error("índice de lote inválido")
  const offset=batchIndex*MAX_ACTIONS_PER_RUN
  if(offset>=actions.length&&actions.length>0)throw new Error("índice de lote fora do plano")
  return actions.slice(offset,offset+MAX_ACTIONS_PER_RUN)
}

function casVisible(query:Query,before:Row):Query{
  let q=query
  for(const field of FINANCE_DISPLAY_FIELDS){
    if(field==="maiores_doadores")continue // Guarded separately with the full storage preimage.
    const value=before[field]
    if(value==null)q=q.is(field,null)
    else q=q.eq(field,field==="categorias_origem"?JSON.stringify(value):value)
  }
  return q
}

export async function applyHistoricalFinanceAudited(plan:Plan,options:Options){
  const checked=dryRunHistoricalFinance(plan,options.expectedPlanSha)
  if(!options.apply)return checked
  const batchIndex=options.batchIndex??0
  const runId=options.runId??randomUUID()
  if(!/^[a-zA-Z0-9-]+$/.test(runId))throw new Error("run id inválido")
  const filePrefix=`financiamento-batch-${batchIndex}-${runId}`
  const actions=selectHistoricalFinanceBatch(plan.acoes,batchIndex)
  const client=options.client??(supabase as unknown as Client)
  const escreverAuditado=options.auditWrite??escreverAuditadoReal
  const root=assertOutsideRepository(options.evidenceDir,"--evidence-dir")
  const receipt:{plan_sha256:string;batches:number;batch_index:number;total_actions:number;remaining_actions:number;attempted:number;written:string[];readback:string[];review:Array<{slug:string;ano_eleicao:number;reason:string}>}={plan_sha256:checked.plan_sha256,batches:Math.ceil(actions.length/BATCH),batch_index:batchIndex,total_actions:plan.acoes.length,remaining_actions:Math.max(0,plan.acoes.length-(batchIndex+1)*MAX_ACTIONS_PER_RUN),attempted:0,written:[],readback:[],review:[]}
  for(let offset=0;offset<actions.length;offset+=BATCH){
    const batch=actions.slice(offset,offset+BATCH)
    const observedByAction=new Map<FinanceAction,Row[]>()
    const backup:Row[]=[]
    for(const action of batch){
      let preimage:Result
      try{preimage=await client.from("financiamento").select("*").eq("candidato_id",action.candidato_id).eq("ano_eleicao",action.ano_eleicao)}
      catch(error){persist(resolve(root,`receipt-${filePrefix}-interrupted.json`),{...receipt,status:"interrompido"});throw error}
      const{data,error}=preimage
      if(error){persist(resolve(root,`receipt-${filePrefix}-interrupted.json`),{...receipt,status:"interrompido"});throw new Error(`preimage read failed: ${error.message}`)}
      const rows=data??[];observedByAction.set(action,rows)
      backup.push(...rows)
    }
    persist(resolve(root,`backup-preimagem-${filePrefix}-${String(offset/BATCH+1).padStart(3,"0")}.json`),{plan_sha256:checked.plan_sha256,batch:offset/BATCH+1,rows:backup})
    for(const action of batch){
      receipt.attempted++
      const rows=observedByAction.get(action)??[]
      if(action.antes_publico.length===0){
        if(rows.length!==0){receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"candidate_year_row_exists_before_insert"});continue}
      }else{
        if(rows.length!==1){receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"candidate_year_not_unique"});continue}
        const current=rows[0]!
        if(current.id!==action.row_id||current.sq_candidato!==action.sq_candidato||current.uf_candidatura!==action.uf_candidatura
          ||current.fonte!=="TSE"||current.despublicado_em!=null){receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"identity_or_ownership_changed"});continue}
        if(!same(projection(current),action.antes_publico[0])||hashFinancePreimage([projection(current)])!==action.antes_sha256){receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"display_preimage_changed"});continue}
      }
      let mergedDonors:unknown
      try{mergedDonors=mergeStoredDonorIdentifiers(action.depois.maiores_doadores,rows[0]?.maiores_doadores)}
      catch{receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"ambiguous_stored_donor_identity"});continue}
      const payload:Row={...action.depois,maiores_doadores:mergedDonors,candidato_id:action.candidato_id,ano_eleicao:action.ano_eleicao,sq_candidato:action.sq_candidato,uf_candidatura:action.uf_candidatura,fonte:"TSE"}
      let response:Row[]
      try{
      response=await escreverAuditado({script:SCRIPT,tabela:"financiamento",motivo:`Financiamento TSE ${action.ano_eleicao}; SHA-256 ${action.pacote_sha256}; class-a CAS`,recorte:`${action.slug}/${action.ano_eleicao}/${action.sq_candidato}/${action.uf_candidatura}`},()=>{
        if(action.antes_publico.length===0)return client.from("financiamento").insert(payload).select("*")
        const before=rows[0]!
        let q=client.from("financiamento").update(payload).eq("id",action.row_id).eq("candidato_id",action.candidato_id).eq("ano_eleicao",action.ano_eleicao).eq("sq_candidato",action.sq_candidato).eq("uf_candidatura",action.uf_candidatura).eq("fonte","TSE").is("despublicado_em",null)
        q=casVisible(q,projection(before))
        // Guard the full donor JSONB preimage, including private hash fields, in memory only.
        q=before.maiores_doadores==null?q.is("maiores_doadores",null):q.eq("maiores_doadores",JSON.stringify(before.maiores_doadores))
        return q.select("*")
      })
      }catch(writeError){
        let restoreAttempt="unconfirmed"
        try{
          const after=await client.from("financiamento").select("*").eq("candidato_id",action.candidato_id).eq("ano_eleicao",action.ano_eleicao)
          if(!after.error&&stable(after.data??[])===stable(rows))restoreAttempt="preimage_intact"
        }catch{ /* The receipt records that readback could not confirm restoration. */ }
        persist(resolve(root,`receipt-${filePrefix}-interrupted.json`),{...receipt,status:"interrompido",
          failure:writeError instanceof Error?writeError.message:"write failed",restore_attempt:restoreAttempt})
        throw writeError
      }
      if(response.length!==1||typeof response[0]?.id!=="string"){receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"cas_write_not_singleton"});continue}
      const id=response[0]!.id as string;receipt.written.push(`${action.slug}/${action.ano_eleicao}`)
      let readbackResult:Result
      try{readbackResult=await client.from("financiamento").select("*").eq("id",id).eq("candidato_id",action.candidato_id).eq("ano_eleicao",action.ano_eleicao)}
      catch(error){readbackResult={data:null,error:{message:error instanceof Error?error.message:"readback threw"}}}
      const{data:readback,error:readError}=readbackResult
      if(readError){
        const before=rows[0]
        try{
          await escreverAuditado({script:SCRIPT,tabela:"financiamento",motivo:"restaura preimagem após falha no readback",recorte:`${action.slug}/${action.ano_eleicao}`},()=>
            before?client.from("financiamento").update(Object.fromEntries(Object.keys(payload).map((field)=>[field,before[field]??null]))).eq("id",id).select("*")
              :client.from("financiamento").delete().eq("id",id).select("*"))
          receipt.written=receipt.written.filter((key)=>key!==`${action.slug}/${action.ano_eleicao}`)
          receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"readback_failed_restored"})
        }catch{receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"readback_failed_restore_unconfirmed"})}
        persist(resolve(root,`receipt-${filePrefix}-interrupted.json`),{...receipt,status:"interrompido",
          restore_attempt:receipt.review.at(-1)?.reason==="readback_failed_restored"?"confirmed":"unconfirmed"})
        throw new Error(`readback failed: ${readError.message}`)
      }
      if((readback??[]).length!==1||!same(projection(readback![0]!),projection(action.depois as Row))||readback![0]!.sq_candidato!==action.sq_candidato||readback![0]!.uf_candidatura!==action.uf_candidatura||readback![0]!.fonte!=="TSE"||readback![0]!.despublicado_em!=null){receipt.review.push({slug:action.slug,ano_eleicao:action.ano_eleicao,reason:"display_readback_mismatch"});continue}
      receipt.readback.push(`${action.slug}/${action.ano_eleicao}`)
    }
    persist(resolve(root,`receipt-${filePrefix}-${String(offset/BATCH+1).padStart(3,"0")}.json`),receipt)
  }
  persist(resolve(root,`receipt-${filePrefix}-final.json`),receipt)
  return receipt
}

async function main():Promise<void>{
  const args=process.argv.slice(2);const value=(prefix:string)=>args.find(a=>a.startsWith(`${prefix}=`))?.slice(prefix.length+1)
  if(args.some(a=>!/^(--apply|--dry-run|--plan=.+|--expect-plan=[a-f0-9]{64}|--evidence-dir=.+|--batch-index=\d+)$/.test(a))||(args.includes("--apply")&&args.includes("--dry-run")))throw new Error("argumentos invalidos")
  const planPath=value("--plan");if(!planPath)throw new Error("--plan obrigatório")
  const plan=JSON.parse(readFileSync(resolve(planPath),"utf8")) as Plan
  const result=await applyHistoricalFinanceAudited(plan,{apply:args.includes("--apply"),expectedPlanSha:value("--expect-plan")??"",evidenceDir:value("--evidence-dir")??process.env.PF_TSE_PRIVATE_DIR??"",batchIndex:value("--batch-index")===undefined?0:Number(value("--batch-index"))})
  console.log(JSON.stringify(result))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error instanceof Error?error.message:"apply historical finance failed");process.exitCode=1})
