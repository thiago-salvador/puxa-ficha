-- Item 7: despublica as 6 linhas de votação-chave da Câmara que publicam
-- afirmação errada, e os 100 pares candidato-voto delas.
--
-- ## O que cada linha tem de errado, medido em 10/08/2026
--
-- Fonte da medição: `scripts/audit/auditar-votacoes-chave.ts` contra a Câmara
-- Dados Abertos, com a régua de `scripts/lib/votacao-classificacao.ts`.
--
--   titulo                          | publicada  | votação casada | defeito
--   PL das Fake News                | 10/04/2024 | 25/04/2023     | procedimental (urgência) + data
--   Reforma Trabalhista             | 11/07/2017 | 26/04/2017     | procedimental (redação final) + data
--   Marco Temporal Indigena         | 30/05/2023 | 30/05/2023     | procedimental (redação final)
--   Auxílio Brasil (MP 1.061/2021)  | 25/11/2021 | 25/11/2021     | procedimental (redação final)
--   Teto de Gastos (EC 95)          | 13/12/2016 | 25/10/2016     | data divergente
--   Reforma da Previdência          | 10/07/2019 | 07/08/2019     | data divergente
--
-- "Procedimental" quer dizer que o que foi votado não foi o conteúdo. No caso do
-- PL das Fake News, a proposição 2256735 tem UMA votação de Plenário na fonte, a
-- `2310837-8`, descrita como "Aprovado o Requerimento de Urgência (Art. 154 do
-- RICD)". Os 13 votos publicados batem byte a byte com os dela (conferido em
-- Erika Hilton, Nikolas Ferreira e Helder Salomão). A ficha afirmava posição de
-- mérito a partir de um voto sobre regime de tramitação.
--
-- ## Por que apagar em vez de corrigir a data
--
-- Corrigir a data não conserta as quatro casadas com votação procedimental: o
-- voto gravado é sobre outra coisa. E nas duas de data divergente o matching
-- antigo não registrava QUAL votação casou, então não há como afirmar que os 20
-- e os 27 pares vieram todos da mesma rodada. Sem essa garantia, corrigir a data
-- seria trocar um erro conhecido por um erro não medido.
--
-- As matérias não somem do produto: Teto de Gastos, Reforma da Previdência e
-- marco temporal voltam pela porta certa, com `votacao_id_api` exato, quando a
-- decisão editorial de cada uma estiver fechada. Três delas estão hoje no balde
-- de leitura humana de `QA/2026-08-10-item7-decisao-editorial-v2.md`.
--
-- ## Ordem
--
-- Os votos primeiro, as votações depois: `votos_candidato.votacao_id` referencia
-- `votacoes_chave.id`.
-- SEM `BEGIN;`/`COMMIT;` próprios: o aplicador envolve migration e ledger na
-- mesma transação externa.

-- ## Pré-condições, TODAS conferidas antes da primeira exclusão
--
-- A migration é destrutiva e não é reversível por SQL. Se o banco não estiver
-- exatamente no estado medido em 10/08/2026, ela aborta sem apagar nada, em vez
-- de despublicar o que não foi medido.
--
-- Três conferências, e cada uma pega um erro diferente:
--
--   1. as 6 linhas existem, e com os metadados esperados (título, casa, data,
--      proposição). UUID que sobreviveu a um seed diferente, ou linha que foi
--      editada desde a medição, reprova aqui;
--   2. a contagem de pares por UUID bate uma a uma (20, 20, 27, 8, 12, 13). Uma
--      linha com mais votos do que o medido significa coleta nova depois da
--      auditoria, e apagar levaria junto o que ninguém conferiu;
--   3. o total é exatamente 100.
--
-- A conferência por UUID e a do total são separadas de propósito: um erro que
-- tire 5 pares de uma linha e acrescente 5 em outra passaria batido num total
-- só.

do $$
declare
  esperado constant jsonb := jsonb_build_object(
    'a7c70604-5116-4545-a2a4-a00a7761af43', jsonb_build_array('Teto de Gastos (EC 95)', 'Câmara', '2016-12-13', '2088351', 20),
    '9c1f05a7-fe8d-4c45-8827-ca23d029b1a0', jsonb_build_array('Reforma Trabalhista', 'Câmara', '2017-07-11', '2122076', 20),
    'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0', jsonb_build_array('Reforma da Previdência', 'Câmara', '2019-07-10', '2192459', 27),
    'a539c15d-20a0-4e55-876b-a7bbba7ef0d2', jsonb_build_array('Auxílio Brasil (MP 1.061/2021)', 'Câmara', '2021-11-25', '2293428', 8),
    'd652e083-aa23-4df9-a66f-433816d330cc', jsonb_build_array('Marco Temporal Indigena', 'Camara', '2023-05-30', '345311', 12),
    '86e0edac-52a5-44fe-b699-1c09aaf42a32', jsonb_build_array('PL das Fake News', 'Câmara', '2024-04-10', '2256735', 13)
  );
  chave text;
  linha jsonb;
  encontrada public.votacoes_chave%rowtype;
  pares integer;
  total_pares integer := 0;
begin
  for chave, linha in select * from jsonb_each(esperado) loop
    select * into encontrada from public.votacoes_chave where id = chave::uuid;

    if not found then
      raise exception 'pre-condicao: votacao % nao existe; o banco nao esta no estado medido em 10/08/2026', chave;
    end if;

    if encontrada.titulo is distinct from (linha ->> 0)
       or encontrada.casa is distinct from (linha ->> 1)
       or encontrada.data_votacao is distinct from (linha ->> 2)::date
       or encontrada.proposicao_id is distinct from (linha ->> 3) then
      raise exception 'pre-condicao: metadados de % divergem do medido (achado: %, %, %, %)',
        chave, encontrada.titulo, encontrada.casa, encontrada.data_votacao, encontrada.proposicao_id;
    end if;

    select count(*) into pares from public.votos_candidato where votacao_id = chave::uuid;

    if pares <> (linha ->> 4)::integer then
      raise exception 'pre-condicao: % tem % par(es), esperados %; apagar levaria junto o que ninguem conferiu',
        chave, pares, (linha ->> 4)::integer;
    end if;

    total_pares := total_pares + pares;
  end loop;

  -- Separada da soma por UUID de proposito: um erro que tire pares de uma linha
  -- e acrescente na outra fecharia o total e passaria despercebido acima.
  if total_pares <> 100 then
    raise exception 'pre-condicao: total de % pares, esperados 100', total_pares;
  end if;
end $$;

-- @write tabela=votos_candidato ref=a7c70604-5116-4545-a2a4-a00a7761af43 campos=candidato_id,votacao_id
delete from public.votos_candidato where votacao_id = 'a7c70604-5116-4545-a2a4-a00a7761af43';  -- Teto de Gastos (EC 95), 20 pares

-- @write tabela=votos_candidato ref=9c1f05a7-fe8d-4c45-8827-ca23d029b1a0 campos=candidato_id,votacao_id
delete from public.votos_candidato where votacao_id = '9c1f05a7-fe8d-4c45-8827-ca23d029b1a0';  -- Reforma Trabalhista, 20 pares

-- @write tabela=votos_candidato ref=b2aa93fb-faa1-423c-bae7-70ea6ff35fe0 campos=candidato_id,votacao_id
delete from public.votos_candidato where votacao_id = 'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0';  -- Reforma da Previdencia, 27 pares

-- @write tabela=votos_candidato ref=a539c15d-20a0-4e55-876b-a7bbba7ef0d2 campos=candidato_id,votacao_id
delete from public.votos_candidato where votacao_id = 'a539c15d-20a0-4e55-876b-a7bbba7ef0d2';  -- Auxilio Brasil (MP 1.061/2021), 8 pares

-- @write tabela=votos_candidato ref=d652e083-aa23-4df9-a66f-433816d330cc campos=candidato_id,votacao_id
delete from public.votos_candidato where votacao_id = 'd652e083-aa23-4df9-a66f-433816d330cc';  -- Marco Temporal Indigena, 12 pares

-- @write tabela=votos_candidato ref=86e0edac-52a5-44fe-b699-1c09aaf42a32 campos=candidato_id,votacao_id
delete from public.votos_candidato where votacao_id = '86e0edac-52a5-44fe-b699-1c09aaf42a32';  -- PL das Fake News, 13 pares

-- @write tabela=votacoes_chave ref=a7c70604-5116-4545-a2a4-a00a7761af43 campos=id
delete from public.votacoes_chave where id = 'a7c70604-5116-4545-a2a4-a00a7761af43';  -- Teto de Gastos (EC 95)

-- @write tabela=votacoes_chave ref=9c1f05a7-fe8d-4c45-8827-ca23d029b1a0 campos=id
delete from public.votacoes_chave where id = '9c1f05a7-fe8d-4c45-8827-ca23d029b1a0';  -- Reforma Trabalhista

-- @write tabela=votacoes_chave ref=b2aa93fb-faa1-423c-bae7-70ea6ff35fe0 campos=id
delete from public.votacoes_chave where id = 'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0';  -- Reforma da Previdencia

-- @write tabela=votacoes_chave ref=a539c15d-20a0-4e55-876b-a7bbba7ef0d2 campos=id
delete from public.votacoes_chave where id = 'a539c15d-20a0-4e55-876b-a7bbba7ef0d2';  -- Auxilio Brasil (MP 1.061/2021)

-- @write tabela=votacoes_chave ref=d652e083-aa23-4df9-a66f-433816d330cc campos=id
delete from public.votacoes_chave where id = 'd652e083-aa23-4df9-a66f-433816d330cc';  -- Marco Temporal Indigena

-- @write tabela=votacoes_chave ref=86e0edac-52a5-44fe-b699-1c09aaf42a32 campos=id
delete from public.votacoes_chave where id = '86e0edac-52a5-44fe-b699-1c09aaf42a32';  -- PL das Fake News

-- Pós-condição: nenhuma das 6 sobrou, e nenhum par órfão ficou para trás.
do $$
declare
  sobraram integer;
  pares_orfaos integer;
begin
  select count(*) into sobraram
    from public.votacoes_chave
   where id in (
     'a7c70604-5116-4545-a2a4-a00a7761af43',
     '9c1f05a7-fe8d-4c45-8827-ca23d029b1a0',
     'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0',
     'a539c15d-20a0-4e55-876b-a7bbba7ef0d2',
     'd652e083-aa23-4df9-a66f-433816d330cc',
     '86e0edac-52a5-44fe-b699-1c09aaf42a32'
   );
  if sobraram <> 0 then
    raise exception 'pos-condicao: % linha(s) de votacoes_chave sobraram', sobraram;
  end if;

  select count(*) into pares_orfaos
    from public.votos_candidato
   where votacao_id in (
     'a7c70604-5116-4545-a2a4-a00a7761af43',
     '9c1f05a7-fe8d-4c45-8827-ca23d029b1a0',
     'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0',
     'a539c15d-20a0-4e55-876b-a7bbba7ef0d2',
     'd652e083-aa23-4df9-a66f-433816d330cc',
     '86e0edac-52a5-44fe-b699-1c09aaf42a32'
   );
  if pares_orfaos <> 0 then
    raise exception 'pos-condicao: % par(es) sobraram sem votacao', pares_orfaos;
  end if;
end $$;
