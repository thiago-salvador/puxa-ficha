-- Correção pontual da ocupação declarada: SENADOR -> MÉDICO.
-- Identidade TSE 2026: SQ 200002534442, ÁLVARO COSTA DIAS, GOVERNADOR/RN,
-- CD_OCUPACAO 111. consulta_cand_2026.zip gerado em 04/09/2026 16:30:46.
-- SHA256 a2e593639affda48223ce179ccdca792da927c729e968bf14de7b80002a586ae.
-- A origem histórica de SENADOR não foi determinada; não atribuir ao Wikidata.
-- Censo completo: docs/reviews/2026-09-04-profissao-tse-2026.md.
-- Fronteira externa única, removida pelo driver da convenção 20260903220000
-- para incorporar dado, recibo, ledger e readback na mesma transação.
BEGIN;

DO $corrigir$
DECLARE
  c public.candidatos%ROWTYPE;
  recibo jsonb;
  quantidade integer;
  instante timestamptz := transaction_timestamp();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug='alvaro-dias-rn') THEN
    RAISE NOTICE 'profissao alvaro-dias-rn: ficha ausente, replay sem escrita';
    RETURN;
  END IF;
  SELECT * INTO c FROM public.candidatos WHERE slug='alvaro-dias-rn' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profissao alvaro-dias-rn: ficha mudou durante leitura'; END IF;
  IF c.id <> 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid
     OR c.sq_candidato_2026 IS DISTINCT FROM '200002534442'
     OR c.nome_completo IS DISTINCT FROM 'Alvaro Costa Dias'
     OR c.cargo_disputado IS DISTINCT FROM 'Governador'
     OR c.estado IS DISTINCT FROM 'RN'
     OR NOT EXISTS (SELECT 1 FROM public.candidatos_publico WHERE id=c.id) THEN
    RAISE EXCEPTION 'profissao alvaro-dias-rn: identidade/publicacao divergiu';
  END IF;
  SELECT count(*) INTO quantidade FROM public.coleta_log WHERE execucao='migration:20260904220000';
  IF quantidade > 0 THEN
    SELECT detalhe::jsonb INTO recibo FROM public.coleta_log WHERE execucao='migration:20260904220000';
    IF quantidade <> 1 OR c.profissao_declarada IS DISTINCT FROM 'MÉDICO'
       OR c.ultima_atualizacao IS DISTINCT FROM (recibo->>'aplicado_em')::timestamptz
       OR md5((to_jsonb(c)-'profissao_declarada'-'ultima_atualizacao')::text) IS DISTINCT FROM recibo->>'campos_preservados_md5' THEN
      RAISE EXCEPTION 'profissao alvaro-dias-rn: recibo/posestado divergiu';
    END IF;
    RETURN;
  END IF;
  IF c.profissao_declarada IS DISTINCT FROM 'SENADOR' THEN
    RAISE EXCEPTION 'profissao alvaro-dias-rn: preestado nao e SENADOR';
  END IF;
  recibo := jsonb_build_object(
    'id',c.id,'slug',c.slug,'sq_candidato_2026',c.sq_candidato_2026,
    'antes',jsonb_build_object('profissao_declarada',c.profissao_declarada,'ultima_atualizacao',c.ultima_atualizacao),
    'depois','MÉDICO','aplicado_em',instante,
    'campos_preservados_md5',md5((to_jsonb(c)-'profissao_declarada'-'ultima_atualizacao')::text),
    'fonte_codigo_ocupacao','111','fonte_ano',2026,
    'fonte_sha256','a2e593639affda48223ce179ccdca792da927c729e968bf14de7b80002a586ae'
  );
  -- @write tabela=coleta_log ref=migration:20260904220000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log(fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES('profissao-tse-2026','candidato','candidatos.profissao_declarada',c.id,'encontrado',1,recibo::text,
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','migration:20260904220000','escrita');
  -- @write tabela=candidatos slug=alvaro-dias-rn campos=profissao_declarada,ultima_atualizacao
  UPDATE public.candidatos SET profissao_declarada='MÉDICO',ultima_atualizacao=instante
  WHERE id=c.id AND slug='alvaro-dias-rn' AND profissao_declarada='SENADOR';
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'profissao alvaro-dias-rn: cardinalidade divergiu'; END IF;
END
$corrigir$;

COMMIT;
