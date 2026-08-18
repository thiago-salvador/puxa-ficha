-- RR state completion: canonical identity fixes and provenance cleanup.

update public.candidatos
set nome_completo = 'Antônia Pedrosa Vieira',
    data_nascimento = date '1979-06-29',
    naturalidade = 'RR',
    formacao = 'SUPERIOR COMPLETO',
    profissao_declarada = 'PROFESSOR DE ENSINO MÉDIO',
    genero = 'FEMININO',
    estado_civil = 'CASADO(A)',
    cor_raca = 'PRETA',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2020 e 2022'],
    ultima_atualizacao = now()
where slug = 'antonia-pedrosa';

update public.candidatos
set nome_completo = 'Arthur Henrique Brandão Machado',
    data_nascimento = date '1981-08-19',
    naturalidade = 'RR',
    formacao = 'SUPERIOR INCOMPLETO',
    profissao_declarada = 'OUTROS',
    genero = 'MASCULINO',
    estado_civil = 'SOLTEIRO(A)',
    cor_raca = 'PARDA',
    biografia = 'Arthur Henrique Brandão Machado é político brasileiro. Foi eleito vice-prefeito de Boa Vista em 2016 e prefeito em 2020, conforme o Repositório de Dados Eleitorais do TSE.',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2016 e 2020'],
    ultima_atualizacao = now()
where slug = 'arthur-henrique';

update public.candidatos
set nome_completo = 'Edilson Damião Lima',
    data_nascimento = date '1977-12-13',
    naturalidade = 'PR',
    formacao = 'SUPERIOR COMPLETO',
    profissao_declarada = 'ENGENHEIRO',
    genero = 'MASCULINO',
    estado_civil = 'CASADO(A)',
    cor_raca = 'PARDA',
    cargo_atual = null,
    biografia = 'Edilson Damião Lima é engenheiro e político brasileiro. Foi eleito vice-governador de Roraima em 2022 pelo Republicanos; o TSE cassou a chapa em 2026 e determinou nova eleição.',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2022', 'TSE decisão de 30/04/2026'],
    ultima_atualizacao = now()
where slug = 'edilson-damiao';

update public.candidatos
set nome_completo = 'Maria Teresa Saenz Surita Guimarães',
    data_nascimento = date '1956-08-14',
    naturalidade = 'SP',
    formacao = 'SUPERIOR COMPLETO',
    profissao_declarada = 'ADMINISTRADOR',
    genero = 'FEMININO',
    estado_civil = 'CASADO(A)',
    cor_raca = 'BRANCA',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2022'],
    ultima_atualizacao = now()
where slug = 'teresa-surita';

-- Remove the 2018 homonym incorrectly associated with Arthur Henrique Brandão Machado.
delete from public.historico_politico
where candidato_id = (select id from public.candidatos where slug = 'arthur-henrique')
  and periodo_inicio = 2018
  and cargo ilike '%Deputado Estadual%';

delete from public.patrimonio
where candidato_id = (select id from public.candidatos where slug = 'arthur-henrique')
  and ano_eleicao = 2018;

delete from public.financiamento
where candidato_id = (select id from public.candidatos where slug = 'arthur-henrique')
  and ano_eleicao = 2018;

-- The remaining election-history rows are directly represented in TSE consulta_cand.
update public.historico_politico
set proveniencia = 'tse'
where candidato_id in (
  select id from public.candidatos where slug in ('arthur-henrique', 'edilson-damiao', 'teresa-surita')
)
  and observacoes ilike '%TSE%';

-- Remove the duplicate non-primary Teresa row; the TSE-backed 2012/2016 mandates remain.
delete from public.historico_politico
where id = '17f58e08-e201-477f-94a1-2b3c63ff4d5f';

update public.historico_politico
set periodo_fim = 2026,
    proveniencia = 'tse',
    observacoes = 'Exercício encerrado em 2026 após decisão do TSE que cassou a chapa e determinou nova eleição.'
where candidato_id = (select id from public.candidatos where slug = 'edilson-damiao')
  and cargo = 'Governador'
  and periodo_inicio = 2026;

-- Generated generic points contradicted the now-verified municipal/state histories.
update public.pontos_atencao
set visivel = false
where candidato_id in (
  select id from public.candidatos where slug in ('arthur-henrique', 'edilson-damiao', 'teresa-surita')
)
  and gerado_por = 'ia'
  and coalesce(verificado, false) = false;
