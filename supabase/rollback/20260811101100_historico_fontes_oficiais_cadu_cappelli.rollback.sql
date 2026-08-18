-- Rollback exato da correção de proveniência e datas de Cadu/Cappelli.
-- Recusa qualquer payload posterior e remove a versão do ledger na mesma
-- transação externa usada para a recuperação.

create temp table _historico_fontes_oficiais_cadu_cappelli_rollback (
  slug text not null,
  cargo text not null,
  estado_anterior text,
  inicio_anterior integer,
  fim_anterior integer,
  observacoes_anteriores text,
  proveniencia_anterior text,
  inicio_novo integer,
  fim_novo integer,
  observacoes_novas text not null,
  proveniencia_nova text not null,
  primary key (slug, cargo)
) on commit drop;

insert into _historico_fontes_oficiais_cadu_cappelli_rollback values
  ('cadu-xavier', 'Secretário de Estado da Fazenda do Rio Grande do Norte', 'RN', 2019, 2026, 'Exoneração publicada em 30/03/2026 para desincompatibilização eleitoral (DOE/RN edição extra 31/03/2026)', 'manual', 2019, 2026, 'Secretário de Estado da Fazenda do Rio Grande do Norte de 2019 a 2026; exoneração publicada na edição extra do DOE/RN de 31/03/2026. Fonte oficial: https://webdisk.diariooficial.rn.gov.br/Jornal/12026-03-31E.pdf', 'manual'),
  ('ricardo-cappelli', 'Presidente da ABDI', 'DF', 2019, 2023, 'Presidência da ABDI até 2023 (Metrópoles + curadoria 13.csv)', null, 2024, 2026, 'Presidente da ABDI de 2024 a 2026. Fontes oficiais: https://www.abdi.com.br/institucional/ex-presidentes/ e https://www.abdi.com.br/cerimonia-formaliza-posse-de-ricardo-cappelli-na-presidencia-da-abdi/', 'manual'),
  ('ricardo-cappelli', 'Interventor na Segurança Pública do Distrito Federal', 'DF', 2023, 2023, 'Intervenção federal na segurança do DF em 2023 (curadoria 13.csv)', null, 2023, 2023, 'Interventor federal na segurança pública do Distrito Federal em 2023. Fonte oficial do Ministério da Justiça e Segurança Pública: https://www.gov.br/mj/pt-br/assuntos/noticias/intervencao-federal-na-seguranca-do-df-e-concluida-apos-23-dias-de-vigencia/', 'manual'),
  ('ricardo-cappelli', 'Secretário-Executivo do MJSP', 'BR', 2023, 2024, 'Ministério da Justiça e Segurança Pública (curadoria 13.csv)', null, 2023, 2024, 'Secretário-Executivo do Ministério da Justiça e Segurança Pública de 2023 a 2024. Fonte oficial: https://www.gov.br/mj/pt-br/assuntos/noticias/intervencao-federal-na-seguranca-do-df-e-concluida-apos-23-dias-de-vigencia/', 'manual'),
  ('ricardo-cappelli', 'Ministro', null, 2023, 2023, 'Importado automaticamente de Wikidata P39 em 2026-08-05', 'wikidata', 2023, 2023, 'Ministro-chefe interino do Gabinete de Segurança Institucional em 2023. Fonte oficial do GSI: https://www.gov.br/gsi/pt-br/centrais-de-conteudo/noticias/2023-1/nota-a-imprensa', 'manual');

do $$
declare
  linhas_ativas integer;
  linhas_exatas integer;
  linhas_extras integer;
  linhas_restauradas integer;
  ledger_rows integer;
begin
  select count(*) into ledger_rows
  from supabase_migrations.schema_migrations
  where version = '20260811101100';

  select count(*) into linhas_ativas
  from public.historico_politico h
  join public.candidatos c on c.id = h.candidato_id
  where c.slug in ('cadu-xavier', 'ricardo-cappelli')
    and h.despublicado_em is null;

  select count(*) into linhas_exatas
  from _historico_fontes_oficiais_cadu_cappelli_rollback e
  join public.candidatos c on c.slug = e.slug
  join public.historico_politico h
    on h.candidato_id = c.id
   and h.cargo = e.cargo
   and h.estado is not distinct from e.estado_anterior
   and h.periodo_inicio is not distinct from e.inicio_novo
   and h.periodo_fim is not distinct from e.fim_novo
   and h.observacoes = e.observacoes_novas
   and h.proveniencia = e.proveniencia_nova
   and h.despublicado_em is null;

  select count(*) into linhas_extras
  from public.historico_politico h
  join public.candidatos c on c.id = h.candidato_id
  left join _historico_fontes_oficiais_cadu_cappelli_rollback e
    on e.slug = c.slug and e.cargo = h.cargo
  where c.slug in ('cadu-xavier', 'ricardo-cappelli')
    and h.despublicado_em is null
    and e.slug is null;

  if ledger_rows <> 1 or linhas_ativas <> 5 or linhas_exatas <> 5 or linhas_extras <> 0 then
    raise exception 'historico fontes oficiais: rollback recusado (ledger %, ativas %, exatas %, extras %)',
      ledger_rows, linhas_ativas, linhas_exatas, linhas_extras;
  end if;

  update public.historico_politico h
  set periodo_inicio = e.inicio_anterior,
      periodo_fim = e.fim_anterior,
      observacoes = e.observacoes_anteriores,
      proveniencia = e.proveniencia_anterior
  from public.candidatos c
  join _historico_fontes_oficiais_cadu_cappelli_rollback e on e.slug = c.slug
  where h.candidato_id = c.id
    and h.cargo = e.cargo
    and h.estado is not distinct from e.estado_anterior
    and h.periodo_inicio is not distinct from e.inicio_novo
    and h.periodo_fim is not distinct from e.fim_novo
    and h.observacoes = e.observacoes_novas
    and h.proveniencia = e.proveniencia_nova
    and h.despublicado_em is null;

  get diagnostics linhas_restauradas = row_count;
  if linhas_restauradas <> 5 then
    raise exception 'historico fontes oficiais: rollback restaurou %, esperado 5', linhas_restauradas;
  end if;

  delete from supabase_migrations.schema_migrations
  where version = '20260811101100';

  get diagnostics ledger_rows = row_count;
  if ledger_rows <> 1 then
    raise exception 'historico fontes oficiais: rollback removeu % linhas de ledger, esperado 1', ledger_rows;
  end if;
end $$;
