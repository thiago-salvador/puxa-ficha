import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import test from "node:test"
import { reconcilePublicRoster } from "../src/lib/candidate-publication-integrity"
import { compareCandidacies } from "../scripts/lib/data-freshness/candidaturas"
import type { CandidacyRecord } from "../scripts/lib/data-freshness/types"

const json=(path: string)=>JSON.parse(readFileSync(path,"utf8"))
const before=json("tests/fixtures/freshness-closeout/published.json")
const current=json("tests/fixtures/freshness-closeout/universe.json").current_official
const crosswalk=json("data/candidate-roster-active-20260905.json")
const manifest=json("data/freshness-closeout-20260905.json")
const slate=manifest.chapa
const added: CandidacyRecord[]=[
  {uf:slate.uf,cargo:"GOVERNADOR",nome_urna:slate.titular_nome_urna,perfil_slug:"ruth-reis",sq_candidato:slate.titular_sq_candidato,sq_coligacao:slate.sq_coligacao,partido_sigla:slate.titular_partido_sigla,situacao_codigo:slate.tse_situacao_titular_codigo,situacao_descricao:null},
  {uf:slate.uf,cargo:"VICE GOVERNADOR",nome_urna:slate.vice_nome_urna,perfil_slug:null,sq_candidato:slate.vice_sq_candidato,sq_coligacao:slate.sq_coligacao,partido_sigla:slate.vice_partido_sigla,situacao_codigo:slate.tse_situacao_vice_codigo,situacao_descricao:null},
]
const published=[...before.published,...added]
const replacedViceSqs=readdirSync("data").filter(f=>/^divulgacand-vices-\d{8}\.json$/.test(f)).flatMap(f=>(json(`data/${f}`).resolutions??[]).flatMap((r: {replaced_vice_sq?: string;vices?: {sq_candidato: string;situacao_vice:number}[]})=>[r.replaced_vice_sq,...(r.vices??[]).filter(v=>v.situacao_vice===3).map(v=>v.sq_candidato)].filter((v): v is string=>Boolean(v))))

test("snapshot real pós-pacote zera missing/stale e preserva a quarentena de Laudicério", () => {
  const slugBySq=new Map(published.filter(p=>p.sq_candidato&&p.perfil_slug).map(p=>[p.sq_candidato,p.perfil_slug]))
  const official=current.map((row: {profile_slug:string|null;sq_candidato:string})=>({...row,profile_slug:row.profile_slug??slugBySq.get(row.sq_candidato)??null}))
  const profiles=[...before.public_profiles.filter((p: {slug:string})=>!["jose-moita","subtenente-luiz-carlos"].includes(p.slug)),{slug:"ruth-reis",office:"Governador",uf:"PA"}]
  const result=reconcilePublicRoster(official,profiles,crosswalk.profiles)
  assert.equal(result.status,"ok")
  assert.equal(result.published_profiles,207)
  assert.deepEqual(result.missing_public,[])
  assert.deepEqual(result.stale_public,[])
  assert.deepEqual(result.identity_mismatches,[])
  assert.deepEqual(result.duplicate_active_mappings,{})
  assert.deepEqual(Object.keys(result.quarantined_duplicate_active_mappings),["laudicerio-aguiar"])
  assert.deepEqual(published.filter(p=>["140002551357","140002551358"].includes(p.sq_candidato)),before.published.filter((p:CandidacyRecord)=>["140002551357","140002551358"].includes(p.sq_candidato)),"old José/Ruth registrations remain unchanged")
})

test("comparador real não reabre inclusões/trocas: códigos CSV não são códigos de julgamento da API", () => {
  // Snapshot SQL exports CD_SITUACAO_CANDIDATURA in these two private fields.
  // DivulgaCand codigoSituacaoCandidato=8 is a DIFFERENT namespace, retained
  // in source evidence while public situacao_candidatura stays meaningful.
  for(const rows of [published,[...published].reverse()]) {
    const comparison=compareCandidacies(before.official,rows,manifest.generated_at,{substitutedViceSqs:replacedViceSqs})
    assert.equal(comparison.status,"ok")
    for(const kind of ["inclusion","removal","replacement","status_change","identity_mismatch","missing_profile"] as const) assert.equal(comparison.counts[kind],0,kind)
    assert.equal(comparison.counts.substituted,1,"only the already approved Maranhão substitution remains informative")
  }
  assert.equal(manifest.profile.situacao_candidatura,"aguardando julgamento")
  assert.equal(slate.tse_situacao_titular_codigo,"-3")
  assert.equal(slate.tse_situacao_vice_codigo,"-3")
  assert.equal(manifest.source_evidence.candidates.find((c:{id:string})=>c.id==="140002554434").codigoSituacaoCandidato,8)
})
