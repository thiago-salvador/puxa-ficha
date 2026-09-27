import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { aggregateOfficialFinance, planHistoricalFinance, safeFinanceSlugsFromCells, type FinanceAsset, type FinanceCandidate, type FinanceProfile, type FinanceSourceRow } from "../scripts/lib/financiamento-historico-plano"
import { dryRunHistoricalFinance, projection, selectHistoricalFinanceBatch, validateHistoricalFinancePlan } from "../scripts/audit/apply-financiamento-historico-local"

const asset:FinanceAsset={family:"financiamento",year:2024,url:"https://cdn.tse.jus.br/receitas_2024.zip",sha256:"a".repeat(64),path:"/tmp/fin-2024.zip"}
const context:FinanceAsset={...asset,family:"historico_politico",url:"https://cdn.tse.jus.br/consulta_2024.zip",sha256:"b".repeat(64)}
const officialContext:FinanceSourceRow={SQ_CANDIDATO:"123",SG_UF:"SP",ANO_ELEICAO:"2024",DS_CARGO:"DEPUTADO FEDERAL"}
const receipt:FinanceSourceRow={SQ_CANDIDATO:"123",SG_UF_CANDIDATURA:"SP",ANO_ELEICAO:"2024",VR_RECEITA:"1.234,50",DS_FONTE_RECEITA:"Fundo Especial de Financiamento de Campanha",DS_ORIGEM_RECEITA:"FEFC",NM_DOADOR:"Direção Nacional"}
const candidates:FinanceCandidate[]=[{slug:"candidato",ids:{tse_sq_candidato:{2024:"123"},tse_uf_candidatura:{2024:"SP"}}}]
const profile:FinanceProfile={slug:"candidato",id:"00000000-0000-4000-8000-000000000099",financiamento:[{id:"finance-row-id",ano_eleicao:2024,cargo_candidatura:null,total_arrecadado:0,total_fundo_partidario:0,total_fundo_eleitoral:0,total_pessoa_fisica:0,total_recursos_proprios:0,categorias_origem:null,maiores_doadores:[]}],financiamento_eleicoes:[{ano:2024,estado:"publicado"}]}
function build(rows:FinanceSourceRow[]= [receipt],current=profile,safe=new Set(["candidato"])) {
  return planHistoricalFinance({sourceComplete:true,assets:[asset,context],candidates,profiles:[current],sourceRowsByAsset:new Map([[`${context.family}|${context.year}|${context.path}`,[officialContext]],[`${asset.family}|${asset.year}|${asset.path}`,rows]]),safeSlugs:safe})
}

test("finance planner withholds writes without complete official archive proof",()=>{
  const plan=planHistoricalFinance({assets:[asset,context],candidates,profiles:[profile],sourceRowsByAsset:new Map([[`${context.family}|${context.year}|${context.path}`,[officialContext]],[`${asset.family}|${asset.year}|${asset.path}`,[receipt]]]),safeSlugs:new Set(["candidato"])})
  assert.equal(plan.acoes.length,0)
  assert.equal(plan.review[0]?.motivo,"pacote_oficial_completo_nao_comprovado")
})

test("agrega todos os campos exibidos para ano histórico e emite preimagem/serie",()=>{
  const plan=build();assert.equal(plan.acoes.length,1);const a=plan.acoes[0]!
  assert.equal(a.tipo,"substituir_financiamento");assert.equal(a.ano_eleicao,2024);assert.equal(a.depois.total_arrecadado,1234.5)
  assert.equal(a.depois.total_fundo_eleitoral,1234.5);assert.equal((a.depois.categorias_origem as Record<string,number>).fundo_eleitoral,1234.5)
  assert.equal(a.depois.cargo_candidatura,"Deputado Federal");assert.equal(a.serie.estado,"publicado")
  assert.equal(a.antes_publico.length,1);assert.match(a.antes_sha256,/^[a-f0-9]{64}$/)
  assert.equal(a.source_complete,true)
  assert.equal(JSON.stringify(a).includes("cpf"),false)
})

test("não planeja 2026 nem perfis fora da allowlist safe stale",()=>{
  const asset2026={...asset,year:2026};const candidate={...candidates[0],ids:{tse_sq_candidato:{2024:"123",2026:"999"},tse_uf_candidatura:{2024:"SP",2026:"SP"}}}
  const plan=planHistoricalFinance({assets:[asset,asset2026,context],candidates:[candidate],profiles:[profile],sourceRowsByAsset:new Map([[`${context.family}|${context.year}|${context.path}`,[officialContext]],[`${asset.family}|${asset.year}|${asset.path}`,[receipt]]]),safeSlugs:new Set()})
  assert.equal(plan.acoes.length,0)
})

test("ambiguidade de preimagem pública fica em revisão",()=>{
  const plan=build([receipt],{...profile,financiamento:[...profile.financiamento!,{...profile.financiamento![0]}]})
  assert.equal(plan.acoes.length,0);assert.ok(plan.review.some(r=>r.motivo==="mais_de_uma_linha_publica_no_ano"))
})

test("valor oficial inválido falha fechado, sem transformar NaN em zero",()=>{
  const result=aggregateOfficialFinance([{...receipt,VR_RECEITA:"not money"}],2024,"Deputado Federal")
  assert.equal(result,null)
  const plan=build([{...receipt,VR_RECEITA:"not money"}]);assert.equal(plan.acoes.length,0);assert.ok(plan.review.some(r=>r.motivo==="agregacao_oficial_vazia"))
})

test("normaliza os aliases de receita legados sem perder ano, UF ou categoria",()=>{
  const legacy:FinanceSourceRow={SEQUENCIAL_CANDIDATO:"123",UNIDADE_ELEITORAL_CANDIDATO:"SP",ANO_ELEICAO:"2024", "Valor receita":"250,00", "Fonte recurso":"Fundo Partidário", "Tipo receita":"Doação de partido", NO_DOADOR:"Direção estadual"}
  const result=aggregateOfficialFinance([legacy],2024,"Deputado Federal")
  assert.equal(result?.total_arrecadado,250);assert.equal(result?.total_fundo_partidario,250)
  assert.equal((result?.categorias_origem as Record<string,number>).fundo_partidario,250)
  assert.equal((result?.maiores_doadores as Array<Record<string,unknown>>)[0]?.nome,"Direção estadual")
})

test("tipo público do doador usa apenas o tipo derivado sem reter documento",()=>{
  const internet:FinanceSourceRow={...receipt,VR_RECEITA:"100,00",DS_FONTE_RECEITA:"OUTROS RECURSOS",DS_ORIGEM_RECEITA:"Doações pela Internet",NM_DOADOR:"Doadora Teste",__donor_kind:"PF"}
  const result=aggregateOfficialFinance([internet],2024,"Deputado Federal")
  assert.deepEqual(result?.maiores_doadores,[{nome:"Doadora Teste",valor:100,tipo:"PF"}])
})

test("allowlist finance exclui qualquer perfil com identity_review em qualquer família",()=>{
  const safe=safeFinanceSlugsFromCells([
    {slug:"seguro",family:"financiamento",category:"stale_not_projected"},
    {slug:"risco",family:"financiamento",category:"stale_not_projected"},
    {slug:"risco",family:"historico_politico",category:"identity_review"},
  ])
  assert.deepEqual([...safe],["seguro"])
})

test("executor dry-run valida hash e batches sem credenciais nem escrita",()=>{
  const result=build();const action=result.acoes[0]!
  const plan={plano_sha256:"",acoes:[action]}
  const sha=createHash("sha256").update(JSON.stringify(plan.acoes)).digest("hex");plan.plano_sha256=sha
  validateHistoricalFinancePlan(plan)
  assert.deepEqual(dryRunHistoricalFinance(plan,sha),{dry_run:true,plan_sha256:sha,actions:1,batches:1,production_writes:0})
  assert.throws(()=>dryRunHistoricalFinance(plan,"0".repeat(64)),/hash esperado/)
  assert.throws(()=>validateHistoricalFinancePlan({...plan,acoes:[{...action,classification:"b" as "a"}]}),/class-a/)
})

test("executor compara doadores pela projeção pública sem perder o hash privado do CAS",()=>{
  const stored={maiores_doadores:[{nome:"Doadora Teste",valor:10,tipo:"PF",cpf_hash:"a".repeat(64),cpf_hash_versao:2}]}
  assert.deepEqual(projection(stored).maiores_doadores,[{nome:"Doadora Teste",valor:10,tipo:"PF"}])
  assert.equal((stored.maiores_doadores[0] as {cpf_hash:string}).cpf_hash,"a".repeat(64))
})

test("executor exige prova explícita de fonte completa e fatia planos grandes de modo determinístico",()=>{
  const action=build().acoes[0]!
  const many=Array.from({length:111},(_,index)=>({...action,slug:`candidato-${index}`,candidato_id:`candidate-${index}`,ano_eleicao:1900+index}))
  assert.deepEqual(selectHistoricalFinanceBatch(many,0),many.slice(0,50))
  assert.deepEqual(selectHistoricalFinanceBatch(many,2),many.slice(100))
  assert.throws(()=>selectHistoricalFinanceBatch(many,3),/fora do plano/)
  const withoutProof={plano_sha256:"",acoes:[{...action,source_complete:false}]}
  const sha=createHash("sha256").update(JSON.stringify(withoutProof.acoes)).digest("hex")
  withoutProof.plano_sha256=sha
  assert.throws(()=>dryRunHistoricalFinance(withoutProof,sha),/class-a, contexto, contrato de display, serie ou proveniencia/)
})
