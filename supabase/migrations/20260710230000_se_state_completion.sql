-- SE state completion: official profiles, electoral histories and provenance.

update public.candidatos
set data_nascimento = date '1969-05-16',
    naturalidade = 'Aracaju/SE',
    formacao = 'SUPERIOR COMPLETO',
    profissao_declarada = 'JORNALISTA E REDATOR',
    cargo_atual = 'Vice-prefeito de Aracaju',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array[
      'TSE consulta_cand 2020, 2022 e 2024',
      'Prefeitura de Aracaju - perfil oficial do vice-prefeito'
    ],
    ultima_atualizacao = now()
where slug = 'ricardo-marques';

update public.candidatos
set nome_completo = 'Emanuel Messias Oliveira Cacho',
    data_nascimento = date '1959-12-20',
    naturalidade = 'Aracaju/SE',
    formacao = 'SUPERIOR COMPLETO',
    profissao_declarada = 'ADVOGADO',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array[
      'TSE consulta_cand 2006, 2010 e 2014',
      'OAB Conselho Federal - ex-secretario de Estado da Justica e Cidadania de Sergipe'
    ],
    ultima_atualizacao = now()
where slug = 'emanuel-cacho';

update public.candidatos
set nome_completo = 'José Helton Silva Monteiro',
    formacao = 'MEDICINA',
    profissao_declarada = 'MÉDICO',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array[
      'Sindimed-SE - diretoria institucional',
      'TSE consulta_cand SE 2004-2024 sem candidatura nominal correspondente'
    ],
    ultima_atualizacao = now()
where slug = 'dr-helton-monteiro';

update public.candidatos
set nome_completo = 'Fábio Cruz Mitidieri',
    data_nascimento = date '1977-02-24',
    naturalidade = 'Aracaju/SE',
    formacao = 'SUPERIOR COMPLETO',
    profissao_declarada = 'ADMINISTRADOR',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array[
      'TSE consulta_cand 2008, 2010, 2012, 2014, 2018 e 2022',
      'Camara dos Deputados - deputado 178969',
      'Governo de Sergipe - governador desde 2023'
    ],
    ultima_atualizacao = now()
where slug = 'fabio-mitidieri';

delete from public.historico_politico
where candidato_id in (
  select id from public.candidatos where slug in (
    'ricardo-marques', 'emanuel-cacho', 'dr-helton-monteiro',
    'fabio-mitidieri', 'valmir-de-francisquinho'
  )
);

insert into public.historico_politico (
  candidato_id, cargo, cargo_canonico, tipo_evento, periodo_inicio, periodo_fim,
  partido, estado, eleito_por, observacoes, proveniencia
)
select c.id, v.cargo, v.cargo_canonico, v.tipo_evento, v.inicio, v.fim,
       v.partido, 'SE', v.eleito_por, v.observacoes, v.proveniencia
from public.candidatos c
join (values
  ('ricardo-marques','Vereador de Aracaju','Vereador','mandato',2021,2024,'CIDADANIA','voto direto','Eleito em 2020, SQ 260000657536, CPF [documento removido].','tse'),
  ('ricardo-marques','Deputado Estadual','Deputado Estadual','candidatura',2022,2022,'CIDADANIA','suplente','Candidatura em 2022, SQ 260001600206, CPF [documento removido].','tse'),
  ('ricardo-marques','Vice-prefeito de Aracaju','Vice-prefeito','mandato',2025,2028,'CIDADANIA','voto direto','Eleito em 2024, SQ 260001926363; posse oficial em 01/01/2025.','misto'),

  ('emanuel-cacho','2º suplente de Senador','Suplente de Senador','candidatura',2006,2006,'PFL','nao eleito','Candidatura TSE 2006, SQ 10106, CPF [documento removido].','tse'),
  ('emanuel-cacho','Secretário de Estado da Justiça e Cidadania','Secretário de Estado','mandato',2003,2006,null,'nomeacao','Atuação confirmada pela OAB Conselho Federal e por documentos públicos do período.','manual'),
  ('emanuel-cacho','Senador','Senador','candidatura',2010,2010,'PPS','nao eleito','Candidatura TSE 2010, SQ 260000000243, CPF [documento removido].','tse'),
  ('emanuel-cacho','Deputado Estadual','Deputado Estadual','candidatura',2014,2014,'PATRIOTA','nao eleito','Candidatura TSE 2014, SQ 260000000285, CPF [documento removido], situação INAPTO.','tse'),

  ('dr-helton-monteiro','Dirigente do Sindimed-SE','Dirigente sindical','mandato',2022,null,null,'eleicao interna','Nome civil José Helton Silva Monteiro consta na diretoria institucional do Sindimed-SE.','manual'),
  ('dr-helton-monteiro','Governador','Governador','candidatura',2026,2026,'PSOL','pre-candidato','Pré-candidatura anunciada em plenária estadual em 07/04/2026; nenhuma candidatura TSE homônima foi localizada em SE entre 2004 e 2024.','manual'),

  ('fabio-mitidieri','Vereador de Aracaju','Vereador','mandato',2009,2014,'PDT','voto direto','Eleito em 2008, SQ 2182, CPF [documento removido].','tse'),
  ('fabio-mitidieri','Vereador de Aracaju','Vereador','candidatura',2012,2012,'PSD','suplente','Candidatura TSE 2012, SQ 260000005723.','tse'),
  ('fabio-mitidieri','Deputado Federal','Deputado Federal','mandato',2015,2018,'PSD','voto direto','Eleito em 2014, SQ 260000000184; mandato confirmado pela Câmara.','misto'),
  ('fabio-mitidieri','Deputado Federal','Deputado Federal','mandato',2019,2022,'PSD','voto direto','Reeleito em 2018, SQ 260000623594; mandato confirmado pela Câmara.','misto'),
  ('fabio-mitidieri','Governador de Sergipe','Governador','mandato',2023,null,'PSD','voto direto','Eleito em 2022, SQ 260001612779; exercício confirmado pelo Governo de Sergipe.','misto'),

  ('valmir-de-francisquinho','Vereador de Itabaiana','Vereador','mandato',2001,2004,'PPB','voto direto','Mandato anterior e continuidade confirmada pela candidatura TSE de 2004.','tse'),
  ('valmir-de-francisquinho','Vereador de Itabaiana','Vereador','mandato',2005,2008,'PP','voto direto','Eleito em 2004, SQ 21, CPF [documento removido].','tse'),
  ('valmir-de-francisquinho','Vereador de Itabaiana','Vereador','mandato',2009,2012,'PSB','voto direto','Eleito em 2008, SQ 1952, CPF [documento removido].','tse'),
  ('valmir-de-francisquinho','Prefeito de Itabaiana','Prefeito','mandato',2013,2016,'PR','voto direto','Eleito em 2012, SQ 260000003076.','tse'),
  ('valmir-de-francisquinho','Prefeito de Itabaiana','Prefeito','mandato',2017,2020,'PR','voto direto','Reeleito em 2016, SQ 260000000783.','tse'),
  ('valmir-de-francisquinho','Governador','Governador','candidatura',2022,2022,'PL','nao eleito','Candidatura TSE 2022, SQ 260001690206, situação INAPTO.','tse'),
  ('valmir-de-francisquinho','Prefeito de Itabaiana','Prefeito','mandato',2025,2026,'PL','voto direto','Eleito em 2024, SQ 260001935426; renúncia em abril de 2026.','misto')
) as v(slug,cargo,cargo_canonico,tipo_evento,inicio,fim,partido,eleito_por,observacoes,proveniencia)
  on c.slug = v.slug;

update public.pontos_atencao
set visivel = false
where candidato_id in (
  select id from public.candidatos where slug in (
    'ricardo-marques','emanuel-cacho','dr-helton-monteiro','fabio-mitidieri','valmir-de-francisquinho'
  )
)
and gerado_por = 'ia'
and coalesce(verificado, false) = false;
