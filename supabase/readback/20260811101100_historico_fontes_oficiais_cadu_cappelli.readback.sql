-- Esperado: 5|5|5|5|1|0|1|0, além de zero divergência de payload.
create temp table pf_readback_historico_oficial as
with desejado (slug, cargo, periodo_inicio, periodo_fim, observacoes, proveniencia) as (
  values
    ('cadu-xavier', 'Secretário de Estado da Fazenda do Rio Grande do Norte', 2019, 2026, 'Secretário de Estado da Fazenda do Rio Grande do Norte de 2019 a 2026; exoneração publicada na edição extra do DOE/RN de 31/03/2026. Fonte oficial: https://webdisk.diariooficial.rn.gov.br/Jornal/12026-03-31E.pdf', 'manual'),
    ('ricardo-cappelli', 'Presidente da ABDI', 2024, 2026, 'Presidente da ABDI de 2024 a 2026. Fontes oficiais: https://www.abdi.com.br/institucional/ex-presidentes/ e https://www.abdi.com.br/cerimonia-formaliza-posse-de-ricardo-cappelli-na-presidencia-da-abdi/', 'manual'),
    ('ricardo-cappelli', 'Interventor na Segurança Pública do Distrito Federal', 2023, 2023, 'Interventor federal na segurança pública do Distrito Federal em 2023. Fonte oficial do Ministério da Justiça e Segurança Pública: https://www.gov.br/mj/pt-br/assuntos/noticias/intervencao-federal-na-seguranca-do-df-e-concluida-apos-23-dias-de-vigencia/', 'manual'),
    ('ricardo-cappelli', 'Secretário-Executivo do MJSP', 2023, 2024, 'Secretário-Executivo do Ministério da Justiça e Segurança Pública de 2023 a 2024. Fonte oficial: https://www.gov.br/mj/pt-br/assuntos/noticias/intervencao-federal-na-seguranca-do-df-e-concluida-apos-23-dias-de-vigencia/', 'manual'),
    ('ricardo-cappelli', 'Ministro', 2023, 2023, 'Ministro-chefe interino do Gabinete de Segurança Institucional em 2023. Fonte oficial do GSI: https://www.gov.br/gsi/pt-br/centrais-de-conteudo/noticias/2023-1/nota-a-imprensa', 'manual')
),
ativas as (
  select c.slug, h.cargo, h.periodo_inicio, h.periodo_fim, h.observacoes, h.proveniencia
  from public.historico_politico h
  join public.candidatos c on c.id = h.candidato_id
  where c.slug in ('cadu-xavier', 'ricardo-cappelli')
    and h.despublicado_em is null
),
divergencias as (
  (select * from desejado except select * from ativas)
  union all
  (select * from ativas except select * from desejado)
)
select
  (select count(*) from desejado) as linhas_esperadas,
  (select count(*) from ativas) as linhas_ativas,
  (select count(*) from desejado d join ativas a using (slug, cargo, periodo_inicio, periodo_fim, observacoes, proveniencia)) as payload_exato,
  (select count(*) from ativas where observacoes like '%https://%') as fontes_oficiais,
  (select count(*) from ativas where slug='ricardo-cappelli' and cargo='Presidente da ABDI' and periodo_inicio=2024 and periodo_fim=2026) as abdi_corrigida,
  (select count(*) from ativas where slug='ricardo-cappelli' and cargo='Presidente da ABDI' and periodo_inicio=2019 and periodo_fim=2023) as abdi_antiga,
  (select count(*) from supabase_migrations.schema_migrations where version='20260811101100') as ledger,
  (select count(*) from divergencias) as divergencias;

do $readback$
declare r pf_readback_historico_oficial%rowtype;
begin
  select * into strict r from pf_readback_historico_oficial;
  if r.linhas_esperadas <> 5 or r.linhas_ativas <> 5 or r.payload_exato <> 5
     or r.fontes_oficiais <> 5 or r.abdi_corrigida <> 1
     or r.abdi_antiga <> 0 or r.ledger <> 1 or r.divergencias <> 0 then
    raise exception 'readback 20260811101100: %', row_to_json(r);
  end if;
end
$readback$;

table pf_readback_historico_oficial;
