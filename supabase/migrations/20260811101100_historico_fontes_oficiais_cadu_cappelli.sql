-- Corrige a proveniência das cinco trajetórias ativas de Cadu Xavier e
-- Ricardo Cappelli com fontes oficiais específicas. Também corrige a gestão
-- de Ricardo na ABDI de 2019-2023 para 2024-2026.
--
-- Aplicação futura: a linha 20260811101100 do ledger deve ser gravada pelo
-- procedimento canônico na mesma transação externa desta migration.

create temp table _historico_fontes_oficiais_cadu_cappelli (
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

insert into _historico_fontes_oficiais_cadu_cappelli values
  (
    'cadu-xavier',
    'Secretário de Estado da Fazenda do Rio Grande do Norte',
    'RN', 2019, 2026,
    'Exoneração publicada em 30/03/2026 para desincompatibilização eleitoral (DOE/RN edição extra 31/03/2026)',
    'manual',
    2019, 2026,
    'Secretário de Estado da Fazenda do Rio Grande do Norte de 2019 a 2026; exoneração publicada na edição extra do DOE/RN de 31/03/2026. Fonte oficial: https://webdisk.diariooficial.rn.gov.br/Jornal/12026-03-31E.pdf',
    'manual'
  ),
  (
    'ricardo-cappelli',
    'Presidente da ABDI',
    'DF', 2019, 2023,
    'Presidência da ABDI até 2023 (Metrópoles + curadoria 13.csv)',
    null,
    2024, 2026,
    'Presidente da ABDI de 2024 a 2026. Fontes oficiais: https://www.abdi.com.br/institucional/ex-presidentes/ e https://www.abdi.com.br/cerimonia-formaliza-posse-de-ricardo-cappelli-na-presidencia-da-abdi/',
    'manual'
  ),
  (
    'ricardo-cappelli',
    'Interventor na Segurança Pública do Distrito Federal',
    'DF', 2023, 2023,
    'Intervenção federal na segurança do DF em 2023 (curadoria 13.csv)',
    null,
    2023, 2023,
    'Interventor federal na segurança pública do Distrito Federal em 2023. Fonte oficial do Ministério da Justiça e Segurança Pública: https://www.gov.br/mj/pt-br/assuntos/noticias/intervencao-federal-na-seguranca-do-df-e-concluida-apos-23-dias-de-vigencia/',
    'manual'
  ),
  (
    'ricardo-cappelli',
    'Secretário-Executivo do MJSP',
    'BR', 2023, 2024,
    'Ministério da Justiça e Segurança Pública (curadoria 13.csv)',
    null,
    2023, 2024,
    'Secretário-Executivo do Ministério da Justiça e Segurança Pública de 2023 a 2024. Fonte oficial: https://www.gov.br/mj/pt-br/assuntos/noticias/intervencao-federal-na-seguranca-do-df-e-concluida-apos-23-dias-de-vigencia/',
    'manual'
  ),
  (
    'ricardo-cappelli',
    'Ministro',
    null, 2023, 2023,
    'Importado automaticamente de Wikidata P39 em 2026-08-05',
    'wikidata',
    2023, 2023,
    'Ministro-chefe interino do Gabinete de Segurança Institucional em 2023. Fonte oficial do GSI: https://www.gov.br/gsi/pt-br/centrais-de-conteudo/noticias/2023-1/nota-a-imprensa',
    'manual'
  );

do $$
declare
  candidatos_encontrados integer;
  linhas_ativas integer;
  linhas_exatas integer;
  linhas_atualizadas integer;
  linhas_extras integer;
begin
  select count(*) into candidatos_encontrados
  from public.candidatos
  where slug in ('cadu-xavier', 'ricardo-cappelli');

  if candidatos_encontrados <> 2 then
    raise exception 'historico fontes oficiais: esperados 2 candidatos, encontrados %', candidatos_encontrados;
  end if;

  select count(*) into linhas_ativas
  from public.historico_politico h
  join public.candidatos c on c.id = h.candidato_id
  where c.slug in ('cadu-xavier', 'ricardo-cappelli')
    and h.despublicado_em is null;

  select count(*) into linhas_exatas
  from _historico_fontes_oficiais_cadu_cappelli e
  join public.candidatos c on c.slug = e.slug
  join public.historico_politico h
    on h.candidato_id = c.id
   and h.cargo = e.cargo
   and h.estado is not distinct from e.estado_anterior
   and h.periodo_inicio is not distinct from e.inicio_anterior
   and h.periodo_fim is not distinct from e.fim_anterior
   and h.observacoes is not distinct from e.observacoes_anteriores
   and h.proveniencia is not distinct from e.proveniencia_anterior
   and h.despublicado_em is null;

  select count(*) into linhas_extras
  from public.historico_politico h
  join public.candidatos c on c.id = h.candidato_id
  left join _historico_fontes_oficiais_cadu_cappelli e
    on e.slug = c.slug and e.cargo = h.cargo
  where c.slug in ('cadu-xavier', 'ricardo-cappelli')
    and h.despublicado_em is null
    and e.slug is null;

  if linhas_ativas <> 5 or linhas_exatas <> 5 or linhas_extras <> 0 then
    raise exception 'historico fontes oficiais: precondicao recusada (ativas %, exatas %, extras %)',
      linhas_ativas, linhas_exatas, linhas_extras;
  end if;

  -- @write tabela=historico_politico ref=historico-fontes-oficiais:cadu-cappelli campos=periodo_inicio,periodo_fim,observacoes,proveniencia
  update public.historico_politico h
  set periodo_inicio = e.inicio_novo,
      periodo_fim = e.fim_novo,
      observacoes = e.observacoes_novas,
      proveniencia = e.proveniencia_nova
  from public.candidatos c
  join _historico_fontes_oficiais_cadu_cappelli e on e.slug = c.slug
  cross join (values ('historico-fontes-oficiais:cadu-cappelli')) as lote(ref)
  where h.candidato_id = c.id
    and h.cargo = e.cargo
    and h.estado is not distinct from e.estado_anterior
    and h.periodo_inicio is not distinct from e.inicio_anterior
    and h.periodo_fim is not distinct from e.fim_anterior
    and h.observacoes is not distinct from e.observacoes_anteriores
    and h.proveniencia is not distinct from e.proveniencia_anterior
    and h.despublicado_em is null
    and lote.ref = 'historico-fontes-oficiais:cadu-cappelli';

  get diagnostics linhas_atualizadas = row_count;
  if linhas_atualizadas <> 5 then
    raise exception 'historico fontes oficiais: esperadas 5 atualizacoes, observadas %', linhas_atualizadas;
  end if;

  if (
    select count(*)
    from _historico_fontes_oficiais_cadu_cappelli e
    join public.candidatos c on c.slug = e.slug
    join public.historico_politico h
      on h.candidato_id = c.id
     and h.cargo = e.cargo
     and h.periodo_inicio is not distinct from e.inicio_novo
     and h.periodo_fim is not distinct from e.fim_novo
     and h.observacoes = e.observacoes_novas
     and h.proveniencia = e.proveniencia_nova
     and h.despublicado_em is null
  ) <> 5 then
    raise exception 'historico fontes oficiais: pos-condicao recusada';
  end if;
end $$;
