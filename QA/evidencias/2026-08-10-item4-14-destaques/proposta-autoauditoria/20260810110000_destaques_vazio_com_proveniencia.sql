-- Itens 4 e 14: materializa a auditoria do RECORTE PUBLICÁVEL de trajetória e
-- votações na aba Destaques. Isto não afirma que a pessoa não tem trajetória
-- política nem que nunca votou: `vazio_confirmado` significa somente que o
-- dataset atual, sob a regra editorial versionada, não produz card.
--
-- A migration não foi aplicada nesta entrega. O aplicador deve envolvê-la e a
-- linha do ledger na mesma transação externa.

-- Congela o universo dentro da própria transação. A cardinalidade medida no
-- ambiente público nesta entrega é 194, mas a migration não pode deixar de
-- replayar em banco vazio parcial nem ignorar uma ficha futura. Universo vazio
-- é a única cardinalidade impossível de auditar e aborta fail-closed.
create temp table _destaques_vazio_universo on commit drop as
select id, slug from public.candidatos_publico;

do $$
declare
  publicas integer;
  existentes integer;
begin
  select count(*) into publicas from _destaques_vazio_universo;
  if publicas = 0 then
    raise exception 'pre-condicao: universo vazio; remeça as fichas publicas antes de aplicar';
  end if;

  select count(*) into existentes
    from public.coleta_log
   where execucao = 'migration:20260810110000'
     and fonte in ('destaques-trajetoria', 'destaques-votacoes');
  if existentes <> 0 then
    raise exception 'pre-condicao: execucao migration:20260810110000 ja tem % linha(s)', existentes;
  end if;
end $$;
-- A regra SQL espelha `motivoNaoPromoverMandato` em
-- src/lib/destaques-ficha.ts: evento mandato, início conhecido, cargo eletivo
-- do conjunto fechado ou chefia de pasta, com guard partidário fail-closed.
with promoviveis as (
  select
    c.id as candidato_id,
    c.slug,
    least(1, count(h.id))::integer as volume
  from _destaques_vazio_universo c
  left join public.historico_politico h
    on h.candidato_id = c.id
   and h.despublicado_em is null
   and h.tipo_evento = 'mandato'
   and h.periodo_inicio is not null
   and (
     btrim(coalesce(h.cargo_canonico, h.cargo, '')) in (
       'Presidente', 'Vice-Presidente', 'Governador', 'Vice-Governador',
       'Prefeito', 'Vice-Prefeito', 'Senador', 'Deputado Federal',
       'Deputado Estadual', 'Deputado Distrital', 'Vereador'
     )
     or btrim(coalesce(h.cargo_canonico, h.cargo, '')) ~* '^(ministr[oa]|secret[áa]ri[oa])([^[:alpha:]]|$)'
   )
   and btrim(coalesce(h.cargo_canonico, h.cargo, '')) !~* '(partido|diret[óo]rio|executiva|federa[çc][ãa]o partid[áa]ria)'
  group by c.id, c.slug
)
-- @write tabela=coleta_log ref=destaques-trajetoria campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao
insert into public.coleta_log
  (fonte, escopo, alvo, candidato_id, executado_em, resultado, volume, detalhe, url, execucao)
select
  'destaques-trajetoria',
  'candidato',
  slug,
  candidato_id,
  now(),
  case when volume > 0 then 'encontrado' else 'vazio_confirmado' end,
  volume,
  case
    when volume > 0 then 'Recorte de mandatos promovíveis auditado; cards publicáveis encontrados.'
    else 'Recorte de mandatos promovíveis auditado; nenhum card publicável.'
  end,
  null,
  'migration:20260810110000'
from promoviveis;

-- `votos_candidato` só entra quando a votação-chave referenciada existe. É a
-- mesma condição do join que o DTO e o componente exigem para publicar card.
with publicaveis as (
  select
    c.id as candidato_id,
    c.slug,
    least(1, count(vc.id))::integer as volume
  from _destaques_vazio_universo c
  left join public.votos_candidato v on v.candidato_id = c.id
  left join public.votacoes_chave vc on vc.id = v.votacao_id
  group by c.id, c.slug
)
-- @write tabela=coleta_log ref=destaques-votacoes campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao
insert into public.coleta_log
  (fonte, escopo, alvo, candidato_id, executado_em, resultado, volume, detalhe, url, execucao)
select
  'destaques-votacoes',
  'candidato',
  slug,
  candidato_id,
  now(),
  case when volume > 0 then 'encontrado' else 'vazio_confirmado' end,
  volume,
  case
    when volume > 0 then 'Recorte de votações-chave auditado; votos publicáveis encontrados.'
    else 'Recorte de votações-chave auditado; nenhum voto publicável.'
  end,
  null,
  'migration:20260810110000'
from publicaveis;

do $$
declare
  trajetoria integer;
  votacoes integer;
  incoerentes integer;
  esperadas integer;
begin
  select count(*) into esperadas from _destaques_vazio_universo;
  select count(*) filter (where fonte = 'destaques-trajetoria'),
         count(*) filter (where fonte = 'destaques-votacoes'),
         count(*) filter (where (resultado = 'encontrado') <> (volume > 0))
    into trajetoria, votacoes, incoerentes
    from public.coleta_log
   where execucao = 'migration:20260810110000';

  if trajetoria <> esperadas or votacoes <> esperadas then
    raise exception 'pos-condicao: trajetoria %, votacoes %, esperadas % em cada fonte', trajetoria, votacoes, esperadas;
  end if;
  if incoerentes <> 0 then
    raise exception 'pos-condicao: % linha(s) contradizem resultado e volume', incoerentes;
  end if;
end $$;
