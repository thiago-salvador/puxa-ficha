-- 20261001100000_cpf_removido_motivo_trajetoria.sql
-- APROVADO, NAO APLICADO. Allowlist:
-- scripts/audit/allowlist-cpf-removido-motivo-trajetoria-20261001.json
-- (recorte cpf-removido-motivo-trajetoria-20261001).
--
-- A migration 20260918120000 (issue #378) despublicou sete linhas de
-- `mudancas_partido` de andre-do-prado com um `despublicacao_motivo` que citava
-- dois CPFs. O repositorio e publico e o gate `audit:cpf-versionado:gate` passa
-- a exigir zero CPF em arquivo versionado, entao o literal daquela migration foi
-- reescrito com o marcador "[CPF removido]". Esta migration converge as sete
-- linhas ja gravadas em producao para o mesmo texto, de modo que producao e um
-- replay novo terminam com o mesmo valor.
--
-- So texto: `despublicado_em` e todas as outras colunas ficam como estao. A
-- identidade das linhas e fechada pelos sete ids da 20260918120000 e pela forma
-- exata do texto antigo: trocar cada "CPF <11 digitos>" pelo marcador precisa
-- produzir exatamente o texto novo, com duas trocas por linha. Este arquivo nao
-- carrega o CPF nem hash dele.
--
-- Idempotente: linha que ja tem o texto novo conta como convergida e nao e
-- reescrita. Pos-condicao: nenhuma linha de `mudancas_partido` pode seguir com
-- CPF de digito verificador valido em `despublicacao_motivo`.
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow apply-cpf-removido-motivo-trajetoria-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.mudancas_partido IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.coleta_log IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_cpf_motivo_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _pf_cpf_motivo_ids (id) VALUES
  ('e0c26051-9de3-4135-86fb-f9ba72028a30'),
  ('4d71e1ab-10fb-4d57-8bb3-b118cdd404e7'),
  ('3df17e2a-4fb3-4701-9e74-69c8e9f8ce4c'),
  ('db46d0a9-a822-4029-9007-62b7da0155a1'),
  ('9120d6d7-5010-4709-99de-a76422250fbf'),
  ('fd2ff3cd-9323-4022-9692-138e98f7788f'),
  ('8d36bb5a-1e41-4788-b17c-cbd9dd854fa9');

DO $apply$
DECLARE
  n integer;
  antigas integer;
  convergidas integer;
  r record;
  d text;
  soma integer;
  dv1 integer;
  dv2 integer;
  -- Mesmo texto que a 20260918120000 grava em replay novo.
  motivo_novo constant text := 'Trajetoria derivada de homonimo: as linhas vieram de ANDRE LUIS DO PRADO CPF [CPF removido] (PSTU, Ribeirao Preto, 2000/2004/2012), pessoa distinta do titular desta ficha, CPF [CPF removido] (Guararema e ALESP). Conferido em 18/09/2026 nos pacotes consulta_cand do TSE de 1996 a 2024. O titular nunca trocou de partido: PL e PR sao a mesma legenda, entao a derivacao vigente emite zero mudancas. Issue #378, violacao R8_reversao_mesmo_ano. Reversivel: linhas preservadas.';
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'cpf-motivo: apenas replay descartavel; sem escrita';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'cpf-motivo: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  -- Preimagem: as sete linhas existem, sao de andre-do-prado, seguem
  -- despublicadas na data da #378 e cada uma tem o texto antigo (duas trocas
  -- que levam ao texto novo) ou ja o texto novo.
  IF (SELECT count(*) FROM _pf_cpf_motivo_ids) <> 7 THEN
    RAISE EXCEPTION 'cpf-motivo: lista fechada de ids divergiu';
  END IF;

  SELECT
    count(*) FILTER (
      WHERE m.despublicacao_motivo <> motivo_novo
        AND regexp_replace(m.despublicacao_motivo, 'CPF [0-9]{11}(?![0-9])', 'CPF [CPF removido]', 'g') = motivo_novo
        AND (SELECT count(*) FROM regexp_matches(m.despublicacao_motivo, 'CPF [0-9]{11}(?![0-9])', 'g')) = 2),
    count(*) FILTER (WHERE m.despublicacao_motivo = motivo_novo)
  INTO antigas, convergidas
  FROM _pf_cpf_motivo_ids e
  JOIN public.mudancas_partido m ON m.id = e.id
  JOIN public.candidatos c ON c.id = m.candidato_id AND c.slug = 'andre-do-prado'
  WHERE m.despublicado_em = timestamptz '2026-09-18T00:00:00Z';

  IF antigas + convergidas <> 7 THEN
    RAISE EXCEPTION 'cpf-motivo: preimagem divergiu (antigas=%, convergidas=%, esperadas 7)', antigas, convergidas;
  END IF;

  -- @write tabela=mudancas_partido slug=andre-do-prado campos=despublicacao_motivo
  UPDATE public.mudancas_partido m
  SET despublicacao_motivo = motivo_novo
  FROM _pf_cpf_motivo_ids e, public.candidatos c
  WHERE m.id = e.id
    AND c.id = m.candidato_id
    AND c.slug = 'andre-do-prado'
    AND m.despublicado_em = timestamptz '2026-09-18T00:00:00Z'
    AND m.despublicacao_motivo <> motivo_novo
    AND regexp_replace(m.despublicacao_motivo, 'CPF [0-9]{11}(?![0-9])', 'CPF [CPF removido]', 'g') = motivo_novo;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> antigas THEN
    RAISE EXCEPTION 'cpf-motivo: linhas reescritas esperadas=% atuais=%', antigas, n;
  END IF;

  -- @write tabela=coleta_log ref=migration:20261001100000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'auditoria-cpf-versionado', 'global', 'mudancas_partido.despublicacao_motivo', 'encontrado', n,
         jsonb_build_object(
           'resumo', 'CPF trocado por "[CPF removido]" no motivo de despublicacao das sete linhas de trajetoria de andre-do-prado (issue #378); despublicado_em e demais colunas intactos.',
           'reescritas', n,
           'ja_convergidas', convergidas,
           'ids', (SELECT jsonb_agg(id ORDER BY id) FROM _pf_cpf_motivo_ids)
         )::text,
         'https://github.com/thiago-salvador/puxa-ficha/pull/640',
         'migration:20261001100000', 'escrita'
  WHERE NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20261001100000');

  -- Pos-condicao 1: as sete linhas tem o texto novo e seguem despublicadas.
  IF (SELECT count(*) FROM _pf_cpf_motivo_ids e
        JOIN public.mudancas_partido m ON m.id = e.id
       WHERE m.despublicacao_motivo = motivo_novo
         AND m.despublicado_em = timestamptz '2026-09-18T00:00:00Z') <> 7
  THEN
    RAISE EXCEPTION 'cpf-motivo: pos-condicao das sete linhas falhou';
  END IF;

  -- Pos-condicao 2: nenhum CPF de digito verificador valido, cru ou
  -- formatado, em qualquer `despublicacao_motivo` da tabela.
  FOR r IN
    SELECT regexp_replace(x[1], '[^0-9]', '', 'g') AS digitos
    FROM public.mudancas_partido m,
         regexp_matches(m.despublicacao_motivo,
           '(?<![0-9])([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2})(?![0-9])', 'g') AS x
    WHERE m.despublicacao_motivo IS NOT NULL
  LOOP
    d := r.digitos;
    CONTINUE WHEN length(d) <> 11 OR d ~ '^(\d)\1{10}$';
    soma := 0;
    FOR i IN 1..9 LOOP soma := soma + substr(d, i, 1)::integer * (11 - i); END LOOP;
    dv1 := (soma * 10) % 11; IF dv1 = 10 THEN dv1 := 0; END IF;
    soma := 0;
    FOR i IN 1..10 LOOP soma := soma + substr(d, i, 1)::integer * (12 - i); END LOOP;
    dv2 := (soma * 10) % 11; IF dv2 = 10 THEN dv2 := 0; END IF;
    IF dv1 = substr(d, 10, 1)::integer AND dv2 = substr(d, 11, 1)::integer THEN
      RAISE EXCEPTION 'cpf-motivo: despublicacao_motivo ainda contem CPF valido';
    END IF;
  END LOOP;
END
$apply$;

COMMIT;
