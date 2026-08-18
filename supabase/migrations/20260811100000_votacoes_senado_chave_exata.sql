-- Item 7: reconcilia as 13 linhas do Senado com eventos nominais exatos.
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
where id in ('7e1bef47-3d91-4c7a-8f94-fa323c6bd5f1'::uuid, '539f836a-197b-4176-9861-d58759a5c73b'::uuid, '8d470dc1-3215-4af0-86b1-8405e31ae903'::uuid, 'b3dce7a7-bb51-4d96-8aa2-ee0240f76cf0'::uuid, '05104fa6-e50a-46ed-9847-7f20d1637dab'::uuid, 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, '6f1e4c1e-bf51-4a52-a2c1-98722dd6fe5d'::uuid)
  and auditoria.ref = 'senado-retirar-7';

-- @write tabela=votacoes_chave ref=6046 campos=fonte,votacao_id_api,proposicao_id,data_votacao
update public.votacoes_chave
set fonte = 'senado', votacao_id_api = '6046', proposicao_id = '137999', data_votacao = '2019-10-22'::date
where id = '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid;

-- @write tabela=votacoes_chave ref=6248 campos=fonte,votacao_id_api,proposicao_id,data_votacao
update public.votacoes_chave
set fonte = 'senado', votacao_id_api = '6248', proposicao_id = '135147', data_votacao = '2020-11-03'::date
where id = 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid;

-- @write tabela=votacoes_chave ref=6377 campos=fonte,votacao_id_api,proposicao_id,data_votacao
update public.votacoes_chave
set fonte = 'senado', votacao_id_api = '6377', proposicao_id = '146740', data_votacao = '2021-06-16'::date
where id = 'e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid;

-- @write tabela=votacoes_chave ref=6714 campos=fonte,votacao_id_api,proposicao_id,data_votacao
update public.votacoes_chave
set fonte = 'senado', votacao_id_api = '6714', proposicao_id = '157826', data_votacao = '2023-06-21'::date
where id = 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid;

-- @write tabela=votacoes_chave ref=6756 campos=fonte,votacao_id_api,proposicao_id,data_votacao
update public.votacoes_chave
set fonte = 'senado', votacao_id_api = '6756', proposicao_id = '157888', data_votacao = '2023-09-27'::date
where id = '7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid;

-- @write tabela=votacoes_chave ref=6777 campos=fonte,votacao_id_api,proposicao_id,data_votacao
update public.votacoes_chave
set fonte = 'senado', votacao_id_api = '6777', proposicao_id = '158930', data_votacao = '2023-11-08'::date
where id = 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid;

-- @write tabela=votos_candidato ref=senado-exatos-75 campos=candidato_id,votacao_id,voto
insert into public.votos_candidato (candidato_id, votacao_id, voto)
with auditoria(ref) as (values ('senado-exatos-75')),
curadoria(votacao_id, slug, voto) as (values
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'flavio-bolsonaro', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'flavio-bolsonaro', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'flavio-bolsonaro', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'flavio-bolsonaro', 'não'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'flavio-bolsonaro', 'não'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'sergio-moro-gov-pr', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'sergio-moro-gov-pr', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sergio-moro-gov-pr', 'não'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'jorginho-mello', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'jorginho-mello', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'jorginho-mello', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'cleitinho', 'não'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'cleitinho', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'cleitinho', 'não'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'rodrigo-pacheco', 'sim'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'eduardo-girao', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'eduardo-girao', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'eduardo-girao', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'eduardo-girao', 'não'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'eduardo-girao', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'eduardo-girao', 'não'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'efraim-filho', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'efraim-filho', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'efraim-filho', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'alan-rick', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'alan-rick', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'alan-rick', 'sim'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'mailza-assis', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'mailza-assis', 'sim'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'omar-aziz', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'omar-aziz', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'omar-aziz', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'omar-aziz', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'omar-aziz', 'não'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'omar-aziz', 'sim'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'eduardo-braga', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'eduardo-braga', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'eduardo-braga', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'eduardo-braga', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'eduardo-braga', 'não'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'eduardo-braga', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'beto-faro', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'beto-faro', 'não'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'beto-faro', 'sim'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'marcos-rogerio', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'marcos-rogerio', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'marcos-rogerio', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'marcos-rogerio', 'não'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'marcos-rogerio', 'sim'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'confucio-moura', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'confucio-moura', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'confucio-moura', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'confucio-moura', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'confucio-moura', 'não'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'confucio-moura', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'professora-dorinha', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'professora-dorinha', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'professora-dorinha', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'wilder-morais', 'não'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'wilder-morais', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'wilder-morais', 'não'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'wellington-fagundes', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'wellington-fagundes', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'wellington-fagundes', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'wellington-fagundes', 'não'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'wellington-fagundes', 'não'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'magno-malta', 'não'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'magno-malta', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'magno-malta', 'não'),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'jayme-campos', 'sim'),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'jayme-campos', 'sim'),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'jayme-campos', 'sim'),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'jayme-campos', 'sim'),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'jayme-campos', 'sim'),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'jayme-campos', 'sim')
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
