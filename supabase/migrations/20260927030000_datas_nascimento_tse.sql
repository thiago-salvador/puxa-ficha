-- Cinco fichas com data de nascimento diferente da que o TSE registra para a
-- mesma pessoa. Fonte: pacotes consulta_cand do TSE Dados Abertos
-- (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip),
-- lidos em 2026-09-26. Em cada ficha, todas as inscrições têm o mesmo CPF, o
-- mesmo título eleitoral, o mesmo nome civil, a mesma UF e a mesma data.
--
--   dr-daniel             1979-02-16 -> 1986-08-25  DANIEL BARBOSA SANTOS, PA:
--                         SQ 140000012315 (2012), 140000012852 (2016),
--                         140000614283 (2018), 140001027099 (2020),
--                         140002359059 (2024), 140002549930 (2026, a inscrição da ficha)
--                         naturalidade Vassouras/RJ -> Açailândia/MA: o
--                         consulta_cand_complementar_2026 registra
--                         NM_MUNICIPIO_NASCIMENTO "AÇAILÂNDIA" para o SQ 140002549930 e o
--                         consulta_cand 2024/2026 SG_UF_NASCIMENTO "MA".
--                         Origem dos dois valores errados: a ficha chegou a ser ligada
--                         ao deputado federal 220614 da Câmara (DANIEL RICARDO SORANZ
--                         PINTO, "Dr. Daniel Soranz", RJ), cujo cadastro na Câmara traz
--                         municipioNascimento Vassouras, ufNascimento RJ e dataNascimento
--                         1979-02-16; o ingest da Câmara gravou os três na ficha.
--   gabriel-azevedo       1989-02-16 -> 1986-03-12  GABRIEL SOUSA MARQUES DE AZEVEDO, MG:
--                         SQ 130000084647 (2016), 130000704273 (2020),
--                         130002074700 (2024), 130002549557 (2026, a inscrição da ficha)
--   hildon-chaves         1968-01-01 -> 1968-05-25  HILDON DE LIMA CHAVES, RO:
--                         SQ 220000000876 (2016), 220001051415 (2020),
--                         220002542916 (2026, a inscrição da ficha). 1968-01-01 é data só com ano.
--   silvio-mendes         1976-04-02 -> 1949-08-31  SILVIO MENDES DE OLIVEIRA FILHO, PI:
--                         SQ 347 (2004, Teresina), 4683 (2008, Teresina; o número
--                         se repete em outras UFs naquele pacote), 180000000098 (2010),
--                         180000000045 (2014), 180001600497 (2022), 180001882991 (2024).
--                         Ficha não pública. A biografia repetia o ano errado e uma UF
--                         de nascimento (PR) que o TSE não registra (PI): sai só a
--                         oração ", nascido em 1976, natural de PR"; nenhum texto novo.
--   tse-2026-20002553726  1900-01-01 -> 1949-07-08  JOSE WANDERLEY NETO, AL:
--                         SQ 20002553726 (2026, a inscrição da ficha); a mesma data
--                         aparece em 2002 (351), 2006 (10236) e 2022 (20001653521).
--                         1900-01-01 é a sentinela que a API do Senado devolve para o
--                         parlamentar 3613, sem data cadastrada.
--
-- Escrita: candidatos.data_nascimento das cinco fichas, candidatos.biografia de
-- silvio-mendes e candidatos.naturalidade de dr-daniel. CAS pela preimagem medida em 2026-09-26 (slug, id, nome civil,
-- UF, SQ de 2026 e data atual). Snapshot integral em
-- identidade_timeline_quarentena_snapshot; o recibo em coleta_log guarda só os
-- campos alterados.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-datas-nascimento-tse-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_nascimento_tse_20260926 (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  nome_completo text NOT NULL,
  estado text NOT NULL,
  sq_2026 text,
  nasc_antes date NOT NULL,
  nasc_depois date NOT NULL,
  bio_antes text,
  bio_depois text,
  nat_antes text,
  nat_depois text
) ON COMMIT DROP;

INSERT INTO _pf_nascimento_tse_20260926
  (id, slug, nome_completo, estado, sq_2026, nasc_antes, nasc_depois, bio_antes, bio_depois, nat_antes, nat_depois)
VALUES
  ('dcc4a93e-4114-43e9-b067-4581ed12cfd5', 'dr-daniel', 'Daniel Barbosa Santos', 'PA', '140002549930',
   DATE '1979-02-16', DATE '1986-08-25', NULL, NULL, 'Vassouras/RJ', 'Açailândia/MA'),
  ('2081565f-e38d-4246-81d6-4f28979e8136', 'gabriel-azevedo', 'Gabriel Sousa Marques de Azevedo', 'MG', '130002549557',
   DATE '1989-02-16', DATE '1986-03-12', NULL, NULL, NULL, NULL),
  ('5a325c79-3414-4d70-8926-673e91cbd578', 'hildon-chaves', 'Hildon de Lima Chaves', 'RO', '220002542916',
   DATE '1968-01-01', DATE '1968-05-25', NULL, NULL, NULL, NULL),
  ('1191e8d3-da51-4724-a1b6-ed577406cf9d', 'silvio-mendes', 'Silvio Mendes de Oliveira Filho', 'PI', NULL,
   DATE '1976-04-02', DATE '1949-08-31',
   'Silvio Mendes de Oliveira Filho (UNIAO) e pre-candidato(a) ao governo de PI. Com ensino superior completo, nascido em 1976, natural de PR.',
   'Silvio Mendes de Oliveira Filho (UNIAO) e pre-candidato(a) ao governo de PI. Com ensino superior completo.', NULL, NULL),
  ('e55a7e1a-e3db-4b01-8f11-c89da7a2e524', 'tse-2026-20002553726', 'JOSE WANDERLEY NETO', 'AL', '20002553726',
   DATE '1900-01-01', DATE '1949-07-08', NULL, NULL, NULL, NULL);

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-26T23:30:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos c JOIN _pf_nascimento_tse_20260926 u ON u.id = c.id) THEN
    RAISE NOTICE 'nascimento-tse-20260926: fichas ausentes; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'nascimento-tse-20260926: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT md5(bio_antes) FROM _pf_nascimento_tse_20260926 WHERE slug = 'silvio-mendes') <> 'bda74c11674c4758118fb2167e8f577e'
     OR (SELECT md5(bio_depois) FROM _pf_nascimento_tse_20260926 WHERE slug = 'silvio-mendes') <> '9166d6ad078f6e5d688c6e52641e8cbe'
  THEN
    RAISE EXCEPTION 'nascimento-tse-20260926: literais da biografia divergiram';
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       JOIN _pf_nascimento_tse_20260926 u ON u.id = c.id
       WHERE c.slug = u.slug
         AND c.nome_completo = u.nome_completo
         AND c.estado = u.estado
         AND c.sq_candidato_2026 IS NOT DISTINCT FROM u.sq_2026
         AND c.data_nascimento = u.nasc_antes
         AND (u.bio_antes IS NULL OR c.biografia = u.bio_antes)
         AND (u.nat_antes IS NULL OR c.naturalidade = u.nat_antes)) <> 5
  THEN
    RAISE EXCEPTION 'nascimento-tse-20260926: preimagem das cinco fichas divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=nascimento-tse-20260926 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'nascimento-tse-20260926','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c)
           || jsonb_build_object('data_nascimento', to_char(u.nasc_depois, 'YYYY-MM-DD'))
           || CASE WHEN u.bio_depois IS NULL THEN '{}'::jsonb
                   ELSE jsonb_build_object('biografia', u.bio_depois) END
           || CASE WHEN u.nat_depois IS NULL THEN '{}'::jsonb
                   ELSE jsonb_build_object('naturalidade', u.nat_depois) END,
         verificado_em
  FROM public.candidatos c
  JOIN _pf_nascimento_tse_20260926 u ON u.id = c.id
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=dr-daniel campos=data_nascimento,naturalidade
  -- @write tabela=candidatos slug=gabriel-azevedo campos=data_nascimento
  -- @write tabela=candidatos slug=hildon-chaves campos=data_nascimento
  -- @write tabela=candidatos slug=silvio-mendes campos=data_nascimento,biografia
  -- @write tabela=candidatos slug=tse-2026-20002553726 campos=data_nascimento
  UPDATE public.candidatos c
  SET data_nascimento = (s.postimage->>'data_nascimento')::date,
      biografia = s.postimage->>'biografia',
      naturalidade = s.postimage->>'naturalidade'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'nascimento-tse-20260926'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug IN ('dr-daniel','gabriel-azevedo','hildon-chaves','silvio-mendes','tse-2026-20002553726')
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 5 THEN
    RAISE EXCEPTION 'nascimento-tse-20260926: escrita esperada=5 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260927030000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-consulta-cand','global',
         'candidatos.data_nascimento,candidatos.biografia,candidatos.naturalidade',
         'encontrado', 5,
         jsonb_build_object(
           'resumo','Data de nascimento de cinco fichas igualada ao TSE consulta_cand (mesmo CPF, titulo, nome civil e UF em todas as inscricoes): dr-daniel, gabriel-azevedo, hildon-chaves, silvio-mendes e tse-2026-20002553726. Biografia de silvio-mendes sem a oracao com ano e UF de nascimento errados. Naturalidade de dr-daniel pelo consulta_cand_complementar_2026 (Acailandia/MA), no lugar da do deputado homonimo 220614 da Camara (Vassouras/RJ).',
           'linhas', jsonb_agg(jsonb_build_object(
             'id', c.id,
             'slug', u.slug,
             'before', jsonb_build_object('data_nascimento', s.preimage->'data_nascimento', 'biografia', s.preimage->'biografia', 'naturalidade', s.preimage->'naturalidade'),
             'after', jsonb_build_object('data_nascimento', to_jsonb(c)->'data_nascimento', 'biografia', to_jsonb(c)->'biografia', 'naturalidade', to_jsonb(c)->'naturalidade'))
             ORDER BY u.slug)
         )::text,
         'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
         'migration:20260927030000','escrita'
  FROM public.candidatos c
  JOIN _pf_nascimento_tse_20260926 u ON u.id = c.id
  JOIN public.identidade_timeline_quarentena_snapshot s
    ON s.migration_version = 'nascimento-tse-20260926' AND s.tabela = 'candidatos' AND s.row_id = c.id
  HAVING NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260927030000');

  IF (SELECT count(*) FROM public.candidatos c
       JOIN _pf_nascimento_tse_20260926 u ON u.id = c.id
       WHERE c.data_nascimento = u.nasc_depois
         AND (u.bio_depois IS NULL OR c.biografia = u.bio_depois)
         AND (u.nat_depois IS NULL OR c.naturalidade = u.nat_depois)) <> 5
  THEN
    RAISE EXCEPTION 'nascimento-tse-20260926: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
