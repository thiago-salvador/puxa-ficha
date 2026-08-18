import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const VERSION = "20260811101000"
const EXECUCAO = `migration:${VERSION}`
const MANIFESTO = resolve("QA/evidencias/2026-08-11-itens-4-14-destaques/matriz-fontes-194.json")
const migration = resolve(`supabase/migrations/${VERSION}_destaques_estados_residuais_194.sql`)
const rollback = resolve(`supabase/rollback/${VERSION}_destaques_estados_residuais_194.rollback.sql`)
const readback = resolve(`supabase/readback/${VERSION}_destaques_estados_residuais_194.readback.sql`)
const allowlist = resolve("scripts/audit/allowlist-destaques-estados-residuais-194-20260811.json")

type Linha = { slug: string; fonte_log: string; resultado: string; executado_em: string; detalhe: string; url: string | null }
const dados = JSON.parse(readFileSync(MANIFESTO, "utf8")) as { persistencia: Linha[] }
const linhas = [...dados.persistencia].sort((a, b) => `${a.fonte_log}:${a.slug}`.localeCompare(`${b.fonte_log}:${b.slug}`))

function q(valor: string | null): string {
  return valor === null ? "null" : `'${valor.replaceAll("'", "''")}'`
}

function values(): string {
  return linhas.map((l) => `  (${q(l.slug)}, ${q(l.fonte_log)}, ${q(l.resultado)}, ${q(l.executado_em)}::timestamptz, ${q(l.detalhe)}, ${q(l.url)})`).join(",\n")
}

const tabela = `create temp table _destaques_estados_residuais_194 (
  slug text not null,
  fonte text not null,
  resultado text not null,
  executado_em timestamptz not null,
  detalhe text not null,
  url text,
  primary key (slug, fonte)
) on commit drop;

insert into _destaques_estados_residuais_194 (slug, fonte, resultado, executado_em, detalhe, url) values
${values()};`

const forward = `-- Estados explícitos e fail-closed para as células residuais dos itens 4/14.
-- Manifesto nominal 194x5: QA/evidencias/2026-08-11-itens-4-14-destaques/matriz-fontes-194.json
-- Nenhuma linha afirma vazio: consultas limitadas usam sem_achado_no_escopo;
-- identidade/payload insuficiente usa indeterminado.

${tabela}

do $$
declare
  publicas integer;
  alvos integer;
  existentes integer;
  posteriores integer;
begin
  select count(*) into publicas from public.candidatos_publico;
  if publicas <> 194 then raise exception 'pre-condicao: universo publico %, esperado 194', publicas; end if;
  select count(*) into alvos from _destaques_estados_residuais_194 a join public.candidatos_publico c on c.slug = a.slug;
  if alvos <> 292 then raise exception 'pre-condicao: alvos publicos %, esperado 292', alvos; end if;
  if (select count(*) from _destaques_estados_residuais_194 where fonte='destaques-trajetoria') <> 80
     or (select count(*) from _destaques_estados_residuais_194 where fonte='destaques-patrimonio') <> 32
     or (select count(*) from _destaques_estados_residuais_194 where fonte='destaques-votacoes') <> 180
     or exists (select 1 from _destaques_estados_residuais_194 where resultado not in ('indeterminado','sem_achado_no_escopo'))
  then raise exception 'pre-condicao: cardinalidade ou resultado do manifesto divergente'; end if;
  select count(*) into existentes from public.coleta_log where execucao=${q(EXECUCAO)};
  if existentes <> 0 then raise exception 'pre-condicao: execucao ja tem % linha(s)', existentes; end if;
  select count(*) into posteriores
    from public.coleta_log l join _destaques_estados_residuais_194 a on a.slug=l.alvo and a.fonte=l.fonte
   where l.escopo='candidato' and l.executado_em >= a.executado_em;
  if posteriores <> 0 then raise exception 'pre-condicao: % verificacao(oes) igual(is) ou posterior(es) ao manifesto', posteriores; end if;
end $$;

-- @write tabela=coleta_log ref=destaques-estados-residuais:194x3 campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
insert into public.coleta_log
  (fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza)
select a.fonte,'candidato',a.slug,c.id,a.executado_em,a.resultado,0,a.detalhe,a.url,${q(EXECUCAO)},'coleta'
from _destaques_estados_residuais_194 a
join public.candidatos_publico c on c.slug=a.slug
cross join (values ('destaques-estados-residuais:194x3')) as lote(ref)
where lote.ref='destaques-estados-residuais:194x3';

do $$
declare gravadas integer; divergentes integer;
begin
  select count(*) into gravadas from public.coleta_log where execucao=${q(EXECUCAO)};
  select count(*) into divergentes
    from _destaques_estados_residuais_194 a
    join public.candidatos_publico c on c.slug=a.slug
    left join public.coleta_log l on l.execucao=${q(EXECUCAO)} and l.alvo=a.slug and l.fonte=a.fonte
   where l.candidato_id is distinct from c.id or l.escopo is distinct from 'candidato'
      or l.executado_em is distinct from a.executado_em or l.resultado is distinct from a.resultado
      or l.volume is distinct from 0 or l.detalhe is distinct from a.detalhe
      or l.url is distinct from a.url or l.natureza is distinct from 'coleta';
  if gravadas <> 292 or divergentes <> 0 then raise exception 'pos-condicao: gravadas %, divergentes %', gravadas, divergentes; end if;
end $$;
`

const back = `-- Rollback fail-closed do manifesto nominal. Payload alterado não é apagado.
${tabela}

do $$
declare linhas integer; divergentes integer;
begin
  select count(*) into linhas from public.coleta_log where execucao=${q(EXECUCAO)};
  select count(*) into divergentes
    from _destaques_estados_residuais_194 a
    join public.candidatos_publico c on c.slug=a.slug
    left join public.coleta_log l on l.execucao=${q(EXECUCAO)} and l.alvo=a.slug and l.fonte=a.fonte
   where l.candidato_id is distinct from c.id or l.escopo is distinct from 'candidato'
      or l.executado_em is distinct from a.executado_em or l.resultado is distinct from a.resultado
      or l.volume is distinct from 0 or l.detalhe is distinct from a.detalhe
      or l.url is distinct from a.url or l.natureza is distinct from 'coleta';
  if linhas <> 292 or divergentes <> 0 then raise exception 'rollback recusado: linhas %, divergentes %', linhas, divergentes; end if;
end $$;

-- @write tabela=coleta_log ref=destaques-estados-residuais:194x3:rollback campos=fonte,execucao
delete from public.coleta_log l using _destaques_estados_residuais_194 a
 where l.execucao=${q(EXECUCAO)} and l.fonte=a.fonte and l.alvo=a.slug
   and 'destaques-estados-residuais:194x3:rollback'='destaques-estados-residuais:194x3:rollback';

-- @write tabela=schema_migrations ref=${VERSION}:rollback campos=version
delete from supabase_migrations.schema_migrations where version=${q(VERSION)} and '${VERSION}:rollback'='${VERSION}:rollback';

do $$ begin
  if exists (select 1 from public.coleta_log where execucao=${q(EXECUCAO)}) then raise exception 'pos-condicao: sobraram linhas residuais'; end if;
end $$;
`

const rb = `-- Esperado: 292 linhas, 180 fichas, 241 indeterminados, 51 limitados e zero vazio fabricado.
create temp table pf_readback_destaques_194 as
select
  (select count(*) from supabase_migrations.schema_migrations where version=${q(VERSION)}) as ledger,
  (select count(*) from supabase_migrations.schema_migrations where version='20260811102100') as split_identidade_ledger,
  count(*) as linhas,
  count(distinct alvo) as fichas,
  count(*) filter (where fonte='destaques-trajetoria') as trajetoria,
  count(*) filter (where fonte='destaques-patrimonio') as patrimonio,
  count(*) filter (where fonte='destaques-votacoes') as votacoes,
  count(*) filter (where resultado='indeterminado') as indeterminados,
  count(*) filter (where resultado='sem_achado_no_escopo') as limitados,
  count(*) filter (where resultado='vazio_confirmado') as vazios_incorretos,
  md5(string_agg(
    concat_ws(chr(30),
      l.fonte,
      l.escopo,
      l.alvo,
      coalesce(c.slug, '<null>'),
      to_char(l.executado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      l.resultado,
      l.volume::text,
      coalesce(l.detalhe, '<null>'),
      coalesce(l.url, '<null>'),
      l.execucao,
      l.natureza
    ),
    chr(31) order by l.fonte collate "C", l.alvo collate "C"
  )) as assinatura_payload
from public.coleta_log l
left join public.candidatos c on c.id=l.candidato_id
where l.execucao=${q(EXECUCAO)};

do $readback$
declare r pf_readback_destaques_194%rowtype;
begin
  select * into strict r from pf_readback_destaques_194;
  if r.ledger <> 1 or r.linhas <> 292 or r.fichas <> 180
     or r.trajetoria <> 80 or r.patrimonio <> 32 or r.votacoes <> 180
     or r.indeterminados <> 241 or r.limitados <> 51
     or r.vazios_incorretos <> 0
     or r.split_identidade_ledger not in (0, 1)
     or r.assinatura_payload is distinct from (case r.split_identidade_ledger
       when 0 then '456ba86bfc5de2cc7a51714f4cef0f8c'
       when 1 then '95cc5a76055102f6b8684ad33818d731'
       else null
     end) then
    raise exception 'readback ${VERSION}: %', row_to_json(r);
  end if;
end
$readback$;

table pf_readback_destaques_194;
`

for (const [path, content] of [[migration, forward], [rollback, back], [readback, rb]] as const) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
writeFileSync(allowlist, `${JSON.stringify({
  _comentario: "292 estados nominais sem vazio fabricado: 241 indeterminados e 51 recortes limitados.",
  recorte: "destaques-estados-residuais-194-20260811",
  migration: `${VERSION}_destaques_estados_residuais_194.sql`,
  fonte: "QA/evidencias/2026-08-11-itens-4-14-destaques/matriz-fontes-194.json",
  coorte: [],
  fora_por_construcao: { slugs: [] },
  entries: [],
  referencias: [{ tabela: "coleta_log", ref: "destaques-estados-residuais:194x3", campos: ["fonte","escopo","alvo","candidato_id","executado_em","resultado","volume","detalhe","url","execucao","natureza"] }],
}, null, 2)}\n`)
console.log(JSON.stringify({ version: VERSION, linhas: linhas.length, migration, rollback, readback, allowlist }, null, 2))
