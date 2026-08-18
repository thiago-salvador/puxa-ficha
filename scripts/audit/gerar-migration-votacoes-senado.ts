/** Gera migration, rollback e readback do recibo oficial do item 7. */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const EVIDENCIA = resolve("QA/evidencias/2026-08-11-item7-senado/auditoria-oficial-13-linhas.json")
const SNAPSHOT = resolve("QA/evidencias/2026-08-11-item7-senado/snapshot-producao-antes.json")
const MIGRATION = resolve("supabase/migrations/20260811100000_votacoes_senado_chave_exata.sql")
const ROLLBACK = resolve("supabase/rollback/20260811100000_votacoes_senado_chave_exata.rollback.sql")
const READBACK = resolve("supabase/readback/20260811100000_votacoes_senado_chave_exata.readback.sql")
const CONTRACT = resolve("supabase/migrations/20260811100100_votacoes_senado_contrato_exato.sql")
const CONTRACT_ROLLBACK = resolve("supabase/rollback/20260811100100_votacoes_senado_contrato_exato.rollback.sql")

const evidencia = JSON.parse(readFileSync(EVIDENCIA, "utf8")) as {
  votos: Array<{ linhaId: string; slug: string; voto: string }>
}
const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
  linhas: Array<Record<string, unknown>>
  pares: Array<Record<string, unknown> & { candidatos: { slug: string } }>
}

const escapar = (valor: unknown) => valor == null ? "null" : `'${String(valor).replaceAll("'", "''")}'`
const dataSql = (valor: unknown) => valor == null ? "null" : `${escapar(valor)}::date`
const timestampSql = (valor: unknown) => valor == null ? "null" : `${escapar(valor)}::timestamptz`

const mantidas = [
  ["8ccbfe61-0ede-409e-83a1-1c2cbdd0421d", "6046", "137999", "2019-10-22"],
  ["a8b40599-746f-418a-810e-4bbaa1894847", "6248", "135147", "2020-11-03"],
  ["e586da0e-3d1e-4f4c-93cd-3c696417f627", "6377", "146740", "2021-06-16"],
  ["a145eff6-be34-4550-a7d3-8394a899262b", "6714", "157826", "2023-06-21"],
  ["7fa2b07b-f390-4d0f-87d5-354a68b1c593", "6756", "157888", "2023-09-27"],
  ["e473c35a-fe74-4bd0-b3e9-02604fbe2e9f", "6777", "158930", "2023-11-08"],
] as const
const retiradas = snapshot.linhas.map((l) => String(l.id)).filter((id) => !mantidas.some((m) => m[0] === id))

const votosNovos = evidencia.votos.map((v) =>
  `  (${escapar(v.linhaId)}::uuid, ${escapar(v.slug)}, ${escapar(v.voto)})`
).join(",\n")

const updates = mantidas.map(([id, evento, materia, data]) => `-- @write tabela=votacoes_chave ref=${evento} campos=fonte,votacao_id_api,proposicao_id,data_votacao
update public.votacoes_chave
set fonte = 'senado', votacao_id_api = ${escapar(evento)}, proposicao_id = ${escapar(materia)}, data_votacao = ${dataSql(data)}
where id = ${escapar(id)}::uuid;`).join("\n\n")

const migration = `-- Item 7: reconcilia as 13 linhas do Senado com eventos nominais exatos.
-- Fonte e universo congelados em QA/evidencias/2026-08-11-item7-senado/.
-- Antes: 13 linhas e 81 pares. Depois: 6 eventos e 75 pares com polaridade pública.
-- Sete linhas são retiradas fail-closed: incoerentes, duplicadas, secretas ou não nominais.

do $$
declare
  algum_candidato uuid;
begin
  select id into algum_candidato from public.candidatos limit 1;
  if algum_candidato is null then
    return;
  end if;
  if (select count(*) from public.votacoes_chave where casa = 'Senado') <> 13 then
    raise exception 'senado exato: esperado universo anterior de 13 linhas';
  end if;
  if (select count(*) from public.votos_candidato v join public.votacoes_chave k on k.id=v.votacao_id where k.casa='Senado') <> 81 then
    raise exception 'senado exato: esperado universo anterior de 81 pares';
  end if;
end $$;

-- @write tabela=votos_candidato ref=senado-reset-81 campos=candidato_id,votacao_id,voto
delete from public.votos_candidato
using (values ('senado-reset-81')) as auditoria(ref)
where votacao_id in (select id from public.votacoes_chave where casa = 'Senado')
  and auditoria.ref = 'senado-reset-81';

-- @write tabela=votacoes_chave ref=senado-retirar-7 campos=id
delete from public.votacoes_chave
using (values ('senado-retirar-7')) as auditoria(ref)
where id in (${retiradas.map((id) => `${escapar(id)}::uuid`).join(", ")})
  and auditoria.ref = 'senado-retirar-7';

${updates}

-- @write tabela=votos_candidato ref=senado-exatos-75 campos=candidato_id,votacao_id,voto
insert into public.votos_candidato (candidato_id, votacao_id, voto)
with auditoria(ref) as (values ('senado-exatos-75')),
curadoria(votacao_id, slug, voto) as (values
${votosNovos}
)
select c.id, x.votacao_id, x.voto
from curadoria x
join public.candidatos c on c.slug = x.slug
cross join auditoria a
where a.ref = 'senado-exatos-75';

do $$
begin
  if (select count(*) from public.candidatos) = 0
     and (select count(*) from public.votacoes_chave where casa = 'Senado') = 0 then
    return;
  end if;
  if (select count(*) from public.votacoes_chave where casa='Senado') <> 6 then
    raise exception 'senado exato: esperado universo final de 6 linhas';
  end if;
  if (select count(*) from public.votos_candidato v join public.votacoes_chave k on k.id=v.votacao_id where k.casa='Senado') <> 75 then
    raise exception 'senado exato: esperado universo final de 75 pares';
  end if;
  if exists (select 1 from public.votacoes_chave where casa='Senado' and (fonte<>'senado' or votacao_id_api is null)) then
    raise exception 'senado exato: restou linha sem evento oficial exato';
  end if;
end $$;
`

const linhasOriginais = snapshot.linhas.map((l) => `  (${escapar(l.id)}::uuid, ${escapar(l.titulo)}, ${escapar(l.descricao)}, ${dataSql(l.data_votacao)}, ${escapar(l.casa)}, ${escapar(l.proposicao_id)}, ${escapar(l.tema)}, ${escapar(l.impacto_popular)}, ${timestampSql(l.created_at)}, null, null)`).join(",\n")
const paresOriginais = snapshot.pares.map((p) => `  (${escapar(p.id)}::uuid, ${escapar(p.candidatos.slug)}, ${escapar(p.votacao_id)}::uuid, ${escapar(p.voto)}, ${p.contradicao === true ? "true" : "false"}, ${escapar(p.contradicao_descricao)}, ${timestampSql(p.created_at)})`).join(",\n")

const rollback = `-- Rollback exato da migration 20260811100000. Restaura o snapshot read-only de produção.
delete from public.votos_candidato
where votacao_id in (select id from public.votacoes_chave where casa='Senado');
delete from public.votacoes_chave where casa='Senado';

insert into public.votacoes_chave
  (id,titulo,descricao,data_votacao,casa,proposicao_id,tema,impacto_popular,created_at,fonte,votacao_id_api)
values
${linhasOriginais};

with antigos(id,slug,votacao_id,voto,contradicao,contradicao_descricao,created_at) as (values
${paresOriginais}
)
insert into public.votos_candidato
  (id,candidato_id,votacao_id,voto,contradicao,contradicao_descricao,created_at)
select a.id,c.id,a.votacao_id,a.voto,a.contradicao,a.contradicao_descricao,a.created_at
from antigos a join public.candidatos c on c.slug=a.slug;

do $$ begin
  if (select count(*) from public.votacoes_chave where casa='Senado') <> 13 then raise exception 'rollback Senado: esperado 13 linhas'; end if;
  if (select count(*) from public.votos_candidato v join public.votacoes_chave k on k.id=v.votacao_id where k.casa='Senado') <> 81 then raise exception 'rollback Senado: esperado 81 pares'; end if;
end $$;
`

const contract = `-- Item 7: contrato estrutural separado da curadoria 20260811100000.
alter table public.votacoes_chave
  add constraint votacoes_chave_senado_exige_evento_exato_check
  check (
    casa is distinct from 'Senado'
    or (fonte = 'senado' and votacao_id_api is not null and btrim(votacao_id_api) <> '')
  );
`

const contractRollback = `-- Rollback do contrato estrutural 20260811100100.
alter table public.votacoes_chave
  drop constraint if exists votacoes_chave_senado_exige_evento_exato_check;
`

const readback = `-- Readback da migration 20260811100000, somente leitura.
select casa, fonte, count(*) as linhas, count(votacao_id_api) as com_evento_exato
from public.votacoes_chave where casa='Senado' group by casa,fonte;

select k.titulo,k.data_votacao,k.proposicao_id,k.votacao_id_api,count(v.id) as pares
from public.votacoes_chave k left join public.votos_candidato v on v.votacao_id=k.id
where k.casa='Senado'
group by k.id order by k.data_votacao;

select count(*) as pares_invalidos
from public.votos_candidato v join public.votacoes_chave k on k.id=v.votacao_id
where k.casa='Senado' and v.voto not in ('sim','não','abstenção','obstrução');
-- Esperado: 6 linhas, 75 pares, 0 pares_invalidos.
`

writeFileSync(MIGRATION, migration)
writeFileSync(ROLLBACK, rollback)
writeFileSync(READBACK, readback)
writeFileSync(CONTRACT, contract)
writeFileSync(CONTRACT_ROLLBACK, contractRollback)
console.log(JSON.stringify({ migration: MIGRATION, contract: CONTRACT, rollback: ROLLBACK, readback: READBACK, votos: evidencia.votos.length }))
