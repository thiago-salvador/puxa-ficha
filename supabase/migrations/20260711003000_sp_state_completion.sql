-- SP state completion: TSE profile materialization and history provenance.

update public.candidatos set
  nome_completo = 'Vera Lúcia Pereira da Silva Salgado', data_nascimento = date '1967-09-12',
  naturalidade = 'PE', formacao = 'SUPERIOR COMPLETO', profissao_declarada = 'SOCIÓLOGO',
  genero = 'FEMININO', estado_civil = 'CASADO(A)', cor_raca = 'PRETA',
  fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2020 SQ 250000744464'], ultima_atualizacao = now()
where slug = 'vera-lucia';

update public.candidatos set
  data_nascimento = date '1973-05-06', naturalidade = 'SP', formacao = 'SUPERIOR COMPLETO',
  profissao_declarada = 'PREFEITO', genero = 'MASCULINO', estado_civil = 'CASADO(A)', cor_raca = 'BRANCA',
  cargo_atual = 'Ex-prefeito de Santo André',
  fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2020 SQ 250000959444'], ultima_atualizacao = now()
where slug = 'paulo-serra';

update public.candidatos set
  nome_completo = 'Eduardo Camilo Terra dos Santos', data_nascimento = date '1974-09-11',
  naturalidade = 'SP', formacao = 'SUPERIOR COMPLETO', profissao_declarada = 'SERVIDOR PÚBLICO FEDERAL',
  genero = 'MASCULINO', estado_civil = 'CASADO(A)', cor_raca = 'BRANCA',
  fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2022 SQ 250001640572'], ultima_atualizacao = now()
where slug = 'camilo-terra';

update public.candidatos set
  nome_completo = 'Izadora Cristina Dias da Silva', data_nascimento = date '1995-01-13',
  naturalidade = 'SP', formacao = 'SUPERIOR INCOMPLETO',
  profissao_declarada = 'ESTUDANTE, BOLSISTA, ESTAGIÁRIO E ASSEMELHADOS',
  genero = 'FEMININO', estado_civil = 'SOLTEIRO(A)', cor_raca = 'PRETA',
  fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2022 SQ 250001700018'], ultima_atualizacao = now()
where slug = 'izadora-dias';

update public.candidatos set
  nome_completo = 'Vivian Mendes da Silva', data_nascimento = date '1981-01-13',
  naturalidade = 'SP', formacao = 'SUPERIOR COMPLETO', profissao_declarada = 'RELAÇÕES-PÚBLICAS',
  genero = 'FEMININO', estado_civil = 'DIVORCIADO(A)', cor_raca = 'BRANCA',
  fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2022 SQ 250001602002'], ultima_atualizacao = now()
where slug = 'vivian-mendes';

update public.candidatos set
  data_nascimento = coalesce(data_nascimento, date '1975-06-19'), naturalidade = coalesce(naturalidade, 'RJ'),
  formacao = coalesce(formacao, 'SUPERIOR COMPLETO'), profissao_declarada = coalesce(profissao_declarada, 'SERVIDOR PÚBLICO FEDERAL'),
  cargo_atual = 'Governador de São Paulo',
  fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2022 SQ 250001615967'], ultima_atualizacao = now()
where slug = 'tarcisio-gov-sp';

update public.candidatos set cargo_atual = 'Deputado Federal', ultima_atualizacao = now()
where slug = 'guilherme-derrite';

update public.historico_politico set proveniencia = 'tse'
where candidato_id in (select id from public.candidatos where slug in (
  'vera-lucia','paulo-serra','camilo-terra','izadora-dias','vivian-mendes','tarcisio-gov-sp',
  'haddad-gov-sp','guilherme-derrite','felicio-ramuth'
)) and proveniencia is null and observacoes ilike '%TSE%';

update public.historico_politico set proveniencia = 'manual'
where candidato_id in (select id from public.candidatos where slug in (
  'tarcisio-gov-sp','haddad-gov-sp','guilherme-derrite','felicio-ramuth'
)) and proveniencia is null;
